# Brainstorm: MongoDB Access Token Plan Review

**Date:** 2026-03-28
**Status:** Agreed
**Original plan:** `260328-2159-mongodb-access-token-management/plan.md`

## Context

Second-opinion review of existing MongoDB Access Token Management plan before implementation. Reviewed all 4 phases, codebase patterns, and architectural decisions.

## Validated Decisions (Keep)

- **MongoDB direct query (no cache)** — auth 1x/WS connection, ~3ms acceptable
- **KeyStore abstraction** — JSON file (dev) / MongoDB (prod) via env var
- **Mongoose + `.lean()`** — team familiarity, schema self-documenting, negligible perf diff
- **4-phase ordering** — DB → Auth API → Customer API → UI
- **Schema design** — orgs, users, api-keys with proper indexes
- **Admin token in env** — simple, no admin user system
- **Free tier only** — extensible schema, billing NOT now

## Issues Found & Fixes

### 1. Phase 2: Email Verification Inconsistency (Medium)
- **Problem:** Validation confirmed skip email verification, but Phase 2 still has full verify-email flow (endpoint, auth flow, Nodemailer mention)
- **Fix:** Remove `POST /api/auth/verify-email`, remove `emailVerified` field logic, remove Nodemailer dependency. Signup → immediate active user.

### 2. Express Body Parsing Scope (High)
- **Problem:** Plan doesn't specify where `express.json()` applies. If global, relay handler would attempt to parse tunnel request bodies (potentially large file uploads).
- **Fix:** Apply `express.json({ limit: '1mb' })` ONLY on `/api` router, NOT globally. Relay handler receives raw req/res.

### 3. Express Integration Pattern (High)
- **Problem:** Plan says "wrap with Express" but doesn't detail coexistence with WS upgrade + relay handler.
- **Fix:** Express app as http handler, API routes first, relay as catch-all. WS upgrade on `server.on('upgrade')` — unaffected by Express.
```
const app = express();
app.use('/api', apiRouter);        // API routes (with express.json)
app.use('/dashboard', static);     // Dashboard SPA (Phase 4)
app.use((req, res) => relay(req, res));  // Catch-all: tunnel relay
const server = http.createServer(app);
attachWsHandler(server);           // WS upgrade, independent of Express
```

### 4. CORS for Dashboard Dev (Low)
- **Problem:** Phase 4 dashboard SPA in dev mode (Vite dev server on different port) needs CORS.
- **Fix:** Add CORS middleware on API router from Phase 2. Configurable via env `CORS_ORIGIN`.

### 5. Missing express.json() in Plan (Medium)
- **Problem:** Phase 2 doesn't mention body parsing middleware.
- **Fix:** Add to Phase 2 Step 2 explicitly.

### 6. tunnelManager Injection to Admin Routes (Medium)
- **Problem:** `GET /api/admin/stats` returns `activeTunnels` count — needs access to `tunnelManager`. Plan doesn't specify how to inject this dependency.
- **Fix:** Admin route factory function accepts `tunnelManager` parameter. Same pattern for usage routes in Phase 4.

### 7. Phase 1-3 Overlapping File Changes (Medium)
- **Problem:** Both Phase 1 and Phase 3 modify `ws-handler.ts` and `tunnel-manager.ts`. Phase 1 changes auth flow, Phase 3 adds org limits.
- **Fix:** Phase 1 should already add `orgId` + `apiKeyHash` to TunnelConnection (from KeyInfo), not defer to Phase 3. This avoids double-refactor of the same files.

## Recommendations for New Plan

1. **Merge TunnelConnection changes into Phase 1** — add orgId/apiKeyHash from KeyInfo immediately
2. **Express integration detailed in Phase 2** — clear pattern with scoped middleware
3. **Remove all email verification from Phase 2** — clean slate, no dead code
4. **Add CORS + body parsing as explicit steps** in Phase 2
5. **DI pattern for routes** — factory functions accepting dependencies (keyStore, tunnelManager)
6. **Phase 4 scope unchanged** — 10h tight but achievable for developer-tool-grade UI

## Next Steps

Create new implementation plan integrating all fixes above. Keep same 4-phase structure with corrections applied.
