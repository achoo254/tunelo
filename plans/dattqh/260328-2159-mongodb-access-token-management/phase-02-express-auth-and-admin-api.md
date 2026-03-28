# Phase 2: Express Integration + User Auth + Admin REST API

## Context Links
- [Phase 1](./phase-01-mongodb-setup-and-key-store.md) — MongoDB + KeyStore + TunnelConnection
- [Current server.ts](../../packages/server/src/server.ts)
- [Current request-relay.ts](../../packages/server/src/request-relay.ts)
- [Code standards](../../docs/code-standards.md)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 12h
- **Description:** Integrate Express.js wrapping raw http server. User authentication (email+password, JWT) — NO email verification. Admin REST API for CRUD orgs/keys/users. CORS middleware for dashboard dev.

## Key Insights
- Current `server.ts` creates raw `http.createServer(createRelayHandler())` — Express wraps this
- `ws` library hooks `server.on('upgrade')` — independent of Express, no conflict
- `express.json()` MUST only apply to `/api` router — relay handler needs raw req/res for large payloads
- Admin auth via env `ADMIN_TOKEN` — simple bearer token, no admin user system
- JWT for customer auth — stateless, no session storage
- **No email verification** — signup creates active user immediately (confirmed in brainstorm)
- DI pattern: route factories accept `keyStore` and `tunnelManager` as parameters

## Requirements

### Functional
- POST `/api/auth/signup` — create user + org, return JWT immediately
- POST `/api/auth/login` — validate credentials, return JWT
- Admin endpoints (bearer `ADMIN_TOKEN`):
  - GET `/api/admin/orgs` — list orgs with pagination
  - POST `/api/admin/orgs` — create org manually
  - PATCH `/api/admin/orgs/:orgId` — update limits/status
  - GET `/api/admin/orgs/:orgId/keys` — list org's keys
  - PATCH `/api/admin/orgs/:orgId/status` — suspend/activate org
  - DELETE `/api/admin/keys/:keyId` — revoke any key
  - GET `/api/admin/stats` — overview stats (total orgs, keys, active tunnels)

### Non-Functional
- JWT expiry: 24h (configurable via `JWT_EXPIRY` env, default `24h`)
- Password: bcrypt with cost factor 12
- Rate limit signup: 5 per IP per hour
- Rate limit login: 10 per IP per 15min
- Input validation on all endpoints (Zod schemas)
- CORS: configurable via `CORS_ORIGIN` env (default: `*` in dev)

## Architecture

### Express + Raw HTTP + WS Coexistence
```
const app = express();

// API-only middleware (scoped, NOT global)
const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '1mb' }));
apiRouter.use(cors({ origin: CORS_ORIGIN }));

// Mount routes (DI: pass dependencies to factories)
apiRouter.use('/auth', createAuthRoutes());
apiRouter.use('/admin', createAdminRoutes({ keyStore, tunnelManager }));
apiRouter.use('/keys', createCustomerRoutes({ keyStore }));  // Phase 3

app.use('/api', apiRouter);
app.use('/health', healthHandler);

// Catch-all: relay handler (raw req/res, no body parsing)
const relayHandler = createRelayHandler();
app.use((req, res) => relayHandler(req, res));

const server = http.createServer(app);
attachWsHandler(server, keyStore);  // WS upgrade, independent of Express
```

**Why safe:**
- `express.json()` only on `/api` router → relay handler gets raw stream
- WS upgrade on `server.on('upgrade')` → bypasses Express middleware entirely
- Relay handler is catch-all AFTER API routes → no conflict

### Auth Flow
```
Signup:
  POST /api/auth/signup { email, password, orgName }
    → validate input (Zod)
    → check email unique
    → bcrypt hash password (cost 12)
    → create Organization { name: orgName, slug: slugify(orgName) }
    → create User { orgId, email, passwordHash, role: "owner", status: "active" }
    → generate JWT { userId, orgId, role, email }
    → return { token, expiresIn, user: { email, role }, org: { name, slug } }

Login:
  POST /api/auth/login { email, password }
    → find user by email
    → bcrypt compare password
    → check user.status === "active"
    → check org.status === "active"
    → generate JWT { userId, orgId, role, email }
    → return { token, expiresIn, user: { email, role }, org: { name, slug } }
```

### Admin Stats (with tunnelManager DI)
```typescript
// GET /api/admin/stats
const stats = tunnelManager.getStats();
const [totalOrgs, totalKeys, activeKeys] = await Promise.all([
  OrganizationModel.countDocuments(),
  ApiKeyModel.countDocuments(),
  ApiKeyModel.countDocuments({ status: "active" }),
]);
return { totalOrgs, totalKeys, activeKeys, activeTunnels: stats.activeTunnels };
```

## Related Code Files

### Files to CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/api/create-api-router.ts` | Express router factory mounting all API routes |
| `packages/server/src/api/auth-routes.ts` | `/api/auth/*` signup, login |
| `packages/server/src/api/admin-routes.ts` | `/api/admin/*` CRUD orgs, keys, stats |
| `packages/server/src/api/middleware/jwt-auth-middleware.ts` | JWT verification middleware |
| `packages/server/src/api/middleware/admin-auth-middleware.ts` | Admin token verification |
| `packages/server/src/api/middleware/rate-limit-middleware.ts` | IP-based rate limiting (in-memory) |
| `packages/server/src/api/middleware/validate-input-middleware.ts` | Zod schema validation middleware |
| `packages/server/src/api/middleware/error-handler-middleware.ts` | Express error handler → TuneloError JSON |
| `packages/server/src/services/auth-service.ts` | Signup, login business logic |
| `packages/server/src/services/org-service.ts` | Org CRUD business logic |
| `packages/server/src/services/api-key-service.ts` | Key generation, revocation |
| `packages/server/src/__tests__/auth-routes.test.ts` | Auth endpoint tests |
| `packages/server/src/__tests__/admin-routes.test.ts` | Admin endpoint tests |

### Files to MODIFY
| File | Change |
|------|--------|
| `packages/server/src/server.ts` | Wrap with Express app, mount API router before relay, pass deps |
| `packages/server/package.json` | Add express, jsonwebtoken, bcrypt, zod, cors deps |
| `packages/shared/src/constants.ts` | Add JWT/auth defaults (JWT_EXPIRY, BCRYPT_ROUNDS, rate limits) |

## Implementation Steps

### Step 1: Install dependencies
```bash
cd packages/server
pnpm add express jsonwebtoken bcrypt zod cors
pnpm add -D @types/express @types/jsonwebtoken @types/bcrypt @types/cors
```

### Step 2: Create Express integration in server.ts
- Create Express `app`
- Create API router with scoped `express.json({ limit: '1mb' })` + `cors()`
- Mount API router at `/api`
- Move health check to Express route
- Use relay handler as catch-all for non-API requests
- Pass `keyStore` + `tunnelManager` to API router factory
- Keep `attachWsHandler(server, keyStore)` — WS upgrade independent

```typescript
// server.ts key changes:
import express from 'express';
import { createApiRouter } from './api/create-api-router.js';

const app = express();
const apiRouter = createApiRouter({ keyStore, tunnelManager });
app.use('/api', apiRouter);

// Catch-all: existing relay handler
const relayHandler = createRelayHandler();
app.use((req, res) => relayHandler(req, res));

const server = http.createServer(app);
attachWsHandler(server, keyStore);
```

### Step 3: Create auth service
- `services/auth-service.ts`:
  - `signup(email, password, orgName)`: create org + user, generate JWT, return token + user info
  - `login(email, password)`: validate credentials, check statuses, generate JWT
  - JWT signing with `JWT_SECRET` env var (REQUIRED — fail-fast at startup if missing)
  - Slug generation: `orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 63)`

### Step 4: Create auth routes
- `api/auth-routes.ts`: Express router factory
  - POST `/signup` — validate with Zod → authService.signup()
  - POST `/login` — validate with Zod → authService.login()
  - Rate limiting middleware applied per-route

### Step 5: Create shared middleware
- `jwt-auth-middleware.ts`: decode JWT, attach `req.user = { userId, orgId, role, email }`
- `admin-auth-middleware.ts`: check `Authorization: Bearer {ADMIN_TOKEN}` from env
- `rate-limit-middleware.ts`: in-memory `Map<string, { count, resetAt }>`, configurable per-route
- `validate-input-middleware.ts`: accept Zod schema → 400 on failure with structured error
- `error-handler-middleware.ts`: catch TuneloError → JSON response, catch unknown → 500

### Step 6: Create org + api-key services
- `services/org-service.ts`: CRUD operations on Organization model
  - `listOrgs(page, limit)`, `createOrg(data)`, `updateOrg(orgId, data)`, `suspendOrg(orgId)`
- `services/api-key-service.ts`:
  - `generateKey(orgId, userId, label)`: generate `tk_` + nanoid(32), hash SHA-256, store, return plaintext ONCE
  - `revokeKey(keyId)`: set status = "revoked"
  - `listKeysByOrg(orgId)`: return keys with prefix + metadata (no hash)

### Step 7: Create admin routes
- `api/admin-routes.ts`: Express router factory, accepts `{ keyStore, tunnelManager }`
  - Apply `adminAuthMiddleware` to all routes
  - GET `/orgs` — list with pagination (page, limit query params)
  - POST `/orgs` — create org manually
  - PATCH `/orgs/:orgId` — update limits/status
  - GET `/orgs/:orgId/keys` — list org keys
  - DELETE `/keys/:keyId` — revoke key
  - GET `/stats` — `{ totalOrgs, totalKeys, activeKeys, activeTunnels }` using `tunnelManager.getStats()`

### Step 8: Create API router factory
- `api/create-api-router.ts`:
  - Accept `{ keyStore, tunnelManager }` dependencies
  - Configure `express.json({ limit: '1mb' })`
  - Configure `cors({ origin: process.env.CORS_ORIGIN || '*' })`
  - Mount auth routes (public)
  - Mount admin routes (admin token)
  - Mount customer routes placeholder (Phase 3)
  - Mount error handler middleware last

### Step 9: Add auth constants to shared
- In `constants.ts`: `JWT_EXPIRY: '24h'`, `BCRYPT_ROUNDS: 12`, rate limit defaults

### Step 10: Write tests
- Auth routes: signup flow, login, duplicate email, wrong password, inactive user/org
- Admin routes: CRUD orgs, list keys, revoke, stats (with mocked tunnelManager)
- Use vitest + supertest for HTTP endpoint testing

### Step 11: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Install express, jsonwebtoken, bcrypt, zod, cors
- [ ] Create `api/create-api-router.ts` (router factory with DI)
- [ ] Create `api/middleware/jwt-auth-middleware.ts`
- [ ] Create `api/middleware/admin-auth-middleware.ts`
- [ ] Create `api/middleware/rate-limit-middleware.ts`
- [ ] Create `api/middleware/validate-input-middleware.ts`
- [ ] Create `api/middleware/error-handler-middleware.ts`
- [ ] Create `services/auth-service.ts` (signup + login, NO email verification)
- [ ] Create `services/org-service.ts`
- [ ] Create `services/api-key-service.ts`
- [ ] Create `api/auth-routes.ts`
- [ ] Create `api/admin-routes.ts`
- [ ] Update `server.ts` — Express wrap + API router + relay catch-all
- [ ] Add auth constants to shared/constants.ts
- [ ] Write auth + admin tests
- [ ] Run lint + build + test

## Success Criteria

- User can signup with email+password → receives JWT immediately (no email verification)
- User can login → receives JWT
- Admin can list/create/update orgs with ADMIN_TOKEN
- Admin can list/revoke keys
- Admin can view stats including activeTunnels (from tunnelManager)
- Express.json() only parses /api/* requests, not tunnel relay
- WS upgrade still works correctly through Express
- Tunnel relay catch-all handles all non-API requests
- CORS headers present on API responses
- All API endpoints return TuneloError JSON format
- Rate limiting blocks excessive signup/login attempts
- `JWT_SECRET` missing → server fails fast at startup
- `pnpm build` + `pnpm lint` + `pnpm test` green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Express conflicts with relay handler | Low | High | Mount API routes BEFORE catch-all relay |
| Express parses relay request bodies | Low | High | express.json() ONLY on /api router, not global |
| JWT secret not set in prod | Medium | Critical | Fail-fast at startup if `JWT_SECRET` missing |
| bcrypt slow on high signup volume | Low | Low | Cost factor 12 = ~250ms, rate limited anyway |
| WS upgrade broken by Express | Low | Critical | WS uses server.on('upgrade'), bypasses Express |

## Security Considerations

- **JWT_SECRET** required env var — server MUST NOT start without it (when MONGO_URI set)
- **bcrypt cost 12** — 250ms per hash, resistant to brute force
- **Rate limiting** — IP-based, in-memory (sufficient for single server)
- **Input validation** — Zod schemas on all endpoints
- **No password in response** — only return token on login/signup
- **Admin token** — separate from user JWT, env-only, never in DB
- **CORS** — configurable origin, default `*` in dev only
- **Structured errors** — TuneloError format, never leak stack traces

## Next Steps
- Phase 3 depends on: Express integration + auth service + JWT middleware working
- Phase 3 adds: customer-facing key management API, org limits enforcement
