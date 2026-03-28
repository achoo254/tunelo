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

## v0.3 — SaaS Foundation (In Progress)

**Goal:** Multi-tenant user management, TOTP 2FA, persistent storage

| Feature | Status | Tech |
|---------|--------|------|
| User registration + email verification | Planned | Express + bcrypt |
| TOTP 2FA setup + verification | Planned | otplib + qrcode |
| JWT token management (24h + 7d refresh) | Planned | jsonwebtoken + httpOnly |
| API key generation + management | Planned | MongoDB + SHA-256 |
| Admin Dashboard SPA | Planned | React + Vite + Recharts |
| Client Portal SPA (localhost:4040) | Planned | React + Vite |
| Usage tracking per key | Planned | MongoDB aggregation |
| Rate limiting (interface-based) | Planned | Redis/memory/stub |
| CSRF protection | Planned | csurf middleware |
| Database migration | v0.3 uses **MongoDB** (not PostgreSQL) |

**Estimated:** v0.3 alpha by 2026-04-15

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

- **v0.3:** Single MongoDB instance (no replication yet)
- **v0.3:** In-memory tunnel registry (no persistence across restarts)
- **v0.3:** No cluster mode yet (Redis-backed rate limiting ready for v0.4)
- **v0.3:** Admin portal role only, no teams yet
