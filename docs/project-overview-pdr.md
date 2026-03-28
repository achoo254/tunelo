# Project Overview — Tunelo (v0.3)

## What

Tunelo is a self-hosted ngrok alternative — a multi-tenant tunnel proxy with user management, TOTP 2FA, and persistent storage via MongoDB.

## Why

**v0.1–0.2:** Working MVP with WebSocket relay. Static API keys from env.

**v0.3:** Scale to SaaS. Add users, API key management, usage tracking, admin oversight, client self-service portal.

## Goals (v0.3 SaaS Foundation)

✅ User registration + management (email + password)
✅ TOTP 2FA mandatory for all users (Google Authenticator)
✅ Per-user API key generation + management + expiry
✅ MongoDB persistence (User, ApiKey, UsageLog models)
✅ JWT auth (24h access + 7d refresh) with httpOnly cookies + CSRF
✅ Admin Dashboard SPA (React + Vite) — see all users, keys, tunnels, usage charts
✅ Client Portal SPA (React + Vite) embedded in CLI — sign up, manage own keys
✅ Rate limiting (Redis-backed, swappable interface)
✅ Usage tracking — requests/day, bytes in/out per key
✅ Session management + secure token refresh

## Constraints

- **Tech stack:** Node.js 20+, TypeScript strict, ESM
- **Database:** MongoDB (not PostgreSQL) + Mongoose with .lean()
- **Infra:** Single VPS (2-4 vCPU, 4-8GB RAM) + nginx + MongoDB
- **Auth:** JWT (access + refresh tokens), TOTP (Google Authenticator)
- **Tunnel relay:** Unchanged from v0.1—WS + request pairing still core
- **Scale target:** 5-10k concurrent tunnels on single VPS

## Non-Goals (v0.3)

- Raw TCP tunneling
- Custom domain support
- Request inspection/replay
- Multi-server horizontal scaling (planned v0.5)
- WebSocket pass-through (planned v0.2)

## Target Users

**Primary:** Developers needing personal tunnel service + usage visibility
**Secondary:** Teams with admin oversight (suspended users, usage monitoring)

## v0.3 Implementation Status (In Progress)

### Modules to Create/Modify

| Module | Status | Details |
|--------|--------|---------|
| **MongoDB Models** | Planned | User, ApiKey, UsageLog schemas |
| **Express API** | Planned | Auth, keys, usage, admin endpoints |
| **TOTP Flow** | Planned | Setup QR + verify, otplib + qrcode |
| **Admin Dashboard** | Planned | React SPA, charts, user/key/tunnel management |
| **Client Portal** | Planned | React SPA in packages/client, sign up/login/keys |
| **JWT/Cookie Auth** | Planned | Tokens, refresh flow, CSRF protection |
| **Rate Limiter** | Planned | Redis-backed, per-key limits, interface design |
| **Usage Tracking** | Planned | Log requests, calculate daily snapshots |

### Success Criteria

- ✓ All users must complete TOTP setup before using tunnels
- ✓ Admin can see dashboards: users, active tunnels, usage trends
- ✓ Each user can manage own API keys (create, label, revoke, view usage)
- ✓ Client CLI supports login flow + TOTP verification
- ✓ JWT tokens rotate every 24h; refresh tokens valid 7 days
- ✓ API rate limits enforced per key (configurable, default 100 req/s)
- ✓ All passwords hashed (bcrypt); API keys hashed (SHA-256)
- ✓ Usage data persists to MongoDB

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MongoDB complexity | High | Mongoose + .lean() for perf; async/await patterns |
| TOTP setup friction | Medium | Clear QR code + backup codes; skip optional for dev |
| Token refresh bugs | High | Comprehensive tests for token lifecycle |
| Rate limit edge cases | Medium | Interface-based design (Redis, memory, stub implementations) |

## Architecture Changes from v0.1

```
v0.1:  keys.json (static) → SHA-256 hash auth → tunnel relay
v0.3:  MongoDB Users → JWT tokens → Admin API + Tunnel Relay

[Browser] → nginx (443, TLS)
    ├─→ /api/* (Express + Auth middleware)
    │   ├─ POST /auth/signup, /login, /verify-totp
    │   ├─ GET  /keys, /usage, /profile
    │   ├─ POST /keys (create new key)
    │   └─ DELETE /keys/:keyId (revoke)
    │
    ├─→ /dashboard/* (Admin SPA, ADMIN_EMAILS whitelist)
    │   ├─ GET /api/admin/users
    │   ├─ GET /api/admin/tunnels
    │   ├─ GET /api/admin/stats
    │   └─ PATCH /api/admin/users/:userId (suspend/activate)
    │
    └─→ /* (Tunnel relay, unchanged from v0.1)
        └─ WebSocket → Client CLI → localhost
```

## Database Schema (MongoDB)

### User
```javascript
{
  email: String (unique),
  passwordHash: String (bcrypt),
  role: String ('user' | 'admin'),
  totpSecret: String,
  totpVerified: Boolean,
  plan: String ('free' | 'pro'),
  status: String ('active' | 'suspended'),
  limits: {
    maxKeys: Number,
    maxRequests: Number (per day)
  },
  createdAt: Date,
  updatedAt: Date
}
```

### ApiKey
```javascript
{
  userId: ObjectId,
  keyHash: String (SHA-256),
  keyPrefix: String (first 8 chars visible),
  label: String,
  status: String ('active' | 'revoked'),
  expiresAt: Date (optional),
  lastUsedAt: Date,
  createdAt: Date
}
```

### UsageLog
```javascript
{
  keyId: ObjectId,
  userId: ObjectId,
  date: String (YYYY-MM-DD),
  requestCount: Number,
  bytesIn: Number,
  bytesOut: Number
}
```
