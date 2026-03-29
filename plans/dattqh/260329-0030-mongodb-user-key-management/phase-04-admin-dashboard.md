---
phase: 4
title: "Admin Dashboard"
status: completed
effort: 8h
depends_on: [phase-02, phase-03]
---

# Phase 4: Admin Dashboard

## Context Links
- [Phase 2](phase-02-express-auth-api.md) — Auth API (TOTP, cookies), Admin API endpoints
- [Phase 3](phase-03-usage-tracking.md) — Usage API (user + admin)
- [Brainstorm](../reports/brainstorm-260329-0114-dashboard-access-architecture.md) — Dual-portal architecture

## Overview
- **Priority:** P2
- **Status:** pending
- React SPA at /dashboard/* on server. Admin-only (ADMIN_EMAILS). Full management: users, keys, tunnels, usage charts. Login requires email+password+TOTP.

## Key Insights
- Only admin accounts (from ADMIN_EMAILS env) can access
- SPA served as static files from Express — /dashboard/* with index.html fallback
- Uses httpOnly cookies (set by /api/auth/login) — no manual token handling
- CSRF token fetched on app init, sent in X-CSRF-Token header
- Vite dev proxy to server for /api/* during development

## Requirements

### Functional
- F1: Login page (email + password + TOTP code -> httpOnly cookie set)
- F2: Users management page: list all users, suspend/activate
- F3: Keys management page: list all keys, revoke any key
- F4: Active tunnels page: live view of connected tunnels
- F5: Usage page: system-wide usage charts (last 30 days)
- F6: System stats overview (total users, keys, tunnels, requests)
- F7: Auto-redirect to login when cookie expired (401 from API)
- F8: Only admin role can access (server enforces via admin-guard)

### Non-Functional
- NF1: Served at /dashboard/* from Express static middleware
- NF2: SPA fallback (all /dashboard/* -> index.html)
- NF3: Responsive layout
- NF4: < 200 lines per component file

## Architecture

```
packages/dashboard/
├── src/
│   ├── main.tsx
│   ├── app.tsx              # Router setup
│   ├── api/
│   │   └── client.ts        # Fetch wrapper (cookies auto-sent, CSRF header)
│   ├── pages/
│   │   ├── login-page.tsx
│   │   ├── users-page.tsx
│   │   ├── keys-page.tsx
│   │   ├── tunnels-page.tsx
│   │   ├── usage-page.tsx
│   │   └── overview-page.tsx
│   ├── components/
│   │   ├── users-table.tsx
│   │   ├── keys-table.tsx
│   │   ├── tunnels-list.tsx
│   │   ├── usage-chart.tsx
│   │   ├── stats-cards.tsx
│   │   └── nav-bar.tsx
│   └── hooks/
│       ├── use-auth.ts
│       └── use-api.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Related Code Files

### CREATE
| File | Purpose |
|------|---------|
| `packages/dashboard/` | Entire new package (React + Vite) |
| All files in architecture above | SPA components, pages, hooks, API client |

### MODIFY
| File | Changes |
|------|---------|
| `packages/server/src/server.ts` | Serve dashboard static at /dashboard/* |
| `pnpm-workspace.yaml` | Add packages/dashboard |
| Root `package.json` | Add build:dashboard script |

## Implementation Steps

### 1. Scaffold dashboard package
```bash
cd packages && pnpm create vite dashboard --template react-ts
cd dashboard && pnpm add react-router-dom recharts
pnpm add -D tailwindcss @tailwindcss/vite
```

### 2. Configure Vite
- Base: `/dashboard/`
- Dev proxy: /api -> http://localhost:3001

### 3. Create API client (`api/client.ts`)
- `apiFetch(path, options)`: prepend /api, include `credentials: 'include'` (cookies auto-sent)
- Fetch CSRF token on init: GET /api/auth/csrf-token, include in `X-CSRF-Token` header for mutations
- Auto-redirect to /dashboard/login on 401

### 4. Create auth hook (`hooks/use-auth.ts`)
- `login(email, password, totpCode)`: POST /api/auth/login (cookie set by server)
- `logout()`: POST /api/auth/logout, redirect
- `isAuthenticated`: check via GET /api/profile (200=ok, 401=not auth)

### 5. Create login page
- Email + password + TOTP code form
- Redirect to /dashboard/overview on success

### 6. Create overview page
- GET /api/admin/stats -> StatsCards component
- Quick summary: total users, active keys, live tunnels, requests today

### 7. Create users page
- GET /api/admin/users -> UsersTable (email, role, status, plan, created)
- Actions: suspend/activate user (PATCH /api/admin/users/:userId)

### 8. Create keys page
- GET /api/admin/keys -> KeysTable (prefix, label, user email, status, created)
- Action: revoke key (DELETE /api/admin/keys/:keyId)

### 9. Create tunnels page
- GET /api/admin/tunnels -> TunnelsList (subdomain, user, key prefix, connected since)
- Live data (poll every 10s or manual refresh)

### 10. Create usage page
- GET /api/admin/usage -> UsageChart (recharts LineChart, last 30 days)
- Metrics: requestCount, bytesIn, bytesOut per day

### 11. Create nav bar + app router
- Links: Overview, Users, Keys, Tunnels, Usage, Logout
- Protected routes redirect to login if 401

### 12. Serve from Express (`server.ts`)
```typescript
const dashboardPath = path.resolve(import.meta.dirname, '../../dashboard/dist');
app.use('/dashboard', express.static(dashboardPath));
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});
```

### 13. Add to workspace
- Update pnpm-workspace.yaml
- Add build script: `pnpm --filter @tunelo/dashboard build`

### 14. Tests
- Component tests: login form, users table, stats cards
- Verify admin-only access (non-admin gets 403 from API)

## Todo List
- [x] Scaffold Vite React project
- [x] Configure Vite (base, proxy)
- [x] Create API client (cookies + CSRF)
- [x] Create auth hook
- [x] Create login page (email+pass+TOTP)
- [x] Create overview page + stats cards
- [x] Create users page + table
- [x] Create keys page + table
- [x] Create tunnels page + list
- [x] Create usage page + chart
- [x] Create nav bar + router
- [x] Serve static from Express
- [x] Add to pnpm workspace
- [x] Write component tests
- [x] Run biome lint + fix

## Success Criteria
- Admin login: email+password+TOTP -> dashboard access
- Non-admin login attempt -> 403 on admin endpoints
- Users page: list, suspend, activate
- Keys page: list all, revoke any
- Tunnels page: live active tunnels
- Usage page: system-wide chart
- SPA routing works (direct URL -> index.html fallback)
- Builds and serves from Express /dashboard/*

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| SPA routing conflicts with relay | /dashboard/* handled before catch-all |
| Cookie not sent on dashboard | Same origin, credentials:'include' |
| Admin role bypass | Server-side admin-guard on every /api/admin/* endpoint |

## Security Considerations
- Admin access enforced server-side (admin-guard middleware), not client-side
- httpOnly cookies — no XSS token theft
- CSRF token required for all mutations
- Dashboard shows aggregate data, no raw API keys
- No ability to create users from dashboard (users self-signup)
