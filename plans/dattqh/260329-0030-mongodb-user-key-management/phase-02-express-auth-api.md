---
phase: 2
title: "Express + Auth (TOTP) + Key API + Admin API"
status: completed
effort: 14h
depends_on: [phase-01]
---

# Phase 2: Express + Auth (TOTP) + Key API + Admin API

## Context Links
- [Phase 1](phase-01-mongodb-keystore.md) — KeyStore, Mongoose models (User w/ role+totpSecret), connection manager
- [server.ts](../../../packages/server/src/server.ts) — raw http.createServer
- [request-relay.ts](../../../packages/server/src/request-relay.ts) — createRelayHandler()
- [Brainstorm report](../reports/brainstorm-260329-0114-dashboard-access-architecture.md) — dual-portal architecture

## Overview
- **Priority:** P1
- **Status:** pending
- Wrap http.createServer with Express. Add /api router with cookie-based JWT auth + CSRF, TOTP (Google Authenticator), user signup/login, API key CRUD, profile. Add /api/admin/* for admin-only operations (ADMIN_EMAILS env whitelist). Enforce limits.

## Key Insights
- express.json() + cors ONLY on /api router — relay handler must get raw req/res
- WS upgrade path via server.on('upgrade') is independent of Express — unchanged
- Catch-all Express route delegates to relay handler (no express middleware applied)
- DI pattern: route factories accept (keyStore, tunnelManager) — testable
- Rate limiting: in-memory Map per IP, behind interface for Redis swap later
- **httpOnly cookie** for JWT (not localStorage) + CSRF token
- **TOTP mandatory** for all users — setup on signup, verify on every login
- **Admin role** determined by ADMIN_EMAILS env var, checked at signup + middleware

## Requirements

### Functional
- F1: Express wraps http.createServer with routing
- F2: POST /api/auth/signup — create user, generate TOTP secret, return QR code data
- F3: POST /api/auth/verify-totp — verify first TOTP code after signup (activates account)
- F4: POST /api/auth/login — validate email+password+TOTP, set httpOnly cookie (access+refresh)
- F5: POST /api/auth/refresh — refresh access token using refresh token cookie
- F6: POST /api/auth/logout — clear cookies
- F7: GET /api/keys — list user's API keys (JWT auth)
- F8: POST /api/keys — create new key (enforce maxKeys limit)
- F9: DELETE /api/keys/:keyId — revoke key, disconnect active tunnels
- F10: GET /api/profile — get user profile
- F11: PATCH /api/profile/password — change password
- F12: Rate limiting on auth endpoints (signup: 5/IP/hr, login: 10/IP/15min)
- F13: maxTunnelsPerKey enforcement in ws-handler.ts
- F14: GET /api/admin/users — list all users (admin only)
- F15: PATCH /api/admin/users/:userId — suspend/activate user (admin only)
- F16: GET /api/admin/keys — list all keys (admin only)
- F17: DELETE /api/admin/keys/:keyId — revoke any key (admin only)
- F18: GET /api/admin/tunnels — list active tunnels (admin only)
- F19: GET /api/admin/stats — system stats (admin only)
- F20: CSRF token endpoint: GET /api/auth/csrf-token

### Non-Functional
- NF1: express.json() scoped to /api only
- NF2: Zod validation on all request bodies
- NF3: TuneloError -> structured JSON error responses
- NF4: JWT expiry: 24h access token, 7d refresh token
- NF5: All route files < 200 lines
- NF6: Rate limiter behind RateLimitStore interface
- NF7: CORS: allow localhost:4040 (client portal) + dashboard origin

## Architecture

```
Express app
├── /api (express.json, cors, csrf)
│   ├── /api/auth/signup        POST (rate limited)
│   ├── /api/auth/verify-totp   POST
│   ├── /api/auth/login         POST (rate limited)
│   ├── /api/auth/refresh       POST
│   ├── /api/auth/logout        POST
│   ├── /api/auth/csrf-token    GET
│   ├── /api/keys               GET, POST
│   ├── /api/keys/:keyId        DELETE
│   ├── /api/profile            GET
│   ├── /api/profile/password   PATCH
│   └── /api/admin/* (admin middleware)
│       ├── /api/admin/users         GET
│       ├── /api/admin/users/:userId PATCH
│       ├── /api/admin/keys          GET
│       ├── /api/admin/keys/:keyId   DELETE
│       ├── /api/admin/tunnels       GET
│       └── /api/admin/stats         GET
├── /dashboard/*  (static admin SPA — Phase 4)
└── /* catch-all  (relay handler, raw)

Middleware chain (/api):
  cors -> json -> csrf -> [rate-limit on auth] -> [cookie-auth on protected] -> zod-validate -> handler
```

## Related Code Files

### CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/api/create-api-router.ts` | Express router factory, mounts sub-routers |
| `packages/server/src/api/auth-routes.ts` | signup, verify-totp, login, refresh, logout, csrf-token |
| `packages/server/src/api/key-routes.ts` | GET/POST /keys, DELETE /keys/:keyId |
| `packages/server/src/api/profile-routes.ts` | GET /profile, PATCH /profile/password |
| `packages/server/src/api/admin-routes.ts` | /admin/* endpoints (users, keys, tunnels, stats) |
| `packages/server/src/api/middleware/cookie-auth.ts` | httpOnly cookie JWT verification |
| `packages/server/src/api/middleware/csrf-protection.ts` | CSRF token generation + validation |
| `packages/server/src/api/middleware/admin-guard.ts` | Check user.role === 'admin' |
| `packages/server/src/api/middleware/rate-limiter.ts` | IP-based rate limit behind RateLimitStore interface |
| `packages/server/src/api/middleware/validate-body.ts` | Zod validation middleware |
| `packages/server/src/api/middleware/error-handler.ts` | TuneloError -> JSON response |
| `packages/server/src/services/auth-service.ts` | signup/login/TOTP logic, bcrypt, JWT, cookies |
| `packages/server/src/services/totp-service.ts` | TOTP secret generation, QR data, verify code |
| `packages/server/src/services/key-service.ts` | Key CRUD, generation, limit checks |
| `packages/server/src/services/admin-service.ts` | Admin operations (list users, suspend, stats) |
| `packages/server/src/api/schemas/auth-schemas.ts` | Zod schemas for auth endpoints |
| `packages/server/src/api/schemas/key-schemas.ts` | Zod schemas for key endpoints |
| `packages/server/src/api/schemas/admin-schemas.ts` | Zod schemas for admin endpoints |
| `packages/server/src/rate-limit/rate-limit-store.ts` | RateLimitStore interface |
| `packages/server/src/rate-limit/memory-rate-limit-store.ts` | In-memory implementation |

### MODIFY
| File | Changes |
|------|---------|
| `packages/server/src/server.ts` | http.createServer(app) with Express, mount /api + relay catch-all, ADMIN_EMAILS config |
| `packages/server/src/ws-handler.ts` | Enforce maxTunnelsPerKey from KeyInfo |
| `packages/server/src/request-relay.ts` | Refactor createRelayHandler() to accept deps object |
| `packages/server/package.json` | Add express, jsonwebtoken, bcrypt, otplib, qrcode, zod, cors, csrf deps + @types |
| `packages/shared/src/errors.ts` | Add new error codes |

## Implementation Steps

### 1. Install dependencies
```bash
cd packages/server && pnpm add express jsonwebtoken bcrypt otplib qrcode zod cors
pnpm add -D @types/express @types/jsonwebtoken @types/bcrypt @types/qrcode @types/cors
```

### 2. Create RateLimitStore interface (`rate-limit/rate-limit-store.ts`)
- `RateLimitStore` interface: `increment(key: string): Promise<{ count: number; resetAt: number }>`, `reset(key: string): Promise<void>`
- Factory: `createRateLimiter({ windowMs, maxRequests, store: RateLimitStore })`

### 3. Create in-memory rate limit store (`rate-limit/memory-rate-limit-store.ts`)
- Map<string, { count, resetAt }>, cleanup expired entries every 60s

### 4. Create error handler middleware (`api/middleware/error-handler.ts`)
- TuneloError -> `{ error: { code, message } }` with appropriate HTTP status
- Unknown errors -> 500

### 5. Create cookie-auth middleware (`api/middleware/cookie-auth.ts`)
- Extract JWT from httpOnly cookie `tunelo_access`
- Verify with JWT_SECRET env var
- Attach `req.userId` and `req.userRole` to request
- 401 on missing/invalid token

### 6. Create CSRF middleware (`api/middleware/csrf-protection.ts`)
- GET /api/auth/csrf-token → generate + return CSRF token in response body + set cookie
- Validate CSRF token on mutating requests (POST, PATCH, DELETE)
- Double-submit cookie pattern: csrf token in cookie + header `X-CSRF-Token`

### 7. Create admin guard middleware (`api/middleware/admin-guard.ts`)
- Check `req.userRole === 'admin'`, else 403

### 8. Create Zod validation middleware (`api/middleware/validate-body.ts`)
- `validateBody(schema: ZodSchema)` -> middleware

### 9. Create TOTP service (`services/totp-service.ts`)
- `generateSecret(email)`: generate TOTP secret + otpauth URL using otplib
- `generateQrDataUrl(otpauthUrl)`: generate QR code data URL using qrcode package
- `verifyCode(secret, code)`: verify TOTP code

### 10. Create auth schemas (`api/schemas/auth-schemas.ts`)
- signupSchema: { email: z.string().email(), password: z.string().min(8) }
- loginSchema: { email: z.string().email(), password: z.string(), totpCode: z.string().length(6) }
- verifyTotpSchema: { totpCode: z.string().length(6) }

### 11. Create auth service (`services/auth-service.ts`)
- `signup(email, password)`: check duplicate, bcrypt hash, determine role (ADMIN_EMAILS check), generate TOTP secret, create User, return { totpSecret, qrDataUrl }
- `verifyTotp(userId, code)`: verify code against user.totpSecret, set totpVerified=true, generate access+refresh tokens, set cookies
- `login(email, password, totpCode)`: find user, bcrypt compare, check status+totpVerified, verify TOTP, generate tokens, set httpOnly cookies
- `refresh(refreshToken)`: verify refresh token, generate new access token, set cookie
- `logout(res)`: clear cookies
- `changePassword(userId, oldPassword, newPassword)`: verify old, hash new, update
- Cookie config: `{ httpOnly: true, secure: true, sameSite: 'strict', path: '/' }`

### 12. Create key service (`services/key-service.ts`)
- `listKeys(userId)`: find by userId+status:'active', return without keyHash
- `createKey(userId, label?)`: check count < maxKeys, generate tunelo_ + nanoid(32), hash, save
- `revokeKey(userId, keyId)`: find owned by user, revoke, disconnect tunnels

### 13. Create admin service (`services/admin-service.ts`)
- `listUsers(page, limit)`: paginated user list
- `updateUserStatus(userId, status)`: suspend/activate
- `listAllKeys(page, limit)`: all keys with user info
- `revokeAnyKey(keyId)`: revoke + disconnect
- `getActiveTunnels()`: from tunnelManager
- `getSystemStats()`: user count, key count, active tunnels, etc.

### 14. Create route files
- `auth-routes.ts`: signup, verify-totp, login, refresh, logout, csrf-token
- `key-routes.ts`: GET/POST /keys, DELETE /keys/:keyId
- `profile-routes.ts`: GET /profile, PATCH /password
- `admin-routes.ts`: all /admin/* endpoints with admin-guard middleware

### 15. Create API router factory (`api/create-api-router.ts`)
- Mounts cors (allow localhost:4040), json, csrf middleware
- Mounts auth/key/profile/admin sub-routers
- Error handler as last middleware

### 16. Update server.ts
```typescript
const app = express();
const apiRouter = createApiRouter({ keyStore, tunnelManager });
app.use('/api', apiRouter);
app.use((req, res) => relay(req, res));  // catch-all
const server = http.createServer(app);
attachWsHandler(server, keyStore);
```
- Read ADMIN_EMAILS from env, pass to auth-service

### 17. Enforce maxTunnelsPerKey in ws-handler.ts
- After validate(), check countByKeyHash < keyInfo.maxTunnels

### 18. Add error codes to shared/errors
- TUNELO_AUTH_002 (invalid credentials), TUNELO_AUTH_003 (TOTP required), TUNELO_AUTH_004 (TOTP invalid)
- TUNELO_KEY_001 (max keys), TUNELO_KEY_002 (not found), TUNELO_USER_001 (email taken)
- TUNELO_ADMIN_001 (forbidden)

### 19. Tests
- Unit: auth-service (signup, login w/ TOTP, refresh)
- Unit: totp-service (generate, verify)
- Unit: key-service (create, list, revoke, limits)
- Unit: admin-service (list users, suspend, stats)
- Unit: middleware (cookie-auth, csrf, rate-limiter, admin-guard)
- Integration: auth flow end-to-end (signup → verify-totp → login → refresh → logout)
- Integration: admin endpoints with role enforcement
- Integration: key revocation disconnects tunnels

## Todo List
- [x] Install dependencies (express, jsonwebtoken, bcrypt, otplib, qrcode, zod, cors)
- [x] Create RateLimitStore interface + memory implementation
- [x] Create error-handler middleware
- [x] Create cookie-auth middleware
- [x] Create CSRF middleware
- [x] Create admin-guard middleware
- [x] Create validate-body middleware
- [x] Create TOTP service
- [x] Create auth schemas
- [x] Create auth-service (signup, login w/ TOTP, refresh, logout)
- [x] Create key-service
- [x] Create admin-service
- [x] Create auth-routes
- [x] Create key-routes
- [x] Create profile-routes
- [x] Create admin-routes
- [x] Create create-api-router
- [x] Update server.ts (Express + ADMIN_EMAILS)
- [x] Enforce maxTunnelsPerKey in ws-handler.ts
- [x] Add error codes to shared
- [x] Write tests
- [x] Run biome lint + fix

## Success Criteria
- Signup creates user + returns TOTP QR code
- verify-totp activates account + sets auth cookies
- Login validates email+password+TOTP, sets httpOnly cookies
- Refresh endpoint rotates access token
- CSRF protection on all mutating endpoints
- Key CRUD works with ownership checks
- Admin endpoints accessible only to admin role users
- Admin can list/suspend users, revoke any key, view tunnels+stats
- Relay handler unaffected by Express
- WS upgrade path unchanged
- Rate limits enforced, behind swappable interface
- CORS allows localhost:4040

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Express middleware breaking relay | Catch-all gets raw req/res; express.json() only on /api |
| JWT_SECRET not set | Fail fast on startup when MONGO_URI is set |
| TOTP clock drift | otplib default window=1 (±30s), acceptable |
| Cookie not sent cross-origin | CORS credentials:true + sameSite:'none' for localhost dev |
| CSRF complexity | Double-submit cookie pattern, well-documented |

## Security Considerations
- Passwords: bcrypt cost factor 12
- JWT: HS256, httpOnly+secure+sameSite cookies, 24h access / 7d refresh
- TOTP: mandatory, Google Authenticator compatible (otplib)
- CSRF: double-submit cookie pattern on all mutating requests
- Rate limiting: prevents brute force on login/signup
- Admin: role from ADMIN_EMAILS env, checked at signup + admin-guard middleware
- Keys: plaintext shown once, stored as SHA-256 hash
- Ownership: users can only manage own keys (userId from JWT)

## Next Steps
- Phase 3 adds usage tracking
- Phase 4 builds admin dashboard SPA
- Phase 5 builds client portal SPA
