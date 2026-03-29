# Project Roadmap

## v0.1 — MVP (Complete — 2026-03-28)

**Goal:** Working tunnel proxy with HTTPS + wildcard subdomains

| Feature | Status |
|---------|--------|
| Monorepo setup (pnpm + TypeScript + Biome) | ✓ Complete |
| Shared protocol types (discriminated unions) | ✓ Complete |
| Tunnel server (WS handler + request relay + SHA-256 auth) | ✓ Complete |
| Client CLI (connect + proxy + display with chalk UI) | ✓ Complete |
| API key authentication (hashed keys from env) | ✓ Complete |
| Infrastructure (nginx + certbot + PM2 config) | ✓ Complete |
| Unit + E2E tests (19/19 passing) | ✓ Complete |

**Release:** 2026-03-28 | **Tests:** 19/19 (100%), 327ms

## v0.2 — Polish (Planned)

| Feature | Priority |
|---------|----------|
| WebSocket pass-through (tunnel WS connections) | High |
| Binary body streaming (replace base64) | High |
| Standalone binary distribution (pkg/nexe) | Medium |
| `tunelo config` command | Medium |
| Request inspection mode (`--inspect`) | Medium |
| Better error messages | Low |

## v0.3 — SaaS Foundation (Complete — 2026-03-29)

**Goal:** Multi-tenant user management, TOTP 2FA, persistent storage — ACHIEVED

| Feature | Status | Tech |
|---------|--------|------|
| User registration + password hashing | ✓ Complete | Express + bcrypt |
| TOTP 2FA setup + QR code verification | ✓ Complete | otplib + qrcode |
| JWT token management (24h + 7d refresh) | ✓ Complete | jsonwebtoken + httpOnly cookies |
| API key generation + management | ✓ Complete | MongoDB + SHA-256 hashing |
| Admin Dashboard SPA | ✓ Complete | React + Vite + Recharts (served at /dashboard/*) |
| Client Portal SPA (localhost:4041) | ✓ Complete | React + Vite (embedded in client CLI) |
| Usage tracking per key | ✓ Complete | MongoDB aggregation + daily snapshots |
| Rate limiting (interface-based) | ✓ Complete | Memory store (Redis-ready for v0.4) |
| CSRF protection | ✓ Complete | Double-submit token pattern |
| Pluggable KeyStore | ✓ Complete | MongoDB + JSON file (backward compat) |
| TCP tunneling | ✓ Complete | TCP ↔ WS framing |
| Zod validation | ✓ Complete | All API endpoints validated |

**Release:** 2026-03-29 | **Key changes:** API routes, MongoDB models, Portal SPA, Admin Dashboard

## v0.3.1 — Device Code Auth Flow (Complete — 2026-03-29)

**Goal:** Browser-based CLI authentication (like GitHub's `gh auth login`)

| Feature | Status | Tech |
|---------|--------|------|
| Device code generation & polling | ✓ Complete | Cryptographically secure, 32-char + user-friendly XXXX-XXXX codes |
| Device code TTL (5 minutes) | ✓ Complete | MongoDB TTL index (auto-cleanup) |
| Portal device confirmation page | ✓ Complete | Visual code match + approve button |
| CLI login/register/logout commands | ✓ Complete | Opens browser, polls for approval, saves API key |
| Atomic approval operations | ✓ Complete | Prevents race conditions on concurrent approvals |
| Rate limiting (create + poll) | ✓ Complete | 5/hour for create, 1/2s for poll |
| Zod validation (deviceCode, userCode) | ✓ Complete | Schema enforcement on poll + approve |

**Release:** 2026-03-29 | **Key addition:** Browser-first authentication flow

## v0.4 — Advanced Features (Planned)

| Feature | Details |
|---------|---------|
| Custom domain support | Users bring own domain, CNAME validation |
| TCP raw tunneling | Not just HTTP, raw TCP ports |
| Request inspection/replay | Dashboard for debugging |
| Webhook delivery | Push notifications to external URLs |
| Team management | Shared keys, role-based access |

**Estimated:** v0.4 by 2026-06-01

## v0.5 — Enterprise Scale (Planned)

| Feature | Details |
|---------|---------|
| Multi-server scaling | Redis state sharing, connection affinity |
| Load balancer integration | Distributes tunnels across servers |
| Connection migration | Graceful server restart, zero downtime |
| Geographic distribution | Regional servers, latency optimization |
| SLA tracking | Uptime monitoring, alerting |

**Estimated:** v0.5 by 2026-09-01

## Known Constraints

- **v0.3.1:** Single MongoDB instance (no replication yet)
- **v0.3.1:** In-memory tunnel registry (no persistence across restarts)
- **v0.3.1:** No cluster mode yet (Redis-backed rate limiting ready for v0.4)
- **v0.3.1:** Admin portal role only, no teams yet
- **v0.3.1:** Device codes stored temporarily in MongoDB (deleted after polling)
