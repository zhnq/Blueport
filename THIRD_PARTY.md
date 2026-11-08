# Third-party software

Runtime dependencies (compiled into the Go executable):

- fsnotify v1.9.0 — https://github.com/fsnotify/fsnotify — BSD-3-Clause
- go-pinyin v0.21.0 — https://github.com/mozillazg/go-pinyin — MIT
- yaml.v3 v3.0.1 — https://github.com/go-yaml/yaml — MIT / Apache-2.0
- golang.org/x/sys v0.13.0 — https://go.googlesource.com/sys — BSD-3-Clause
- Go runtime — https://go.dev/ — BSD-3-Clause

License texts are in docs/licenses and included in FPK app/licenses.

Local Iosevka 400/800 fonts: https://github.com/be5invis/Iosevka , SIL OFL 1.1.
Font files obtained from the public reference website's asset URLs documented in
docs/design-reference.md; license in web/fonts/LICENSE.md and FPK app/licenses.

jsdom and its transitive dependencies are development-only, installed through npm
for DOM tests. They are not included in executable or FPK. See package-lock.json.
