# Blueport design QA · 2026-11-09

final result: passed

## Scope

Pass applies to the user's approved single-panel navigation adaptation of Protocol
Explorer's blue/white design language. This is not a pixel-identical reproduction
of its multi-panel educational simulator. Real NAS/network acceptance is separate.

## Evidence

- Source: https://protocol-explorer-alpha.vercel.app/ . Fresh source tab captured
  after the older tab repeatedly timed out.
- Source desktop: dist/screenshots/reference-desktop.jpg, 1280x720 pixels.
- Source mobile: dist/screenshots/reference-mobile.jpg, 375x812 pixels.
- Implementation: http://127.0.0.1:10435/ .
- Implementation desktop: dist/screenshots/desktop.jpg, 1384x1244 pixels.
- Implementation mobile: dist/screenshots/mobile.jpg, 390x844 CSS/pixel dimensions.
- Mobile search: dist/screenshots/mobile-search.jpg, 390x844.
- Full-view comparison: dist/screenshots/comparison.jpg, source and implementation
  placed together, each scaled to width 800 with preserved aspect ratio.
- Focused comparison: dist/screenshots/comparison-detail.jpg, brand/header and
  segmented controls put together. These details are otherwise too small in full view.
- Desktop native viewport dimensions differ; mobile phone sizes differ by 15px.
  Therefore no exact spacing/pixel-match or source clone claim is made. Comparison
  is of shared tokens, typography and component grammar; changed proportions are
  explicitly approved by the single-panel brief.

## Findings and iteration

- [P2, fixed] Category strip unexpectedly showed a vertical scrollbar. Observed
  in initial desktop screenshot; source has a clean single-row segmented control.
  Added overflow-y:hidden to .tabs. Revised desktop capture has no vertical bar.
- No remaining actionable P0/P1/P2 finding in the approved adaptation scope.
- [P3] Native horizontal scrolling indicator is visible for the phone category
  strip. It exposes more categories without widening the page; all category
  controls remain reachable. Retain as an affordance for now.

## Required surfaces

- Typography: local Iosevka is visibly rendered in English/numerals, system CJK is
  legible. Bold titles and quieter small labels retain the source's hierarchy.
- Spacing/layout: deliberate single panel replaces the simulator. Fine dividers,
  aligned service rows, segmented category counts and 2px corners are retained.
  390px page clientWidth and scrollWidth both equal 390; no page overflow.
- Colors/tokens: blue foreground, almost-white surface, pale blue dividers and
  solid blue active labels match the source tokens and visible source captures.
- Assets: vector service icons and the Blueport mark are original for the new app,
  as chosen in the interview; the source's unrelated packet/OSl artwork is omitted.
  Fonts are local and licensed; no blurred/rasterized application content.
- Copy/content: Chinese navigation, service names, source-style English accent
  labels. Example addresses are explicitly marked; no implied real NAS integration.

## Interactions checked

- Real browser: desktop search open, xzzx -> 下载中心, close/focus restore;
  network dialog and unconfigured-probe message; phone category selection and search.
- DOM regression tests: six pass, including network success/failure/manual modes,
  stale config response ordering and background-to-foreground re-probing.
- Source simulator animations are not replicated: user chose performance over animation.

## Remaining acceptance work

Compact-density revision, 2026-11-09: user explicitly requested tighter spacing.
Desktop 1384px view now measures 4 columns with 64px service rows; mobile 390px
view measures 66px rows and clientWidth == scrollWidth == 390. Captures:
dist/screenshots/compact-desktop.jpg and compact-mobile.jpg. Reduced icon/text gap
17 -> 10px, grid column gap 28 -> 16px, panel padding 34 -> 22px and removed
forced minimum panel/list height. Existing font family, colors and interactions
remain. No new visual or overflow issue observed in these two rendered views.

- Real Chrome/Edge local-network permission and public HTTPS -> private HTTP behavior.
- Actual fnOS install/upgrade/uninstall and package-user permissions on the user's NAS.
- ARM64 execution on hardware. No passing claims for these untested environments.

## Implementation checklist

- [x] Fix category vertical scrollbar and visually recheck.
- [x] Capture desktop, phone, search and source design evidence.
- [x] Compare full views and focused shared components together.
- [x] Preserve approved single-panel, blue-white, no-polling scope.
- [ ] Replace example service addresses after user supplies their configuration.
