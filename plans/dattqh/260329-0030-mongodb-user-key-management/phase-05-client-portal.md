---
phase: 5
title: "Client Portal"
status: completed
effort: 8h
depends_on: [phase-02, phase-03]
---

# Phase 5: Client Portal

## Context Links
- [Phase 2](phase-02-express-auth-api.md) — Auth API (TOTP, cookies), Key API, Profile API
- [Phase 3](phase-03-usage-tracking.md) — Usage API
- [Brainstorm](../reports/brainstorm-260329-0114-dashboard-access-architecture.md) — Dual-portal architecture

## Overview
- **Priority:** P2
- **Status:** pending
- React SPA embedded in packages/client, served at localhost:4040 when `tunelo start` runs. Customer self-service: signup, login+TOTP, manage own API keys, view own usage, profile.

## Key Insights
- SPA bundled inside client npm package — increases package size but zero extra infra
- Client starts local HTTP server (simple express or http) to serve portal at localhost:4040
- All API calls go to remote tunnel server (HTTPS) with `credentials: 'include'`
- CORS on server must allow `http://localhost:4040` origin
- CSRF token fetched from server on app init
- Portal is optional — CLI works without opening browser

## Requirements

### Functional
- F1: Signup page (email + password -> TOTP QR code display -> verify TOTP)
- F2: Login page (email + password + TOTP code)
- F3: Dashboard page: list own API keys, create new, revoke
- F4: Key creation shows plaintext key once with copy button
- F5: Usage page: own usage chart (last 30 days)
- F6: Profile page: change password
- F7: Auto-redirect to login on 401
- F8: localhost:4040 auto-opens in browser when `tunelo start` (configurable)

### Non-Functional
- NF1: Embedded in packages/client, built at npm publish time
- NF2: Local server at localhost:4040 (configurable port via --portal-port)
- NF3: Responsive layout
- NF4: < 200 lines per component file
- NF5: Minimal bundle size (no heavy deps beyond react + recharts)

## Architecture

```
packages/client/
├── src/
│   ├── cli/           # Existing CLI code
│   ├── portal/        # Portal SPA source
│   │   ├── main.tsx
│   │   ├── app.tsx
│   │   ├── api/
│   │   │   └── client.ts       # Fetch wrapper -> remote server API
│   │   ├── pages/
│   │   │   ├── signup-page.tsx
│   │   │   ├── login-page.tsx
│   │   │   ├── keys-page.tsx
│   │   │   ├── usage-page.tsx
│   │   │   └── profile-page.tsx
│   │   ├── components/
│   │   │   ├── key-list.tsx
│   │   │   ├── key-create-modal.tsx
│   │   │   ├── usage-chart.tsx
│   │   │   ├── totp-setup.tsx     # QR code display + verify input
│   │   │   └── nav-bar.tsx
│   │   └── hooks/
│   │       ├── use-auth.ts
│   │       └── use-api.ts
│   └── portal-server.ts  # Simple HTTP server to serve built SPA
├── portal-dist/           # Built SPA output (committed or built at prepublish)
├── vite.config.portal.ts  # Separate Vite config for portal build
└── package.json
```

## Related Code Files

### CREATE
| File | Purpose |
|------|---------|
| `packages/client/src/portal/` | All portal SPA source files |
| `packages/client/src/portal-server.ts` | Local HTTP server for portal |
| `packages/client/vite.config.portal.ts` | Vite config for portal build |
| All SPA files listed in architecture | Pages, components, hooks, API client |

### MODIFY
| File | Changes |
|------|---------|
| `packages/client/src/cli/index.ts` (or equivalent) | Start portal server alongside tunnel client |
| `packages/client/package.json` | Add react, vite, recharts devDeps; add build:portal script |
| `packages/client/tsconfig.json` | Include portal source |

## Implementation Steps

### 1. Add portal dependencies to client package
```bash
cd packages/client
pnpm add -D react react-dom react-router-dom recharts vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
pnpm add -D @types/react @types/react-dom
```

### 2. Create Vite config for portal (`vite.config.portal.ts`)
- Entry: src/portal/main.tsx
- Output: portal-dist/
- Base: `/`
- No dev proxy needed (API calls go to remote server URL)

### 3. Create portal server (`src/portal-server.ts`)
- Simple http server (or express.static) serving portal-dist/ at localhost:4040
- `startPortalServer(port: number): Promise<void>`
- `stopPortalServer(): Promise<void>`
- Fallback: all routes -> index.html (SPA)

### 4. Create API client (`portal/api/client.ts`)
- `apiFetch(path, options)`: prepend server URL (from client config/env)
- `credentials: 'include'` for httpOnly cookies
- Fetch CSRF token on init, include in X-CSRF-Token header
- Auto-redirect to /login on 401
- Server URL from: `TUNELO_SERVER_URL` env or CLI --server flag

### 5. Create auth hook (`portal/hooks/use-auth.ts`)
- `signup(email, password)`: POST /api/auth/signup -> return TOTP setup data
- `verifyTotp(code)`: POST /api/auth/verify-totp -> sets cookies
- `login(email, password, totpCode)`: POST /api/auth/login
- `logout()`: POST /api/auth/logout

### 6. Create signup page
- Step 1: Email + password form
- Step 2: Display QR code (from signup response) + TOTP verify input
- Step 3: Success -> redirect to keys page
- Uses TotpSetup component

### 7. Create TOTP setup component (`components/totp-setup.tsx`)
- Display QR code image (data URL from server)
- Input for 6-digit code
- Verify button -> POST /api/auth/verify-totp

### 8. Create login page
- Email + password + TOTP code form
- Redirect to /keys on success

### 9. Create keys page
- GET /api/keys -> KeyList component
- Create button -> KeyCreateModal (show plaintext once + copy)
- Revoke button on each key

### 10. Create usage page
- GET /api/usage -> UsageChart (recharts, last 30 days)

### 11. Create profile page
- Change password form (old + new + confirm)

### 12. Create nav bar + app router
- Links: Keys, Usage, Profile, Logout
- /signup, /login (public), /keys, /usage, /profile (protected)

### 13. Integrate portal server into CLI
- When `tunelo start` runs, also start portal server at localhost:4040
- Flag: `--no-portal` to disable
- Flag: `--portal-port 4040` to customize
- Auto-open browser (configurable: `--no-browser`)

### 14. Build script
- `pnpm build:portal` -> vite build --config vite.config.portal.ts
- `prepublish` script builds portal before npm publish
- portal-dist/ included in published package

### 15. Tests
- Component tests: signup flow (email->QR->verify), login, key list, key create
- Portal server: starts/stops correctly, serves SPA

## Todo List
- [x] Add portal dependencies to client package
- [x] Create Vite config for portal
- [x] Create portal-server.ts
- [x] Create API client (remote server, cookies, CSRF)
- [x] Create auth hook
- [x] Create signup page + TOTP setup component
- [x] Create login page
- [x] Create keys page + key-list + key-create-modal
- [x] Create usage page + chart
- [x] Create profile page
- [x] Create nav bar + router
- [x] Integrate portal server into CLI (start/stop)
- [x] Add build:portal script + prepublish
- [x] Write component tests
- [x] Run biome lint + fix

## Success Criteria
- `tunelo start --port 3000` -> localhost:4040 opens portal
- Signup flow: email+pass -> QR code -> verify TOTP -> account active
- Login: email+pass+TOTP -> access keys page
- Key management: list, create (plaintext once + copy), revoke
- Usage chart: own usage last 30 days
- Profile: change password
- `--no-portal` flag skips portal server
- Portal builds and bundles in npm package
- CORS works: localhost:4040 -> remote server API

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Package size increase from React bundle | Tree-shake, minimal deps; portal is ~200KB gzipped |
| Cross-origin cookies (localhost -> server) | CORS credentials:true, sameSite:'none'+secure in prod; sameSite:'lax' for dev |
| Port 4040 already in use | Detect + fallback to random port, display URL |
| Vite + TSC conflict in monorepo | Separate vite.config.portal.ts, separate tsconfig |

## Security Considerations
- httpOnly cookies — portal JS cannot read JWT
- CSRF token required for all mutations
- Server URL configurable — user controls which server they connect to
- No secrets stored client-side (cookies managed by browser)
- QR code contains TOTP secret — shown once during signup only
