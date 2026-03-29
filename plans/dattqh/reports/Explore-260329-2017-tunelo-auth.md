# Tunelo CLI Authentication - Exploration Summary

## Quick Overview
Tunelo has multi-tier auth: CLI (API key Bearer tokens), Dashboard (cookies), Portal SPA (browser).

## 1. CLI AUTH COMMANDS (packages/client/src/cli-auth-commands.ts)

**register**: Create account → signup() → optional TOTP verify → instructs user to run login
**login**: Authenticate → loginCli() → returns key + keyPrefix → saves to config
**logout**: Remove key from local config

Helper: prompt(), promptPassword() (hidden, Windows-compatible), promptCredentials() validator

## 2. API CLIENT (packages/client/src/api-client.ts)

request<T>(): Generic HTTP wrapper, converts WS URLs to HTTP, optional Bearer auth

Key endpoints:
- POST /api/auth/signup → { userId, requireTotp, qrDataUrl?, totpSecret? }
- POST /api/auth/verify-totp → { success }
- POST /api/auth/login-cli → { userId, role, key, keyPrefix }
- GET/POST/DELETE /api/keys (with Bearer auth)

## 3. SERVER AUTH API (packages/server/src/api/auth-routes.ts)

Rate limits: Signup 5/hr, Login 10/15min
Routes:
- POST /signup: email+password → creates user or requires TOTP
- POST /verify-totp: userId+code
- POST /login: For dashboard/portal (sets httpOnly cookie)
- POST /login-cli: For CLI (returns key)
- POST /refresh: Refresh session via refresh token
- POST /logout
- GET /csrf-token: For portal mutations

## 4. KEY MANAGEMENT (packages/server/src/api/key-routes.ts)

Uses combinedAuth: tries Bearer API key first, falls back to cookies
- GET /api/keys: List user keys
- POST /api/keys: Create new key
- DELETE /api/keys/:keyId: Revoke key

Key hash stored as SHA-256 in DB

## 5. PORTAL WEB UI (packages/client/src/portal/)

Portal server (portal-server.ts): HTTP at :4041, SPA fallback routing
Portal API client (portal/api/client.ts): apiFetch() with CSRF token support
Portal auth hook (portal/hooks/use-auth.ts): React hook with signup/login/logout/verifyTotp

## 6. DASHBOARD (packages/dashboard/src/)

API client: apiFetch() with auto-cookies + CSRF token
Pages: Overview, Keys, Usage, Tunnels, Users, Login, Signup
Endpoints: /api/auth/*, /api/keys, /api/profile, /api/admin/*

## 7. SERVER MIDDLEWARE

Cookie auth: Validates __Host-tunelo_session (prod) / tunelo_session (dev)
API key auth: Extracts Bearer token, hashes, looks up in ApiKey
Combined auth: Tries API key first, then cookies
CSRF: Token-based, lazy-loaded on mutation
Admin guard: Requires role === admin

## 8. PROFILE & ADMIN ROUTES

Profile (profile-routes.ts, cookie auth required):
- GET /api/profile: User info
- PATCH /api/profile/password: Change password

Admin (admin-routes.ts, cookie + admin required):
- GET/PATCH /admin/users: User management
- GET/DELETE /admin/keys: Key management
- GET /admin/usage, /admin/tunnels, /admin/stats

## AUTH FLOWS

CLI: register → login → get key → save to config → use in WS auth header
Browser: signup/login → httpOnly cookie → CSRF token on mutations → logout clears cookies

## Key Patterns
- Dual auth: API key (CLI) + cookies (web) share same service layer
- Rate limiting on auth endpoints
- CSRF protection for mutations
- 2FA optional (admin by default)
- Config file: ~/.config/tunelo/config.json
- Error codes: TUNELO_AUTH_* standard codes
- Validation: Zod (email, password ≥8 chars, TOTP 6 digits)

Generated: 2026-03-29
