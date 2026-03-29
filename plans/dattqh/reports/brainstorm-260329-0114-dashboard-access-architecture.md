# Brainstorm: Dashboard Access & Dual-Portal Architecture

**Date:** 2026-03-29
**Context:** Plan `260329-0030-mongodb-user-key-management` validation revealed need for access control redesign.

## Problem Statement

Original plan had single customer-facing dashboard at server `/dashboard/*` with open signup. No access control beyond "have an account." For org-wide deployment, need:
1. Client users self-service their own keys/usage
2. Admin-only dashboard for system management
3. TOTP (Google Authenticator) mandatory for all users

## Confirmed Architecture

### Two Separate Web UIs

| UI | Location | Users | Purpose |
|---|---|---|---|
| **Client Portal** | `localhost:4040` (embedded in npm package) | Any signed-up user | Signup, login+TOTP, manage own keys, view own usage |
| **Admin Dashboard** | `server:PORT/dashboard` | ENV whitelist only | Full management: all users, keys, tunnels, usage |

### Access Control Model

```
Roles: user | admin
Admin determined by: ADMIN_EMAILS env var
TOTP: mandatory for both roles
```

- `user` role: can only access own resources via /api/keys, /api/usage, /api/profile
- `admin` role: can access /api/admin/* endpoints (all users, all keys, system stats, suspend/activate)

### Client Portal (packages/client)
- React SPA bundled inside client npm package
- Served at localhost:4040 when `tunelo start` runs
- Calls remote server API over HTTPS
- Pages: signup, login, key management, usage view, profile

### Admin Dashboard (packages/server → /dashboard/*)
- React SPA served from server Express
- Login requires: email in ADMIN_EMAILS + password + TOTP
- Pages: users list, all keys, system usage charts, active tunnels, settings

### TOTP Flow
1. Signup → server generates TOTP secret → returns QR code data
2. User scans QR with Google Authenticator
3. User enters TOTP code to verify setup
4. All subsequent logins require: email + password + TOTP code
5. Package: `otplib` for TOTP generation/verification

## Impact on Existing Plan

| Phase | Change |
|---|---|
| Phase 1 | Minimal — add `role` field to User model, `totpSecret` field |
| Phase 2 | Significant — add TOTP verify/setup endpoints, admin middleware, admin endpoints, role checks |
| Phase 3 | Minimal — admin usage endpoint (all users) in addition to user's own |
| Phase 4 | **Rewrite** — becomes Admin Dashboard instead of Customer Portal |
| **Phase 5 (NEW)** | Client Portal SPA in packages/client |

### Effort Revision
- Phase 1: 8h → **9h** (+role, +totpSecret)
- Phase 2: 10h → **14h** (+TOTP, +admin endpoints, +role middleware)
- Phase 3: 4h → **5h** (+admin usage endpoint)
- Phase 4: 8h → **8h** (same effort, different scope: admin dashboard)
- Phase 5: **NEW 8h** (client portal SPA)
- **Total: 30h → 44h**

## Key Decisions Confirmed
1. Client portal embedded in npm package, localhost:4040
2. Admin dashboard on server, ENV whitelist (ADMIN_EMAILS)
3. TOTP mandatory for all (client + admin)
4. Admin: full management (users, keys, tunnels, usage)
5. httpOnly cookie + CSRF (from earlier validation)
6. 24h access + 7d refresh token (from earlier validation)
7. Rate limiter/usage buffer behind interfaces for Redis swap (from earlier validation)

## Risks
- Client portal increases npm package size (React SPA bundle)
- CORS config needed: server must allow localhost:4040 origin
- TOTP adds friction to signup flow (necessary trade-off for security)
- Two separate SPAs to maintain

## Next Steps
- Update plan phases to reflect new architecture
- Phase 4 rewrite: Admin Dashboard
- Add Phase 5: Client Portal
