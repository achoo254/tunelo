# Phase 4: Dashboard UI + Usage Tracking

## Context Links
- [Phase 1](./phase-01-mongodb-setup-and-key-store.md) — MongoDB + KeyStore
- [Phase 2](./phase-02-user-auth-and-admin-api.md) — User auth + Admin API
- [Phase 3](./phase-03-customer-api-and-org-limits.md) — Customer API + Limits

## Overview
- **Priority:** P2
- **Status:** Pending
- **Effort:** 10h
- **Description:** Admin dashboard + customer portal (simple React SPA or server-rendered HTML). Usage tracking via async MongoDB writes. Stats endpoints for dashboard consumption.

## Key Insights
- Dashboard is the final user-facing layer — all APIs from Phase 2-3 must be stable
- Usage tracking should be async fire-and-forget — MUST NOT add latency to request relay
- Two UI surfaces: admin dashboard (manage all orgs/keys) + customer portal (manage own keys)
- Keep UI simple — this is a developer tool, not a consumer app. Function > aesthetics.
- Consider: serve static SPA from the same server vs separate frontend deployment

## Requirements

### Functional
- **Usage tracking:**
  - Track per-key: request count, bytes in/out per day
  - Async writes — batch or fire-and-forget to `usage-logs` collection
  - GET `/api/usage` — customer's own usage (daily aggregation)
  - GET `/api/admin/usage` — all usage, filterable by org/key/date
- **Customer portal:**
  - Login page
  - Dashboard: active tunnels, key list, usage chart
  - Key management: create, revoke, copy prefix
  - Profile: change password
- **Admin dashboard:**
  - Login with admin token
  - Overview: total orgs, users, keys, active tunnels
  - Org list: search, filter by status, view details
  - Org detail: keys, usage, suspend/activate
  - Key management: revoke any key

### Non-Functional
- Usage writes MUST NOT block request relay (<1ms overhead)
- Dashboard loads in <2s
- Responsive (works on mobile for quick checks)
- No build step dependency for server — serve pre-built static files

## Architecture

```
Usage Tracking Flow:
  request-relay.ts → relayRequest()
    → after response received:
    → usageTracker.record({ keyHash, bytesIn, bytesOut })  ← fire-and-forget

  UsageTracker:
    → in-memory buffer (Map<keyHash, { count, bytesIn, bytesOut }>)
    → flush to MongoDB every 60s or when buffer > 1000 entries
    → uses bulkWrite for efficiency

Dashboard:
  /dashboard/*  → serve static SPA (React + Vite)
  /api/*        → existing API endpoints
```

### Usage Schema
```typescript
// usage-logs collection
{
  keyId: ObjectId,          // ref → api-keys
  orgId: ObjectId,          // ref → organizations (denormalized for query speed)
  date: String,             // "2026-03-28" (daily bucket)
  requestCount: Number,
  bytesIn: Number,
  bytesOut: Number,
  tunnelMinutes: Number,    // future: calculated from connection duration
}
// Compound index: { orgId: 1, date: -1 }
// Compound index: { keyId: 1, date: -1 }
```

## Related Code Files

### Files to CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/services/usage-tracker.ts` | Buffered async usage tracking |
| `packages/server/src/db/models/usage-log-model.ts` | Mongoose UsageLog schema |
| `packages/server/src/api/usage-routes.ts` | `/api/usage`, `/api/admin/usage` endpoints |
| `packages/server/src/__tests__/usage-tracker.test.ts` | Usage tracker tests |
| `packages/dashboard/` | NEW package: React SPA for admin + customer portal |
| `packages/dashboard/src/pages/login-page.tsx` | Login form |
| `packages/dashboard/src/pages/customer-dashboard.tsx` | Customer home |
| `packages/dashboard/src/pages/customer-keys-page.tsx` | Key management |
| `packages/dashboard/src/pages/admin-dashboard.tsx` | Admin overview |
| `packages/dashboard/src/pages/admin-orgs-page.tsx` | Org management |
| `packages/dashboard/src/components/usage-chart.tsx` | Usage visualization |
| `packages/dashboard/package.json` | Dashboard package config |

### Files to MODIFY
| File | Change |
|------|--------|
| `packages/server/src/request-relay.ts` | Add usage tracking after relay completes |
| `packages/server/src/server.ts` | Initialize UsageTracker, serve dashboard static files |
| `packages/server/src/api/api-router.ts` | Mount usage routes |
| `package.json` (root) | Add dashboard to workspaces, build script |

## Implementation Steps

### Step 1: Create UsageLog model
- `usage-log-model.ts`: schema with compound indexes

### Step 2: Create UsageTracker service
- `usage-tracker.ts`:
  - `record(keyHash, orgId, bytesIn, bytesOut)` — add to in-memory buffer
  - Buffer: `Map<string, { orgId, keyId, count, bytesIn, bytesOut }>` keyed by `keyHash:date`
  - `flush()` — bulkWrite upsert to usage-logs (increment counts)
  - Auto-flush: setInterval every 60s
  - `shutdown()` — flush remaining buffer

### Step 3: Integrate usage tracking in request-relay
- After successful relay response:
  ```typescript
  usageTracker.record(tunnel.apiKeyHash, tunnel.orgId, reqSize, resSize);
  ```
- Calculate bytesIn/bytesOut from request/response body lengths

### Step 4: Create usage routes
- `usage-routes.ts`:
  - GET `/api/usage?from=2026-03-01&to=2026-03-28` — customer's org usage, daily aggregation
  - GET `/api/admin/usage?orgId=xxx&from=&to=` — admin filtered usage
- Return: `[{ date, requestCount, bytesIn, bytesOut }]`

### Step 5: Create dashboard package
- Initialize `packages/dashboard/` with Vite + React + TypeScript
- Minimal dependencies: react, react-router, lightweight chart lib (recharts or chart.js)
- Build output: `packages/dashboard/dist/` static files

### Step 6: Implement dashboard pages
- Login page: email + password → JWT → localStorage
- Customer dashboard: active tunnels count, recent usage chart, key list
- Key management: create (shows key once in modal), revoke with confirmation
- Admin dashboard: stats cards, org table with search/filter
- Admin org detail: org info, keys, usage, suspend button

### Step 7: Serve dashboard from server
- In `server.ts`: serve `packages/dashboard/dist/` at `/dashboard/*`
- SPA fallback: all `/dashboard/*` routes → `index.html`

### Step 8: Write tests
- UsageTracker: buffer, flush, concurrent writes
- Usage routes: date filtering, org isolation
- Dashboard: basic render tests (optional, low priority)

### Step 9: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Create `db/models/usage-log-model.ts`
- [ ] Create `services/usage-tracker.ts`
- [ ] Integrate usage tracking in `request-relay.ts`
- [ ] Create `api/usage-routes.ts`
- [ ] Mount usage routes in `api-router.ts`
- [ ] Initialize dashboard package (`packages/dashboard/`)
- [ ] Implement login page
- [ ] Implement customer dashboard + key management pages
- [ ] Implement admin dashboard + org management pages
- [ ] Implement usage chart component
- [ ] Serve dashboard static files from server
- [ ] Write usage tracker tests
- [ ] Run lint + build + test

## Success Criteria

- Usage data recorded async — no relay latency impact
- Customer can view own usage (daily chart)
- Admin can view all usage, filter by org/date
- Customer portal: login, view tunnels, create/revoke keys, usage chart
- Admin portal: overview stats, manage orgs, manage keys, view usage
- Dashboard accessible at `/dashboard/`
- `pnpm build` + `pnpm lint` + `pnpm test` green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Usage buffer memory leak | Medium | Medium | Cap buffer size (1000 entries), force flush |
| Dashboard adds build complexity | Medium | Low | Separate package, independent build |
| Chart library bloat | Low | Low | Use lightweight lib (recharts ~45KB gzipped) |
| Usage data grows unbounded | Medium | Medium | TTL index on old data, or monthly aggregation |

## Security Considerations

- **Usage routes** — customer sees only own org; admin sees all
- **Dashboard auth** — JWT in localStorage (acceptable for dev tool)
- **Admin dashboard** — separate login with ADMIN_TOKEN
- **No sensitive data in usage** — only counts and byte sizes

## Next Steps (Post-Phase 4)
- Billing integration: use usage-logs for metered billing
- OAuth providers: Google/GitHub login for customer portal
- In-memory key cache (Approach A upgrade): if auth latency becomes issue
- Rate limit per key: use usage tracking data for dynamic limits
