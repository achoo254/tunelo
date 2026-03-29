---
title: "MongoDB User & Key Management"
description: "Replace static keys.json with MongoDB-backed user auth, TOTP 2FA, API key management, usage tracking, admin dashboard, and client portal"
status: completed
priority: P1
effort: 44h
branch: feat/mongodb-user-key-management
tags: [mongodb, auth, api-keys, totp, dashboard, portal, express]
created: 2026-03-29
completed: 2026-03-29
---

# MongoDB User & Key Management

Replace static `keys.json` auth with MongoDB-backed user + API key management system. Dual-portal architecture: client self-service portal (localhost:4040) + admin dashboard (server /dashboard/*).

## Architecture Summary

```
CLIENT (npm: tunelo)
  tunelo start --port 3000
  ├── localhost:4040 (Client Portal SPA)
  │   ├── Signup / Login (email+pass+TOTP)
  │   ├── Manage own API keys
  │   └── View own usage
  └── WS connection → tunnel server

SERVER (tunnel.inetdev.io.vn)
  ├── /api/*        → Shared API (auth, keys, usage) + /api/admin/*
  ├── /dashboard/*  → Admin SPA (ENV whitelist: ADMIN_EMAILS)
  └── /*            → Tunnel relay (unchanged)
  WS upgrade        → server.on('upgrade') (unchanged)
```

**Key decisions:**
- Mongoose w/ .lean(), no cache (1x auth/WS conn)
- Express wrapping http.createServer, DI via route factories
- Two roles: `user` (signup) | `admin` (ADMIN_EMAILS env)
- TOTP (Google Authenticator) mandatory for all users
- httpOnly cookie + CSRF token (not localStorage)
- 24h access + 7d refresh token
- Rate limiter & usage buffer behind interfaces (Redis-swappable)
- No email verification for MVP

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | MongoDB + KeyStore + TunnelConnection | 9h | completed | [phase-01](phase-01-mongodb-keystore.md) |
| 2 | Express + Auth (TOTP) + Key API + Admin API | 14h | completed | [phase-02](phase-02-express-auth-api.md) |
| 3 | Usage Tracking | 5h | completed | [phase-03](phase-03-usage-tracking.md) |
| 4 | Admin Dashboard | 8h | completed | [phase-04-admin-dashboard.md](phase-04-admin-dashboard.md) |
| 5 | Client Portal | 8h | completed | [phase-05](phase-05-client-portal.md) |

## Dependencies

- Phase 2 depends on Phase 1 (KeyStore, Mongoose models)
- Phase 3 depends on Phase 2 (auth middleware, Express routes)
- Phase 4 depends on Phase 2+3 (admin API endpoints, usage data)
- Phase 5 depends on Phase 2+3 (user API endpoints, usage data)
- Phase 4 & 5 can run in parallel (independent SPAs)

## Key Interfaces

```typescript
interface KeyInfo {
  userId: string; keyId: string; keyHash: string;
  maxTunnels: number; plan: string; role: 'user' | 'admin';
}

interface KeyStore {
  validate(keyHash: string): Promise<KeyInfo | null>;
  recordUsage(keyHash: string): Promise<void>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## New Dependencies

| Package | Phase | Purpose |
|---------|-------|---------|
| mongoose | 1 | MongoDB ODM (reads use .lean()) |
| express | 2 | HTTP framework |
| jsonwebtoken | 2 | JWT auth (access + refresh tokens) |
| bcrypt | 2 | Password hashing |
| otplib | 2 | TOTP generation/verification (Google Authenticator) |
| qrcode | 2 | QR code generation for TOTP setup |
| zod | 2 | Request validation |
| cors | 2 | CORS headers (allow localhost:4040) |
| csurf/csrf-csrf | 2 | CSRF protection for cookie-based auth |
| recharts | 4,5 | Usage charts |
| react-router-dom | 4,5 | SPA routing |

## Risk Summary

- MongoDB downtime: reject new WS auth, existing tunnels continue
- Express integration: catch-all must not break relay; express.json() only on /api
- WS upgrade path unchanged (server.on('upgrade'))
- Client portal increases npm package size (React SPA bundle)
- CORS: server must allow localhost:4040 origin
- TOTP adds signup friction (necessary security trade-off)
- Two SPAs to maintain (admin + client)

## Validation Summary

**Validated:** 2026-03-29
**Questions asked:** 6 + 3 (brainstorm)

### Confirmed Decisions
- **Scale strategy**: Single-instance + abstract interfaces for Redis swap later
- **Auth storage**: httpOnly cookie + CSRF token (not localStorage)
- **JWT expiry**: 24h access + 7d refresh token
- **TOTP**: Mandatory for all users (client + admin), Google Authenticator
- **Access control**: Two roles — `user` (open signup) + `admin` (ADMIN_EMAILS env whitelist)
- **Client portal**: Embedded React SPA in packages/client, served at localhost:4040
- **Admin dashboard**: Server-side at /dashboard/*, full management (users, keys, tunnels, usage)
- **Signup**: No email verify for MVP, rate limit only
- **Key format**: `tunelo_` prefix + nanoid(32) = 39 chars

### Action Items (integrated into phase files)
- [x] Phase 1: Add `role` and `totpSecret` fields to User model
- [x] Phase 2: TOTP setup/verify endpoints, admin middleware, admin API, CSRF, refresh token
- [x] Phase 3: Admin usage endpoint (system-wide)
- [x] Phase 4: Rewrite as Admin Dashboard (not customer portal)
- [x] Phase 5: New — Client Portal SPA in packages/client
