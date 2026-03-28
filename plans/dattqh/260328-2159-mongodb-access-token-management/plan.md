---
title: "MongoDB Access Token Management"
description: "Multi-tenant SaaS with self-service key management, MongoDB-backed auth replacing keys.json"
status: pending
priority: P1
effort: 40h
branch: feat/mongodb-access-management
tags: [auth, backend, database, multi-tenant]
created: 2026-03-28
---

# MongoDB Access Token Management

## Overview

Replace static `keys.json` auth with MongoDB-backed multi-tenant access management. Users self-signup, create orgs, manage API keys. Admin REST API + customer portal.

**Approach:** MongoDB direct query (no cache) → upgrade to in-memory cache later.
**DB Driver:** Mongoose with `.lean()` on all reads.
**HTTP Framework:** Express.js wrapping existing raw http server.
**Brainstorm:** [review report](../reports/brainstorm-260328-2359-mongodb-plan-review.md)

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | MongoDB + KeyStore + TunnelConnection enhancement | Pending | 8h | [phase-01](./phase-01-mongodb-setup-and-key-store.md) |
| 2 | Express integration + User auth + Admin API | Pending | 12h | [phase-02](./phase-02-express-auth-and-admin-api.md) |
| 3 | Customer API + Org limits enforcement | Pending | 10h | [phase-03](./phase-03-customer-api-and-org-limits.md) |
| 4 | Dashboard UI + Usage tracking | Pending | 10h | [phase-04](./phase-04-dashboard-and-usage-tracking.md) |

## Dependencies

- MongoDB standalone instance accessible from server
- `MONGO_URI` env var for connection string
- No replica set required (direct queries only)
- Phase 2: `express`, `jsonwebtoken`, `bcrypt`, `zod`, `cors`
- Phase 4: `react`, `vite`, `recharts` (dashboard package)

## Key Decisions

- **No cache Phase 1** — auth 1x per WS connection, ~3ms MongoDB query acceptable
- **KeyStore interface** — abstract to swap JSON file (dev) / MongoDB (prod)
- **Self-service from day 1** — users signup, create org, manage keys
- **No email verification** — signup creates active user immediately
- **Free tier only** — schema extensible for billing later, NOT implemented now
- **Admin token in env** — simple admin auth, no admin user system
- **Express.json() scoped** — ONLY on /api router, NOT global (relay handler gets raw req/res)
- **DI pattern** — route factories accept dependencies (keyStore, tunnelManager)
- **TunnelConnection enhanced in Phase 1** — apiKeyHash + orgId added early, avoids double-refactor

## Critical Integration Notes

### Express + Raw HTTP + WS Coexistence
```
const app = express();
app.use('/api', apiRouter);              // API (with express.json, cors)
app.use('/dashboard', express.static()); // Dashboard SPA (Phase 4)
app.use((req, res) => relay(req, res));  // Catch-all: tunnel relay (raw)
const server = http.createServer(app);
attachWsHandler(server);                 // WS upgrade, independent of Express
```

WS upgrade hooks into `server.on('upgrade')` — unaffected by Express middleware stack.
Relay handler receives raw req/res without body parsing overhead.

## Validation Summary

**Validated:** 2026-03-29
**Questions asked:** 6

### Confirmed Decisions
- **MongoDB down runtime:** Reject all new WS auth. Existing tunnels continue working.
- **Remove org concept entirely:** Target individual users, not organizations. 2 collections only: users + api-keys.
- **No admin system:** No ADMIN_TOKEN, no admin API, no admin dashboard. Abuse handled by rate limiting + manual DB.
- **No member/invite flow:** Single role "user". No role system needed.
- **userId replaces orgId:** KeyInfo, TunnelConnection, api-keys all use userId instead of orgId.
- **Dashboard = customer portal only:** Login + Key management + Usage chart + Profile. ~6h effort.
- **Admin revoke:** N/A — no admin routes.

### Action Items (Plan Revision Required)
- [ ] Remove `organizations` collection and org-related code from all phases
- [ ] Replace `orgId` → `userId` in: KeyInfo, TunnelConnection, api-keys schema, all services
- [ ] Remove admin routes, admin middleware, ADMIN_TOKEN from Phase 2
- [ ] Remove org-service.ts from Phase 2
- [ ] Simplify signup: only create user (no org creation)
- [ ] Move limits from org → user document (maxKeys, maxTunnelsPerKey)
- [ ] Remove admin dashboard pages from Phase 4
- [ ] Remove org-table component from Phase 4
- [ ] Reduce effort estimates (~30h total instead of 40h)
- [ ] Add MongoDB-down handling: reject new auth with error in MongoKeyStore.validate()
