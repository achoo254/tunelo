# Brainstorm: MongoDB Access Token Management

**Date:** 2026-03-28
**Status:** Agreed
**Timeline:** Full feature, 1-2 months

## Problem Statement

Current auth: `keys.json` file with plaintext key array, SHA-256 hashed in memory, boolean validate only. No metadata, no user management, no self-service. Need to support external customers with multi-tenant SaaS model.

## Requirements

- **Multi-tenant SaaS** — orgs, users, API keys with metadata
- **Self-service** — users signup, create org, manage own keys
- **Free tier** — no billing now, schema extensible for usage-based billing later
- **MongoDB** — team has experience + existing infra (standalone, not replica set)
- **REST API + Admin dashboard** — CRUD orgs, keys, usage stats
- **Admin + Customer portal** — admin manages all, customers manage own keys

## Evaluated Approaches

### Approach A: MongoDB + In-memory Cache
- Pros: O(1) auth lookup, Change Stream auto-sync
- Cons: Change Stream needs replica set (not available), cache invalidation complexity
- **Verdict:** Good for Phase 2 upgrade, not Phase 1

### Approach B: MongoDB + Redis Cache
- Pros: Sub-ms lookup, built-in TTL, rate limiting
- Cons: 2 dependencies, over-engineering, YAGNI
- **Verdict:** Rejected — overkill for current scale (5-10k tunnels)

### Approach C: MongoDB Direct Query (No Cache) ✅
- Pros: Simplest, always consistent, auth only 1x per WS connection (~3ms)
- Cons: Latency per auth (negligible for 1x/connection)
- **Verdict:** Best for Phase 1. Upgrade to A when needed.

## Agreed Solution

### Architecture
```
User signup → MongoDB (users, orgs, api-keys)
              ↓
WS Auth → KeyStore.validate(hash) → MongoDB.findOne() → KeyInfo
              ↓
Admin API → CRUD orgs/keys/users + stats
Customer API → Manage own keys, view usage
```

### Approach: C → A (Direct query first, cache later)
### Key Creation: Self-service (users signup + generate own keys)
### Auth: User authentication (email+password or OAuth) for portal + API key for tunnel

### MongoDB Schema

**organizations:**
```
{ _id, name, slug (unique), plan: "free", contactEmail,
  limits: { maxKeys: 5, maxTunnelsPerKey: 3, maxRequestsPerDay: 10000 },
  status: "active"|"suspended", createdAt, updatedAt }
```

**users:**
```
{ _id, orgId (ref), email (unique), passwordHash, role: "owner"|"member",
  emailVerified: boolean, status: "active"|"suspended", createdAt }
```

**api-keys:**
```
{ _id, orgId (ref), createdBy (ref→users), keyHash (SHA-256, unique index),
  keyPrefix: "tk_abc" (first 7 chars), label, status: "active"|"revoked",
  expiresAt (TTL index), lastUsedAt, createdAt }
```

**usage-logs (future):**
```
{ _id, keyId, orgId, date: "2026-03-28", requestCount, bytesIn, bytesOut, tunnelMinutes }
```

### Key Abstraction
```typescript
interface KeyStore {
  validate(keyHash: string): Promise<KeyInfo | null>;
  recordUsage(keyHash: string): Promise<void>;
}
// Implementations: MongoKeyStore (prod), JsonFileKeyStore (dev/fallback)
```

### API Endpoints

**Auth (public):**
- POST /api/auth/signup — email + password
- POST /api/auth/login — returns JWT
- POST /api/auth/verify-email

**Customer (JWT auth):**
- GET /api/keys — list own keys
- POST /api/keys — create new key (returns plaintext ONCE)
- DELETE /api/keys/:id — revoke key
- GET /api/usage — own usage stats

**Admin (admin token):**
- GET/POST/PATCH /api/admin/orgs
- GET /api/admin/orgs/:id/keys
- DELETE /api/admin/keys/:id
- GET /api/admin/stats

### Migration Phases

| Phase | Week | Scope |
|-------|------|-------|
| 1 | 1-2 | MongoDB connection, schema, KeyStore abstraction, migrate auth.ts |
| 2 | 3-4 | User auth (signup/login/JWT), Admin REST API |
| 3 | 5-6 | Customer API (self-service keys), org limits enforcement |
| 4 | 7-8 | Dashboard UI (admin + customer portal), usage tracking |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MongoDB down | High | Fallback to in-memory cache (stale 5min OK) |
| Self-service abuse | High | Rate limit signup, email verification required |
| Admin API exposed | High | Separate auth, network restriction |
| Standalone no transactions | Medium | Use atomic `findOneAndUpdate` ops |
| Scope creep (billing) | Medium | Schema ready but DON'T implement billing now |

### NOT doing now
- Redis cache — YAGNI
- Change Streams — needs replica set
- Billing/payment — schema ready, implement later
- Rate limit per key — global limit sufficient
- IP whitelist — enterprise feature
- OAuth providers (Google, GitHub) — email+password first

## Success Metrics
- External users can self-signup and create tunnel keys
- Admin can manage all orgs/keys via API
- Auth latency <10ms per connection
- Zero downtime migration from keys.json
- Schema supports future billing without breaking changes
