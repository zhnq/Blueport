# Verification · 2026-11-08

## Passed

- Go config / hot reload / HTTP / CORS / SSE tests: `go test ./...`.
- `go vet ./...`, `node --check web/app.js`.
- Eight jsdom behavioral tests: category selection/focus, search/pinyin/keyboard,
  successful LAN probing/manual overrides, failed or wrong-instance fallback,
  HTML text escaping, out-of-order config responses, and hidden/foreground probe
  cancellation. These are simulated DOM tests, not real browser rendering.
- amd64 and arm64 FPKs built with official Linux fnpack 1.2.3 inside existing WSL.
- Archive permissions verified: lifecycle scripts and binary executable.
- Extracted amd64 FPK tested under WSL Linux: start, repeated start without duplicate
  process, status 0, stop, status 3, restart and config preservation.
- Real Linux HTTP static resource/config/probe requests pass.
- Initial compressed response bodies: 164,268 bytes (~160.4 KiB), including two
  local WOFF2 files, embedded icons and example configuration. HTTP/TLS headers
  excluded. 200 KiB body budget passes.
- WSL Linux amd64 executable RSS: 16.61 MiB; 3-second idle CPU sampling: 0.0% of
  one core. Short sample, six example services, no background polling.
- Windows local workset before final polish: 20.57 MiB; private committed memory
  55.1 MiB. These are different metrics; do not describe 55.1 MiB as resident RSS.

## Not yet verified

- Exact pixel matching is not a goal: user selected a single-panel navigation
  adaptation of the source's multi-panel simulator. See design-qa.md for scope.
- Real Chrome/Edge local network permission/mixed-content behavior when an HTTPS
  public page accesses the HTTP LAN endpoint. Wrong-instance/error fallback is
  tested in DOM simulation; actual home/mobile network transitions are pending.
- fnOS application-center install, actual package-user ownership, desktop entry,
  upgrade/uninstall and resource use on user's device. Actual package installation remains pending.
- arm64 runtime: cross-compiled/package verified, not executed on ARM hardware.
- Quantitative browser first-paint time or frontend RAM; no invented measurements.

Preview listens only on Windows loopback, no firewall/port-forward/NAS changes.
SSE quiet connections may be dropped by proxies; EventSource reconnects on errors.

## Browser verification · 2026-11-09

- Browser control recovered for a manually opened preview tab. The original source
  tab remained unresponsive; opening a fresh reference tab worked.
- Desktop screenshot: 1384x1244. Mobile screenshot: 390x844. No full-page horizontal
  overflow at 390px (clientWidth == scrollWidth == 390). Categories intentionally
  scroll horizontally within their own strip when needed.
- Real browser search `xzzx` returns 下载中心; closing restores focus. Mobile category
  selection and search work. Network dialog shows the unconfigured-probe fallback.
- Fixed a spurious vertical scrollbar in category tabs and recaptured desktop.
- Source screenshots: 1280x720 desktop and 375x812 mobile. Compared shared design
  grammar, not the different app content or exact page proportions.
- Screenshots and combined comparison evidence live in ignored dist/screenshots/.
- Latest preview: http://127.0.0.1:10435/ . The earlier 13456 preview is an older build.

## Port adaptation · 2026-11-09

- Default, FPK manifest, desktop entry and lifecycle use port 18787.
- Both FPK architectures were rebuilt; amd64 lifecycle passed in WSL.
- These are packaging/Linux checks, not fnOS application-center acceptance.
- Personal discovery records and service inventories are excluded from the public repository.

## MV3 extension distribution · 2026-11-09

- Extension builds from validated YAML; personal artifacts are local and ignored.
  Public release artifacts use config.example.yaml; all assets are local.
- chrome_url_overrides.newtab points to index.html. Config script is loaded before
  app.js; no background worker, content scripts, or API/config/SSE server dependency.
- Configured probes request only the specified NAS host; CSP narrows the port.
  The default example has no probe and requests no host permissions.
  No tabs, bookmarks, history, cookies or broad all-URLs permission.
- Go tests/vet pass. Eight DOM behavior tests pass, including extension offline
  directory/search and existing-fnOS marker success/wrong-page fallback.
- Static manifest checks, local asset resolution, JS syntax and ZIP CRC pass.
- Actual extension load/new-tab override and host/LNA permission flow have NOT been
  tested in a real browser profile; nothing was installed and no permission granted.
- Standalone extension YAML updates require rebuilding and reloading the extension;
  it does not claim arbitrary disk file watching from the browser sandbox.
