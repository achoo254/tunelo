# Brainstorm: Plan Issues Fix

**Date:** 2026-03-29
**Plan:** `260329-0030-mongodb-user-key-management/`

## Issues Found & Fixed

### 1. TunnelConnection missing keyId (HIGH)
- **Problem:** Phase 3 needs `keyId` for usage tracking, but TunnelConnection only had apiKeyHash + userId
- **Fix:** Added `keyId: string` to TunnelConnection in Phase 1. KeyInfo already has keyId. Passed through register().

### 2. Key prefix inconsistency (MEDIUM)
- **Problem:** Phase 2 said `tunelo_` but old brainstorm said `tk_`
- **Fix:** Confirmed `tunelo_` prefix. Total key length: `tunelo_` + nanoid(32) = 39 chars.

### 3. createRelayHandler DI (MEDIUM)
- **Problem:** Phase 3 needs usageTracker in relay handler, but relay handler didn't accept deps
- **Fix:** Phase 2 refactors createRelayHandler() to accept deps object `{ tunnelManager }`. Phase 3 adds `usageTracker` to deps.

### 4. bcrypt rounds inconsistency (LOW)
- **Problem:** Phase 2 said cost 10, original brainstorm said 12
- **Fix:** Standardized to cost factor 12. ~250ms per hash, acceptable with rate limiting.

### 5. JWT_SECRET requirement scope (MEDIUM)
- **Problem:** When JWT_SECRET should fail-fast? Dev mode (JsonFileKeyStore) doesn't need JWT.
- **Fix:** JWT_SECRET required ONLY when MONGO_URI is set. Dev mode with JSON file doesn't mount API routes.

## Files Updated
- `phase-01-mongodb-keystore.md` — added keyId to TunnelConnection, register() signature
- `phase-02-express-auth-api.md` — key prefix, bcrypt rounds, relay DI, JWT_SECRET scope
- `phase-03-usage-tracking.md` — clarified relay DI and keyId availability
- `plan.md` — minor update
