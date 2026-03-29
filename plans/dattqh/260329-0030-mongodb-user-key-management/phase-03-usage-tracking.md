---
phase: 3
title: "Usage Tracking"
status: completed
effort: 5h
depends_on: [phase-02]
---

# Phase 3: Usage Tracking

## Context Links
- [Phase 1](phase-01-mongodb-keystore.md) — MongoKeyStore, ApiKey model
- [Phase 2](phase-02-express-auth-api.md) — Express /api router, JWT auth
- [request-relay.ts](../../../packages/server/src/request-relay.ts) — relay handler (integration point)

## Overview
- **Priority:** P2
- **Status:** pending
- Track per-key usage (request counts, bytes) with daily bucketed UsageLog collection. In-memory buffer flushes to MongoDB periodically. API endpoint for user's own usage stats.

## Key Insights
- Fire-and-forget after relay — no latency impact on tunnel responses
- In-memory buffer avoids per-request MongoDB writes; flush every 60s or >1000 entries
- Daily buckets (YYYY-MM-DD) with $inc upserts — atomic, no read-before-write
- Compound indexes for efficient per-user and per-key date range queries

## Requirements

### Functional
- F1: UsageLog Mongoose model with daily buckets
- F2: UsageTracker service: buffer in-memory, periodic flush via $inc upserts
- F3: Integration in request-relay.ts after successful relay
- F4: GET /api/usage — own usage, filterable by date range (default: last 30 days)
- F5: GET /api/admin/usage — system-wide usage (admin only), aggregated across all users
- F6: Graceful flush on shutdown

### Non-Functional
- NF1: Zero latency impact on relay (fire-and-forget)
- NF2: Buffer flush: every 60s or when >1000 entries accumulated
- NF3: Compound indexes: (userId, date), (keyId, date)
- NF4: Usage buffer behind BufferStore interface (Redis-swappable)

## Architecture

```
request-relay.ts
  └── usageTracker.record(keyHash, bytesIn, bytesOut)  // fire-and-forget, sync push to buffer

UsageTracker (singleton)
  buffer: Map<compositeKey, { requestCount, bytesIn, bytesOut }>
  compositeKey = `${keyId}:${date}`
  flush(): bulkWrite $inc upserts to UsageLog collection
  interval: setInterval(flush, 60_000)
```

## Related Code Files

### CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/db/models/usage-log-model.ts` | UsageLog mongoose model |
| `packages/server/src/services/usage-tracker.ts` | Buffer + periodic flush service |
| `packages/server/src/api/usage-routes.ts` | GET /api/usage endpoint |
| `packages/server/src/api/schemas/usage-schemas.ts` | Zod schema for query params |

### MODIFY
| File | Changes |
|------|---------|
| `packages/server/src/request-relay.ts` | Call usageTracker.record() after relay response |
| `packages/server/src/api/create-api-router.ts` | Mount usage routes |
| `packages/server/src/server.ts` | Initialize/shutdown usageTracker |
| `packages/server/src/key-store/mongo-key-store.ts` | Implement recordUsage() to call usageTracker |

## Implementation Steps

### 1. Create UsageLog model (`db/models/usage-log-model.ts`)
```typescript
const usageLogSchema = new Schema({
  keyId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  date: { type: String, required: true },  // "YYYY-MM-DD"
  requestCount: { type: Number, default: 0 },
  bytesIn: { type: Number, default: 0 },
  bytesOut: { type: Number, default: 0 },
});
usageLogSchema.index({ userId: 1, date: 1 });
usageLogSchema.index({ keyId: 1, date: 1 });
```

### 2. Create UsageTracker (`services/usage-tracker.ts`)
- Buffer: `Map<string, { keyId, userId, requestCount, bytesIn, bytesOut }>`
- `record(keyId, userId, bytesIn, bytesOut)`: increment buffer entry (sync, no await)
- `flush()`: if buffer empty, return. Build bulkWrite ops with $inc upsert, clear buffer
- `start()`: setInterval(flush, 60_000)
- `stop()`: clearInterval, final flush()
- Composite key: `${keyId}:${date}` where date = new Date().toISOString().slice(0, 10)

### 3. Create usage schemas (`api/schemas/usage-schemas.ts`)
- usageQuerySchema: { startDate?: string (YYYY-MM-DD), endDate?: string, keyId?: string }

### 4. Create usage routes (`api/usage-routes.ts`)
- GET / : JWT auth, query UsageLog by userId + date range, aggregate by date or by key
- Return: `{ usage: [{ date, requestCount, bytesIn, bytesOut }] }`

### 5. Integrate in request-relay.ts
- createRelayHandler() already accepts deps from Phase 2 refactor — add usageTracker to deps
- After successful relay response (in .then()), calculate bytesIn/bytesOut from request/response body
- Get tunnel connection from subdomain, extract keyId/userId (both stored on TunnelConnection since Phase 1)
- Call usageTracker.record(keyId, userId, bytesIn, bytesOut)

### 6. Create admin usage route in admin-routes.ts (from Phase 2)
- GET /api/admin/usage: aggregate all UsageLogs, group by date, return system-wide totals
- Protected by admin-guard middleware

### 7. Mount usage routes in create-api-router.ts

### 8. Update server.ts
- usageTracker.start() after keyStore.initialize()
- usageTracker.stop() in shutdown handler (before keyStore.shutdown)

### 8. Tests
- Unit: UsageTracker buffer accumulation + flush
- Unit: usage-routes with mock data
- Integration: relay -> usage recorded in DB

## Todo List
- [x] Create usage-log-model.ts
- [x] Create usage-tracker.ts
- [x] Create usage-schemas.ts
- [x] Create usage-routes.ts
- [x] Integrate tracking in request-relay.ts
- [x] Mount routes in create-api-router.ts
- [x] Update server.ts lifecycle
- [x] Write tests
- [x] Run biome lint + fix

## Success Criteria
- Relay requests increment usage counters (fire-and-forget)
- Buffer flushes to MongoDB every 60s
- GET /api/usage returns per-day usage for authenticated user
- Graceful shutdown flushes remaining buffer
- No latency impact on relay responses

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Buffer lost on crash | Acceptable — usage data is non-critical, at-most-once semantics |
| MongoDB write failures during flush | Log error, retain buffer for next flush attempt |
| Memory growth if flush fails repeatedly | Cap buffer at 10k entries, drop oldest on overflow |

## Security Considerations
- Users can only query own usage (userId from JWT)
- No PII in usage logs (only objectIds and counts)

## Next Steps
- Phase 4 builds dashboard SPA consuming /api/usage + /api/keys endpoints
