# Phase 2: User Auth (Signup/Login/JWT) + Admin REST API

## Context Links
- [Phase 1](./phase-01-mongodb-setup-and-key-store.md) — MongoDB + KeyStore
- [Code standards](../../docs/code-standards.md)
- [ws-handler.ts](../../packages/server/src/ws-handler.ts)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 12h
- **Description:** User authentication (email+password, JWT), email verification, admin REST API for CRUD orgs/keys/users. Express.js router mounted alongside existing HTTP server.

## Key Insights
- Current `server.ts` creates raw `http.createServer(createRelayHandler())` — need to integrate Express
- Socket.IO is attached to the HTTP server — must remain on same server instance
- Admin auth via env `ADMIN_TOKEN` — simple bearer token, no admin user system
- JWT for customer auth — stateless, no session storage needed
- Email verification needed to prevent abuse — but can be basic (verification link, no complex flow)

## Requirements

### Functional
- POST `/api/auth/signup` — create user + org, send verification email
- POST `/api/auth/login` — return JWT access token
- POST `/api/auth/verify-email` — verify email with token
- POST `/api/auth/refresh` — refresh expired JWT (optional, can skip for MVP)
- Admin endpoints (bearer `ADMIN_TOKEN`):
  - GET/POST/PATCH `/api/admin/orgs` — list, create, update orgs
  - GET `/api/admin/orgs/:orgId/keys` — list org's keys
  - PATCH `/api/admin/orgs/:orgId/status` — suspend/activate org
  - DELETE `/api/admin/keys/:keyId` — revoke any key
  - GET `/api/admin/stats` — overview stats (total orgs, keys, active tunnels)

### Non-Functional
- JWT expiry: 24h (configurable via env)
- Password: bcrypt with cost factor 12
- Rate limit signup: 5 per IP per hour
- Rate limit login: 10 per IP per 15min
- Input validation on all endpoints (email format, password min 8 chars, slug format)

## Architecture

```
http.createServer(app)         ← Express app wraps relay handler
  ├── /api/auth/*              ← Public auth routes
  ├── /api/admin/*             ← Admin routes (ADMIN_TOKEN bearer)
  ├── /api/keys/*              ← Customer routes (JWT bearer) [Phase 3]
  ├── /health                  ← Existing health endpoint
  └── * (catch-all)            ← Existing relay handler (createRelayHandler)
Socket.IO attached to same server
```

### Auth Flow
```
Signup:
  POST /api/auth/signup { email, password, orgName }
    → validate input
    → check email unique
    → bcrypt hash password
    → create Organization { name: orgName, slug: slugify(orgName) }
    → create User { orgId, email, passwordHash, role: "owner" }
    → generate email verification token (JWT, 24h expiry)
    → send verification email (or log URL in dev mode)
    → return { message: "Check email to verify" }

Login:
  POST /api/auth/login { email, password }
    → find user by email
    → bcrypt compare password
    → check user.emailVerified (optional for MVP — can allow unverified)
    → check user.status === "active"
    → check org.status === "active"
    → generate JWT { userId, orgId, role, email }
    → return { token, expiresIn }

Verify Email:
  POST /api/auth/verify-email { token }
    → decode JWT verification token
    → update user.emailVerified = true
    → return { message: "Email verified" }
```

## Related Code Files

### Files to CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/api/api-router.ts` | Express router mounting all API routes |
| `packages/server/src/api/auth-routes.ts` | `/api/auth/*` signup, login, verify |
| `packages/server/src/api/admin-routes.ts` | `/api/admin/*` CRUD orgs, keys, stats |
| `packages/server/src/api/middleware/jwt-auth-middleware.ts` | JWT verification middleware |
| `packages/server/src/api/middleware/admin-auth-middleware.ts` | Admin token verification |
| `packages/server/src/api/middleware/rate-limit-middleware.ts` | IP-based rate limiting (in-memory) |
| `packages/server/src/api/middleware/validate-input-middleware.ts` | Zod schema validation middleware |
| `packages/server/src/services/auth-service.ts` | Signup, login, verify business logic |
| `packages/server/src/services/org-service.ts` | Org CRUD business logic |
| `packages/server/src/services/api-key-service.ts` | Key generation, validation, revocation |
| `packages/server/src/__tests__/auth-routes.test.ts` | Auth endpoint tests |
| `packages/server/src/__tests__/admin-routes.test.ts` | Admin endpoint tests |

### Files to MODIFY
| File | Change |
|------|--------|
| `packages/server/src/server.ts` | Wrap with Express, mount API router before relay handler |
| `packages/server/package.json` | Add express, jsonwebtoken, bcrypt, zod deps |
| `packages/shared/src/constants.ts` | Add JWT/auth-related defaults |

## Implementation Steps

### Step 1: Install dependencies
```bash
cd packages/server
pnpm add express jsonwebtoken bcrypt zod
pnpm add -D @types/express @types/jsonwebtoken @types/bcrypt
```

### Step 2: Create Express integration in server.ts
- Create Express app
- Mount API router at `/api`
- Use relay handler as catch-all for non-API requests
- Attach Socket.IO to the same HTTP server
- Keep existing startup/shutdown logic

### Step 3: Create auth service
- `auth-service.ts`:
  - `signup(email, password, orgName)`: create org + user, return verification token
  - `login(email, password)`: validate credentials, return JWT
  - `verifyEmail(token)`: decode + update user
  - JWT signing with `JWT_SECRET` env var (required)

### Step 4: Create auth routes
- `auth-routes.ts`: Express router
  - POST `/signup` — validate with Zod → authService.signup()
  - POST `/login` — validate → authService.login()
  - POST `/verify-email` — validate → authService.verifyEmail()

### Step 5: Create admin middleware + routes
- `admin-auth-middleware.ts`: check `Authorization: Bearer {ADMIN_TOKEN}`
- `admin-routes.ts`:
  - GET `/orgs` — list with pagination
  - POST `/orgs` — create org manually
  - PATCH `/orgs/:orgId` — update limits/status
  - GET `/orgs/:orgId/keys` — list org keys
  - DELETE `/keys/:keyId` — revoke key
  - GET `/stats` — { totalOrgs, totalKeys, activeKeys, activeTunnels }

### Step 6: Create shared middleware
- `jwt-auth-middleware.ts`: decode JWT, attach `req.user = { userId, orgId, role }`
- `rate-limit-middleware.ts`: in-memory Map<IP, { count, resetAt }>, configurable
- `validate-input-middleware.ts`: Zod schema → 400 on failure

### Step 7: Create org + api-key services
- `org-service.ts`: CRUD operations on Organization model
- `api-key-service.ts`:
  - `generateKey(orgId, userId, label)`: generate `tk_` prefixed random key, hash, store, return plaintext ONCE
  - `revokeKey(keyId)`: set status = "revoked"
  - `listKeys(orgId)`: return keys with prefix + metadata (no hash)

### Step 8: Write tests
- Auth routes: signup flow, login, duplicate email, wrong password
- Admin routes: CRUD orgs, list keys, revoke, stats
- Mock MongoDB with in-memory Mongoose (mongodb-memory-server)

### Step 9: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Install express, jsonwebtoken, bcrypt, zod
- [ ] Create Express integration in `server.ts`
- [ ] Create `api/api-router.ts`
- [ ] Create `services/auth-service.ts`
- [ ] Create `api/auth-routes.ts`
- [ ] Create `api/middleware/jwt-auth-middleware.ts`
- [ ] Create `api/middleware/admin-auth-middleware.ts`
- [ ] Create `api/middleware/rate-limit-middleware.ts`
- [ ] Create `api/middleware/validate-input-middleware.ts`
- [ ] Create `services/org-service.ts`
- [ ] Create `services/api-key-service.ts`
- [ ] Create `api/admin-routes.ts`
- [ ] Write auth + admin tests
- [ ] Run lint + build + test

## Success Criteria

- User can signup with email+password → receives verification token
- User can login → receives JWT
- Admin can list/create/update orgs with ADMIN_TOKEN
- Admin can list/revoke keys
- Admin can view stats (total orgs, keys, active tunnels)
- All API endpoints return proper error codes + messages
- Rate limiting prevents brute force (signup + login)
- `pnpm build` + `pnpm lint` + `pnpm test` green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Express conflicts with relay handler | Medium | High | Mount API routes BEFORE catch-all relay |
| JWT secret not set in prod | Medium | Critical | Fail-fast at startup if `JWT_SECRET` missing |
| bcrypt slow on high signup volume | Low | Low | Cost factor 12 = ~250ms, acceptable |
| Email verification blocks users | Medium | Medium | Allow unverified login for MVP, enforce later |

## Security Considerations

- **JWT_SECRET** required env var — server MUST NOT start without it
- **bcrypt cost 12** — 250ms per hash, resistant to brute force
- **Rate limiting** — IP-based, in-memory (sufficient for single server)
- **Input validation** — Zod schemas on all endpoints
- **No password in response** — only return token on login
- **Admin token** — separate from user JWT, env-only, never in DB

## Next Steps
- Phase 3 depends on: auth service + JWT middleware working
- Phase 3 adds: customer-facing key management API
