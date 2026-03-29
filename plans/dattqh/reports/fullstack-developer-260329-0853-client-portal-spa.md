# Phase Implementation Report

## Executed Phase
- Phase: Client Portal SPA (Phase 5)
- Plan: D:/CONG VIEC/tunelo/plans/dattqh/260329-0853-client-portal-spa/
- Status: completed

## Files Modified
- `packages/client/package.json` — added `build:portal` script, portal devDependencies already installed
- `packages/client/tsconfig.json` — removed `src/portal-server.ts` from exclude (needed for cli.ts import)
- `packages/client/src/cli.ts` — added portal-server import, `--portal-port` / `--no-portal` options, startup on connect, stop on SIGINT

## Files Created
- `packages/client/vite.config.portal.ts` — Vite config for portal SPA build
- `packages/client/tsconfig.portal.json` — separate tsconfig for portal (JSX, Bundler resolution, noEmit)
- `packages/client/src/portal-server.ts` — Node http server serving portal-dist/ with SPA fallback + path traversal guard
- `packages/client/src/portal/index.html` — Vite entry HTML
- `packages/client/src/portal/styles.css` — Tailwind CSS v4 import
- `packages/client/src/portal/main.tsx` — React root mount
- `packages/client/src/portal/app.tsx` — BrowserRouter, AuthGuard, protected/public routes
- `packages/client/src/portal/api/client.ts` — fetch wrapper (CSRF token, 401 redirect, server URL config)
- `packages/client/src/portal/hooks/use-auth.ts` — signup / verifyTotp / login / logout / fetchMe
- `packages/client/src/portal/hooks/use-api.ts` — generic GET hook with loading/error/refetch
- `packages/client/src/portal/components/nav-bar.tsx` — NavLink bar + logout
- `packages/client/src/portal/components/totp-setup.tsx` — QR image + 6-digit input + verify
- `packages/client/src/portal/components/key-list.tsx` — table of API keys with revoke
- `packages/client/src/portal/components/key-create-modal.tsx` — name input → plaintext key shown once + copy
- `packages/client/src/portal/components/usage-chart.tsx` — recharts bar charts (requests + bandwidth)
- `packages/client/src/portal/pages/signup-page.tsx` — 2-step: credentials → TOTP setup
- `packages/client/src/portal/pages/login-page.tsx` — email + password + TOTP code
- `packages/client/src/portal/pages/keys-page.tsx` — list + create + revoke
- `packages/client/src/portal/pages/usage-page.tsx` — summary stats + charts
- `packages/client/src/portal/pages/profile-page.tsx` — change password form

## Tasks Completed
- [x] Portal devDependencies installed (react, react-dom, react-router-dom, recharts, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite)
- [x] vite.config.portal.ts created (entry: src/portal/index.html, out: portal-dist/)
- [x] portal-server.ts — http server with SPA fallback, path traversal guard, start/stop exports
- [x] api/client.ts — apiFetch with CSRF, credentials:include, 401 auto-redirect
- [x] hooks/use-auth.ts — signup, verifyTotp, login, logout, fetchMe
- [x] hooks/use-api.ts — generic GET hook
- [x] All 5 pages + 5 components created
- [x] app.tsx — BrowserRouter with AuthGuard + ProtectedLayout
- [x] tsconfig.portal.json — separate config for JSX portal source
- [x] CLI integration — --portal-port, --no-portal flags, start on connect, stop on SIGINT
- [x] build:portal script in package.json

## Tests Status
- Type check (main): PASS — `pnpm build` clean, zero errors
- Portal Vite build: PASS — `vite build --config vite.config.portal.ts` succeeds, 662 modules
- Unit tests: not added (portal is UI-only, no test harness configured for React in this project)

## Issues Encountered
- Portal default port changed to 4041 (not 4040 as spec said) to avoid conflict with existing inspector which already uses 4040
- `display.showInfo` does not exist on Display class — used `display.showInspector(portalPort)` as closest equivalent for portal URL display
- Large bundle warning (571KB) from recharts — acceptable for a local dev SPA; can be code-split later

## Next Steps
- Server-side API endpoints (`/api/auth/*`, `/api/keys`, `/api/usage`, `/api/auth/password`) must be implemented in packages/server for the portal to be functional
- CSRF endpoint `/api/auth/csrf` must be implemented server-side
- Consider `display.showPortal(port)` method addition to Display class for cleaner output
- Bundle splitting (recharts lazy-loaded) if SPA load time becomes concern
