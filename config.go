package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/mozillazg/go-pinyin"
	"gopkg.in/yaml.v3"
)

type Network struct {
	ProbeURL       string   `yaml:"probe_url" json:"probe_url"`
	ProbeID        string   `yaml:"probe_id" json:"probe_id"`
	AllowedOrigins []string `yaml:"allowed_origins" json:"-"`
	Timeout        int      `yaml:"timeout_ms" json:"timeout_ms"`
}
type Category struct {
	ID   string `yaml:"id" json:"id"`
	Name string `yaml:"name" json:"name"`
}
type Service struct {
	ID          string   `yaml:"id" json:"id"`
	Name        string   `yaml:"name" json:"name"`
	Description string   `yaml:"description" json:"description"`
	Category    string   `yaml:"category" json:"category"`
	Icon        string   `yaml:"icon" json:"icon"`
	Internal    string   `yaml:"internal_url" json:"internal_url"`
	Public      string   `yaml:"public_url" json:"public_url"`
	Keywords    []string `yaml:"keywords,omitempty" json:"-"`
	Search      string   `yaml:"-" json:"search"`
}
type Config struct {
	Version    int        `yaml:"version" json:"version"`
	Title      string     `yaml:"title" json:"title"`
	Subtitle   string     `yaml:"subtitle" json:"subtitle"`
	Network    Network    `yaml:"network" json:"network"`
	Categories []Category `yaml:"categories" json:"categories"`
	Services   []Service  `yaml:"services" json:"services"`
}
type Snapshot struct {
	Config Config
	JSON   []byte
	ETag   string
}

var idPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,47}$`)
var icons = map[string]bool{"server": true, "network": true, "play": true, "download": true, "code": true, "globe": true, "folder": true, "shield": true, "terminal": true, "music": true, "home": true, "link": true}

func validURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil && !strings.ContainsAny(raw, "\r\n\t")
}
func loadConfig(path string) (*Snapshot, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 1<<20+1))
	if err != nil {
		return nil, err
	}
	if len(b) > 1<<20 {
		return nil, fmt.Errorf("configuration exceeds 1 MiB")
	}
	var c Config
	d := yaml.NewDecoder(bytes.NewReader(b))
	d.KnownFields(true)
	if err = d.Decode(&c); err != nil {
		return nil, err
	}
	var extra any
	if err = d.Decode(&extra); err != io.EOF {
		return nil, fmt.Errorf("exactly one YAML document required")
	}
	if c.Version != 1 {
		return nil, fmt.Errorf("version must be 1")
	}
	if strings.TrimSpace(c.Title) == "" || len(c.Title) > 120 {
		return nil, fmt.Errorf("title must contain 1–120 bytes")
	}
	if c.Network.Timeout == 0 {
		c.Network.Timeout = 1400
	}
	if c.Network.Timeout < 300 || c.Network.Timeout > 5000 {
		return nil, fmt.Errorf("timeout_ms must be 300–5000")
	}
	if c.Network.ProbeID == "" {
		c.Network.ProbeID = "blueport-home"
	}
	if len(c.Network.ProbeID) > 128 {
		return nil, fmt.Errorf("probe_id too long")
	}
	if c.Network.ProbeURL != "" {
		u, _ := url.Parse(c.Network.ProbeURL)
		if !validURL(c.Network.ProbeURL) || u == nil || !privateIP(net.ParseIP(u.Hostname())) || u.Path != "/api/probe" || u.RawQuery != "" || u.Fragment != "" {
			return nil, fmt.Errorf("probe_url must be http(s)://PRIVATE_IP:PORT/api/probe")
		}
	}
	for _, o := range c.Network.AllowedOrigins {
		u, e := url.Parse(o)
		if e != nil || !validURL(o) || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return nil, fmt.Errorf("allowed_origins must contain exact http(s) origins")
		}
	}
	if len(c.Services) > 100 {
		return nil, fmt.Errorf("at most 100 services supported")
	}
	cats := map[string]string{}
	for _, cat := range c.Categories {
		if !idPattern.MatchString(cat.ID) || cat.Name == "" || cats[cat.ID] != "" {
			return nil, fmt.Errorf("invalid or duplicate category: %s", cat.ID)
		}
		cats[cat.ID] = cat.Name
	}
	ids := map[string]bool{}
	for i := range c.Services {
		s := &c.Services[i]
		if !idPattern.MatchString(s.ID) || ids[s.ID] || strings.TrimSpace(s.Name) == "" || cats[s.Category] == "" {
			return nil, fmt.Errorf("invalid service: %s", s.ID)
		}
		ids[s.ID] = true
		if s.Internal == "" && s.Public == "" {
			return nil, fmt.Errorf("service %s needs at least one URL", s.ID)
		}
		for _, raw := range []string{s.Internal, s.Public} {
			if raw != "" && !validURL(raw) {
				return nil, fmt.Errorf("service %s has invalid http(s) URL", s.ID)
			}
		}
		if s.Icon == "" {
			s.Icon = "link"
		}
		if !icons[s.Icon] {
			return nil, fmt.Errorf("service %s: unsupported icon %s", s.ID, s.Icon)
		}
		base := strings.Join(append([]string{s.Name, s.Description, cats[s.Category]}, s.Keywords...), " ")
		a := pinyin.NewArgs()
		full := pinyin.LazyPinyin(base, a)
		initials := []string{}
		for _, v := range full {
			if len(v) > 0 {
				initials = append(initials, v[:1])
			}
		}
		s.Search = strings.ToLower(base + " " + strings.Join(full, "") + " " + strings.Join(initials, ""))
	}
	if c.Categories == nil {
		c.Categories = []Category{}
	}
	if c.Services == nil {
		c.Services = []Service{}
	}
	js, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	// Include server-only fields (notably CORS origins) in the reload version.
	sum := sha256.Sum256(b)
	return &Snapshot{Config: c, JSON: js, ETag: `"` + hex.EncodeToString(sum[:12]) + `"`}, nil
}
func privateIP(ip net.IP) bool { return ip != nil && (ip.IsPrivate() || ip.IsLoopback()) }
