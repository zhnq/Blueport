# Blueport

Read README.md and docs/requirements.md before changing behavior. Runtime is a
single Go binary with embedded vanilla HTML/CSS/JS. Do not add frontend frameworks,
external CDNs, telemetry, polling, database, login, or visual configuration tools.
The user also requested an offline MV3 new-tab extension; this distribution has
no Go runtime dependency. Build it with scripts/build_extension.py from the same
validated YAML. Never automatically install it or grant browser permissions.
User configurations are YAML; preserve last known good configuration on errors.
Keep the visual tokens grounded in docs/design-reference.md.

Validate with go test ./..., go vet ./..., node --check web/app.js and
python scripts/verify.py against a running development server. Native FPK changes
need official fnpack validation; distinguish packaging from real NAS testing.
Never commit dist, local user YAML, executables or third-party tools.
