package main

import (
	"context"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) (string, []byte) {
	t.Helper()
	b, e := os.ReadFile("config.example.yaml")
	if e != nil {
		t.Fatal(e)
	}
	p := filepath.Join(t.TempDir(), "config.yaml")
	if e = os.WriteFile(p, b, 0600); e != nil {
		t.Fatal(e)
	}
	return p, b
}
func TestConfigSearchAndValidation(t *testing.T) {
	p, b := fixture(t)
	s, e := loadConfig(p)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(s.Config.Services[3].Search, "xiazaizhongxin") || !strings.Contains(s.Config.Services[3].Search, "xzzx") {
		t.Fatal("missing pinyin/full initials search")
	}
	changedOrigins := strings.Replace(string(b), "allowed_origins: []", `allowed_origins: ["https://nav.example.com"]`, 1)
	os.WriteFile(p, []byte(changedOrigins), 0600)
	withOrigins, err := loadConfig(p)
	if err != nil || withOrigins.ETag == s.ETag {
		t.Fatal("server-only CORS changes must trigger reload")
	}
	cases := []string{strings.Replace(string(b), "version: 1", "version: 2", 1), string(b) + "\nunknown: true\n", strings.Replace(string(b), "https://github.com", "javascript:alert(1)", 1), strings.Replace(string(b), "probe_url: \"\"", "probe_url: https://public.example.com/api/probe", 1), string(b) + "\n---\nversion: 1\n"}
	for _, text := range cases {
		os.WriteFile(p, []byte(text), 0600)
		if _, err := loadConfig(p); err == nil {
			t.Errorf("accepted invalid YAML: %.90s", text)
		}
	}
}
func TestWatchPreservesValidSnapshot(t *testing.T) {
	p, b := fixture(t)
	s, _ := loadConfig(p)
	a := &app{clients: map[chan struct{}]bool{}}
	a.publish(s)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if e := a.watch(ctx, p); e != nil {
		t.Fatal(e)
	}
	os.WriteFile(p, []byte("invalid: ["), 0600)
	time.Sleep(300 * time.Millisecond)
	if a.current.Load().ETag != s.ETag {
		t.Fatal("invalid update replaced state")
	}
	// Exercise the atomic rename workflow used by AI editors, not only in-place writes.
	next := p + ".tmp"
	os.WriteFile(next, []byte(strings.Replace(string(b), "title: 导航", "title: 新导航", 1)), 0600)
	if e := os.Rename(next, p); e != nil {
		t.Fatal(e)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if a.current.Load().Config.Title == "新导航" {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("valid atomic update not loaded")
}
func TestProbeOriginAndLANBoundary(t *testing.T) {
	p, _ := fixture(t)
	s, _ := loadConfig(p)
	s.Config.Network.AllowedOrigins = []string{"https://nav.example.com"}
	a := &app{clients: map[chan struct{}]bool{}}
	a.publish(s)
	for _, tc := range []struct {
		host, peer, origin string
		want               int
	}{{"192.168.1.10:8787", "192.168.1.2:1234", "https://nav.example.com", 200}, {"192.168.1.10:8787", "192.168.1.2:1234", "https://evil.example", 403}, {"nav.example.com", "192.168.1.2:1234", "https://nav.example.com", 403}, {"192.168.1.10:8787", "8.8.8.8:1234", "https://nav.example.com", 403}} {
		r := httptest.NewRequest("GET", "http://"+tc.host+"/api/probe", nil)
		r.RemoteAddr = tc.peer
		r.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		a.probe(w, r)
		if w.Code != tc.want {
			t.Errorf("%+v: got %d", tc, w.Code)
		}
		if w.Code == 200 && (w.Header().Get("Access-Control-Allow-Origin") != tc.origin || w.Body.String() != "blueport:blueport-home") {
			t.Fatal("probe identity/CORS incorrect")
		}
	}
}
func TestHTTPConfigCacheAndAssets(t *testing.T) {
	p, _ := fixture(t)
	s, _ := loadConfig(p)
	a := &app{clients: map[chan struct{}]bool{}}
	a.publish(s)
	h := a.handler()
	r := httptest.NewRequest("GET", "/api/config", nil)
	r.Header.Set("If-None-Match", s.ETag)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 304 {
		t.Fatal(w.Code)
	}
	r = httptest.NewRequest("GET", "/style.css", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("static compression missing")
	}
	for _, path := range []string{"/config.example.yaml", "/.git/config", "/api/missing"} {
		w = httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 404 {
			t.Fatal("private path accessible: " + path)
		}
	}
}
func TestEventsNotifyOnChange(t *testing.T) {
	p, _ := fixture(t)
	s, _ := loadConfig(p)
	a := &app{clients: map[chan struct{}]bool{}}
	a.publish(s)
	server := httptest.NewServer(a.handler())
	defer server.Close()
	client := server.Client()
	client.Timeout = 2 * time.Second
	res, e := client.Get(server.URL + "/api/events")
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	b := make([]byte, 128)
	n, e := res.Body.Read(b)
	if e != nil && e != io.EOF {
		t.Fatal(e)
	}
	if !strings.Contains(string(b[:n]), s.ETag) {
		t.Fatal("initial version missing")
	}
	copy := *s
	copy.ETag = `"new-version"`
	a.publish(&copy)
	n, e = res.Body.Read(b)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(string(b[:n]), "new-version") {
		t.Fatal("change not delivered")
	}
}
