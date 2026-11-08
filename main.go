package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/fsnotify/fsnotify"
)

//go:embed web
var embedded embed.FS

type app struct {
	current atomic.Pointer[Snapshot]
	mu      sync.Mutex
	clients map[chan struct{}]bool
}

func (a *app) publish(s *Snapshot) {
	a.current.Store(s)
	a.mu.Lock()
	defer a.mu.Unlock()
	for c := range a.clients {
		select {
		case c <- struct{}{}:
		default:
		}
	}
}
func (a *app) watch(ctx context.Context, path string) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	if err = w.Add(filepath.Dir(path)); err != nil {
		w.Close()
		return err
	}
	go func() {
		defer w.Close()
		var timer *time.Timer
		var tick <-chan time.Time
		for {
			select {
			case <-ctx.Done():
				if timer != nil {
					timer.Stop()
				}
				return
			case e, ok := <-w.Events:
				if !ok {
					return
				}
				if filepath.Clean(e.Name) == path && e.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename|fsnotify.Remove) != 0 {
					if timer == nil {
						timer = time.NewTimer(150 * time.Millisecond)
					} else {
						if !timer.Stop() {
							select {
							case <-timer.C:
							default:
							}
						}
						timer.Reset(150 * time.Millisecond)
					}
					tick = timer.C
				}
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				log.Printf("watch: %v", err)
			case <-tick:
				tick = nil
				s, err := loadConfig(path)
				if err != nil {
					log.Printf("configuration rejected; retaining last valid configuration: %v", err)
					continue
				}
				if s.ETag != a.current.Load().ETag {
					a.publish(s)
					log.Print("configuration reloaded")
				}
			}
		}
	}()
	return nil
}
func (a *app) probe(w http.ResponseWriter, r *http.Request) {
	s := a.current.Load()
	w.Header().Set("Cache-Control", "no-store")
	host := r.Host
	if h, _, e := net.SplitHostPort(host); e == nil {
		host = h
	}
	peer, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !privateIP(net.ParseIP(strings.Trim(host, "[]"))) || !privateIP(net.ParseIP(peer)) {
		http.Error(w, "local endpoint only", 403)
		return
	}
	origin := r.Header.Get("Origin")
	same := origin == "http://"+r.Host || origin == "https://"+r.Host
	if origin != "" && !same {
		allowed := false
		for _, o := range s.Config.Network.AllowedOrigins {
			if origin == o {
				allowed = true
				break
			}
		}
		if !allowed {
			http.Error(w, "origin not allowed", 403)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}
	if r.Method != "GET" {
		w.WriteHeader(405)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, "blueport:"+s.Config.Network.ProbeID)
}
func (a *app) events(w http.ResponseWriter, r *http.Request) {
	f, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "stream unavailable", 500)
		return
	}
	c := make(chan struct{}, 1)
	a.mu.Lock()
	if len(a.clients) >= 128 {
		a.mu.Unlock()
		http.Error(w, "too many clients", 503)
		return
	}
	a.clients[c] = true
	a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.clients, c); a.mu.Unlock() }()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	send := func() bool {
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Second))
		_, err := fmt.Fprintf(w, "event: config\ndata: %s\n\n", a.current.Load().ETag)
		f.Flush()
		_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
		return err == nil
	}
	if !send() {
		return
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-c:
			if !send() {
				return
			}
		}
	}
}

type asset struct {
	raw, gz   []byte
	etag, typ string
}

func (a *app) handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/probe", a.probe)
	m.HandleFunc("OPTIONS /api/probe", a.probe)
	m.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		s := a.current.Load()
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("ETag", s.ETag)
		if r.Header.Get("If-None-Match") == s.ETag {
			w.WriteHeader(304)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write(s.JSON)
	})
	m.HandleFunc("GET /api/events", a.events)
	assets := map[string]asset{}
	sub, _ := fs.Sub(embedded, "web")
	fs.WalkDir(sub, ".", func(path string, d fs.DirEntry, e error) error {
		if e != nil {
			return e
		}
		if d.IsDir() {
			return nil
		}
		b, _ := fs.ReadFile(sub, path)
		var buf bytes.Buffer
		z, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
		z.Write(b)
		z.Close()
		typ := http.DetectContentType(b)
		switch filepath.Ext(path) {
		case ".css":
			typ = "text/css; charset=utf-8"
		case ".js":
			typ = "text/javascript; charset=utf-8"
		case ".woff2":
			typ = "font/woff2"
		case ".svg":
			typ = "image/svg+xml"
		}
		key := "/" + path
		sum := sha256.Sum256(b)
		assets[key] = asset{b, buf.Bytes(), fmt.Sprintf(`"%x"`, sum[:12]), typ}
		return nil
	})
	m.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}
		v, ok := assets[path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", v.typ)
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("ETag", v.etag)
		w.Header().Set("Vary", "Accept-Encoding")
		if r.Header.Get("If-None-Match") == v.etag {
			w.WriteHeader(304)
			return
		}
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			w.Write(v.gz)
		} else {
			w.Write(v.raw)
		}
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' http: https:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
		m.ServeHTTP(w, r)
	})
}
func main() {
	path := flag.String("config", "data/config.yaml", "configuration YAML path")
	listen := flag.String("listen", "127.0.0.1:18787", "HTTP listen address")
	check := flag.Bool("check", false, "validate configuration and exit")
	export := flag.Bool("export-config", false, "export validated configuration JSON and exit")
	flag.Parse()
	abs, err := filepath.Abs(*path)
	if err != nil {
		log.Fatal(err)
	}
	s, err := loadConfig(abs)
	if err != nil {
		log.Fatal(err)
	}
	if *check {
		fmt.Println("configuration valid")
		return
	}
	if *export {
		os.Stdout.Write(s.JSON)
		return
	}
	a := &app{clients: map[chan struct{}]bool{}}
	a.publish(s)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err = a.watch(ctx, abs); err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{Addr: *listen, Handler: a.handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() {
		<-ctx.Done()
		stop, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		srv.Shutdown(stop)
	}()
	log.Printf("Blueport: http://%s (configuration: %s)", *listen, abs)
	if err = srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
