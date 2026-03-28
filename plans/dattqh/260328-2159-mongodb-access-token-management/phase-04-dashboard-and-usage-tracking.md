# Phase 4: Dashboard UI + Usage Tracking

## Context Links
- [Phase 1](./phase-01-mongodb-setup-and-key-store.md) — MongoDB + KeyStore
- [Phase 2](./phase-02-express-auth-and-admin-api.md) — Express + Auth + Admin API
- [Phase 3](./phase-03-customer-api-and-org-limits.md) — Customer API + Limits
- [request-relay.ts](../../packages/server/src/request-relay.ts)

## Overview
- **Priority:** P2
- **Status:** Pending
- **Effort:** 10h
- **Description:** Async usage tracking (buffered writes). Usage API endpoints. React SPA dashboard for admin + customer portal. Served as static files from same server.

## Key Insights
- Usage tracking MUST be async fire-and-forget — zero impact on relay latency
- In-memory buffer flushed every 60s or when >1000 entries → bulkWrite to MongoDB
- Two UI surfaces: admin dashboard (manage all) + customer portal (manage own keys)
- Developer tool → function over aesthetics, keep UI simple
- Dashboard served from same server at `/dashboard/*` → no CORS issues in production
- Dev mode: Vite dev server on separate port → CORS already configured in Phase 2
- If server crashes, buffered usage data is lost — acceptable for analytics (not billing)

## Requirements

### Functional
- **Usage tracking:**
  - Track per-key: request count, bytes in/out per day
  - Async buffer → flush to `usage-logs` collection via bulkWrite
  - GET `/api/usage` — customer's own usage (daily aggregation, date range)
  - GET `/api/admin/usage` — all usage, filterable by org/key/date
- **Customer portal:**
  - Login page (email + password → JWT → localStorage)
  - Dashboard: active tunnels count, key list, recent usage chart
  - Key management: create (show key once in modal), revoke with confirmation
  - Profile: change password
- **Admin dashboard:**
  - Login with admin token
  - Overview: total orgs, users, keys, active tunnels (cards)
  - Org list: search, filter by status
  - Org detail: keys, usage, suspend/activate
  - Key management: revoke any key

### Non-Functional
- Usage writes MUST NOT block request relay (<1ms overhead)
- Buffer cap: 1000 entries max, force flush when reached
- Dashboard loads in <2s
- Responsive (mobile-friendly for quick checks)
- No build-step dependency for server — serve pre-built static files

## Architecture

### Usage Tracking Flow
```
request-relay.ts → relayRequest() success
  → usageTracker.record({ keyHash, orgId, bytesIn, bytesOut })  ← fire-and-forget

UsageTracker:
  → in-memory buffer: Map<"keyHash:YYYY-MM-DD", { orgId, count, bytesIn, bytesOut }>
  → flush conditions: every 60s OR buffer.size > 1000
  → flush(): bulkWrite upsert to usage-logs (atomic increment)
  → shutdown(): flush remaining buffer before exit
```

### Dashboard Architecture
```
packages/dashboard/          ← NEW package
  ├── src/
  │   ├── pages/
  │   │   ├── login-page.tsx
  │   │   ├── customer-dashboard.tsx
  │   │   ├── customer-keys-page.tsx
  │   │   ├── admin-dashboard.tsx
  │   │   └── admin-orgs-page.tsx
  │   ├── components/
  │   │   ├── usage-chart.tsx
  │   │   ├── key-list.tsx
  │   │   └── org-table.tsx
  │   ├── lib/
  │   │   └── api-client.ts   ← fetch wrapper with JWT
  │   └── main.tsx
  ├── package.json
  └── vite.config.ts

Server serves: /dashboard/* → packages/dashboard/dist/
SPA fallback: /dashboard/* → index.html
```

### Usage Schema
```typescript
// usage-logs collection
{
  keyId: ObjectId,          // ref → api-keys
  orgId: ObjectId,          // ref → organizations (denormalized)
  date: String,             // "2026-03-28" (daily bucket)
  requestCount: Number,     // incremented via $inc
  bytesIn: Number,          // incremented via $inc
  bytesOut: Number,         // incremented via $inc
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
| `packages/server/src/__tests__/usage-tracker.test.ts` | Usage tracker buffer + flush tests |
| `packages/dashboard/package.json` | Dashboard package config |
| `packages/dashboard/vite.config.ts` | Vite config with API proxy for dev |
| `packages/dashboard/src/main.tsx` | React app entry |
| `packages/dashboard/src/pages/login-page.tsx` | Login form |
| `packages/dashboard/src/pages/customer-dashboard.tsx` | Customer home |
| `packages/dashboard/src/pages/customer-keys-page.tsx` | Key management |
| `packages/dashboard/src/pages/admin-dashboard.tsx` | Admin overview |
| `packages/dashboard/src/pages/admin-orgs-page.tsx` | Org management |
| `packages/dashboard/src/components/usage-chart.tsx` | Usage visualization (recharts) |
| `packages/dashboard/src/components/key-list.tsx` | Key list with create/revoke |
| `packages/dashboard/src/components/org-table.tsx` | Org table with search/filter |
| `packages/dashboard/src/lib/api-client.ts` | Fetch wrapper with JWT auth |

### Files to MODIFY
| File | Change |
|------|--------|
| `packages/server/src/request-relay.ts` | Add `usageTracker.record()` after successful relay |
| `packages/server/src/server.ts` | Initialize UsageTracker, serve dashboard static files, flush on shutdown |
| `packages/server/src/api/create-api-router.ts` | Mount usage routes |
| `package.json` (root) | Add dashboard to workspaces, add `build:dashboard` script |
| `pnpm-workspace.yaml` | Add `packages/dashboard` |

## Implementation Steps

### Step 1: Create UsageLog model
- `db/models/usage-log-model.ts`: schema with compound indexes on (orgId, date) and (keyId, date)

### Step 2: Create UsageTracker service
- `services/usage-tracker.ts`:
  - `record(keyHash, keyId, orgId, bytesIn, bytesOut)` — add to buffer, O(1)
  - Buffer: `Map<string, { keyId, orgId, count, bytesIn, bytesOut }>` keyed by `keyHash:YYYY-MM-DD`
  - `flush()` — bulkWrite upsert: `{ $inc: { requestCount, bytesIn, bytesOut } }` per entry
  - Auto-flush: `setInterval(flush, 60_000)`
  - Buffer cap: if `buffer.size > 1000` → immediate flush
  - `shutdown()` — clearInterval + flush remaining
  - All operations fire-and-forget, catch errors with logger.warn

### Step 3: Integrate usage tracking in request-relay
- After successful relay response in `createRelayHandler()`:
  ```typescript
  const tunnel = tunnelManager.get(subdomain);
  if (tunnel) {
    usageTracker.record(tunnel.apiKeyHash, tunnel.orgId, bodySize, responseBodySize);
  }
  ```
- Pass `usageTracker` to relay handler factory (DI)

### Step 4: Create usage routes
- `api/usage-routes.ts`:
  - GET `/api/usage?from=2026-03-01&to=2026-03-28` — customer's org usage
    - JWT auth, filter by `req.user.orgId`
    - Aggregate by date, return `[{ date, requestCount, bytesIn, bytesOut }]`
  - GET `/api/admin/usage?orgId=xxx&keyId=yyy&from=&to=` — admin filtered usage
    - Admin auth, optional filters
  - Mount in `create-api-router.ts`

### Step 5: Initialize dashboard package
```bash
mkdir -p packages/dashboard/src/{pages,components,lib}
cd packages/dashboard
pnpm init
pnpm add react react-dom react-router-dom recharts
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```
- `vite.config.ts`: proxy `/api` to `http://localhost:3001` for dev
- Add to `pnpm-workspace.yaml`

### Step 6: Implement dashboard pages
- **Login page:** email + password form → POST `/api/auth/login` → store JWT in localStorage
  - Admin toggle: switch to admin token input
- **Customer dashboard:** fetch `/api/keys` + `/api/usage` → display cards + chart
- **Key management:** create button → POST `/api/keys` → show key in modal (copy button) → list with revoke
- **Admin dashboard:** fetch `/api/admin/stats` → stat cards → org table
- **Admin org detail:** fetch org + keys + usage → display with suspend/activate button
- **Usage chart:** recharts AreaChart, daily data, date range picker

### Step 7: Serve dashboard from server
- In `server.ts`:
  ```typescript
  import path from 'node:path';
  const dashboardDist = path.resolve('../dashboard/dist');
  app.use('/dashboard', express.static(dashboardDist));
  app.get('/dashboard/*', (req, res) => {
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
  ```
- Mount BEFORE relay catch-all

### Step 8: Update server.ts for UsageTracker
- Create `usageTracker` instance
- Pass to relay handler: `createRelayHandler({ tunnelManager, usageTracker })`
- Call `usageTracker.shutdown()` in graceful shutdown (flush remaining)

### Step 9: Write tests
- UsageTracker: record → buffer state, flush → bulkWrite called, cap → auto-flush
- Usage routes: date filtering, org isolation, admin access
- Dashboard: skip — low priority for developer tool

### Step 10: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Create `db/models/usage-log-model.ts`
- [ ] Create `services/usage-tracker.ts` (buffer + flush + shutdown)
- [ ] Integrate usage tracking in `request-relay.ts`
- [ ] Create `api/usage-routes.ts`
- [ ] Mount usage routes in `create-api-router.ts`
- [ ] Initialize dashboard package (`packages/dashboard/`)
- [ ] Implement login page (customer + admin)
- [ ] Implement customer dashboard + key management
- [ ] Implement admin dashboard + org management
- [ ] Implement usage chart component
- [ ] Create api-client.ts (fetch wrapper with JWT)
- [ ] Serve dashboard static files from server
- [ ] Update server.ts for UsageTracker lifecycle
- [ ] Write usage tracker tests
- [ ] Run lint + build + test

## Success Criteria

- Usage data recorded async — zero relay latency impact (fire-and-forget)
- Buffer flushes every 60s or at 1000 entries → data in MongoDB
- Customer can view own usage with date range (daily chart)
- Admin can view all usage, filter by org/key/date
- Customer portal: login → dashboard → create/revoke keys → usage chart
- Admin portal: login → stats → manage orgs → manage keys → view usage
- Dashboard accessible at `/dashboard/`
- SPA routing works (all `/dashboard/*` → index.html)
- `pnpm build` + `pnpm lint` + `pnpm test` green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Usage buffer lost on crash | Medium | Low | Acceptable for analytics, not billing |
| Buffer memory growth | Low | Medium | Cap at 1000 entries, force flush |
| Dashboard 10h tight | Medium | Low | Keep UI minimal — function over aesthetics |
| recharts bundle size | Low | Low | ~45KB gzipped, acceptable |
| Usage data grows unbounded | Medium | Medium | Add TTL index (90 days) on date field |

## Security Considerations

- **Usage routes** — customer sees only own org (JWT orgId filter)
- **Admin usage** — admin token required
- **Dashboard auth** — JWT in localStorage (acceptable for developer tool)
- **Admin dashboard** — separate login flow with ADMIN_TOKEN
- **No sensitive data in usage** — only counts and byte sizes

## Next Steps (Post-Phase 4)
- Billing integration: usage-logs for metered billing
- OAuth providers: Google/GitHub login
- In-memory key cache: if auth latency becomes issue
- Rate limit per key: dynamic limits from usage data
- Usage data retention: TTL index or monthly aggregation
