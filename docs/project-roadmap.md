# Project Roadmap

## v0.1 — MVP (Complete)

**Goal:** Working tunnel proxy with HTTPS + wildcard subdomains

| Feature | Status |
|---------|--------|
| Monorepo setup (pnpm + TypeScript + Biome) | Complete |
| Shared protocol types (discriminated unions) | Complete |
| Tunnel server (WS handler + request relay + SHA-256 auth) | Complete |
| Client CLI (connect + proxy + display with chalk UI) | Complete |
| API key authentication (hashed keys from env) | Complete |
| Infrastructure (nginx + certbot + PM2 config) | Complete |
| Unit + E2E tests (19/19 passing) | Complete |

**Release date:** 2026-03-28
**Test coverage:** 19 tests (4 files, 327ms execution), 100% pass rate

## v0.2 — Polish

- WebSocket pass-through (tunnel WS connections, not just HTTP)
- Binary body streaming (replace base64 with binary WS frames)
- Standalone binary distribution (pkg/nexe)
- `tunelo config` command for managing settings
- Request/response inspection mode (`--inspect`)
- Better error messages and diagnostics

## v0.3 — SaaS Foundation

- User registration + management (web UI)
- Per-user API key generation
- Rate limiting per key
- Usage tracking + metrics dashboard
- Reserved subdomain system
- Database (PostgreSQL) for user/key storage

## v0.4 — Advanced Features

- Custom domain support (user brings own domain)
- TCP raw tunnel support
- Request replay / inspection dashboard
- Webhook delivery verification
- Team management

## v0.5 — Scale

- Multi-server horizontal scaling
- Redis for shared state
- Connection migration on server restart
- Load balancing across tunnel servers
- Geographic distribution
