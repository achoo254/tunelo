# Code Review: MongoDB User & Key Management (Phases 1-5)

**Reviewer:** code-reviewer | **Date:** 2026-03-29
**Files reviewed:** 35+ files across `packages/server/src/`
**Focus:** Security, architecture, error handling, performance, correctness

---

## Overall Assessment

Solid implementation with good separation of concerns, consistent error handling via `TuneloError`, and adherence to project conventions (no `any`, pino logging, kebab-case files, Zod validation). The security surface area is well-considered for a tunnel proxy. Several issues need attention before production.

**Score: 7/10**

---

## Critical Issues (Must Fix)

### C1. CSRF Double-Submit Cookie Pattern is Bypassable
**File:** `api/middleware/csrf-protection.ts:33-36`

The double-submit cookie pattern compares a cookie value to a header value. An attacker who can set cookies on the domain (e.g., via a subdomain XSS on `*.tunnel.inetdev.io.vn` -- which is YOUR wildcard domain for tunnels) can set `tunelo_csrf` to a known value and send the same value in the header.

**Since tunnel subdomains serve arbitrary user content, any tunnel user can inject a cookie on the parent domain, completely defeating CSRF protection for all users.**

**Fix:** Either:
- Bind CSRF tokens to the user session (store in DB or sign with JWT secret + userId)
- Use `__Host-` cookie prefix (prevents subdomain cookie injection, requires `Secure; Path=/`)
- Use `SameSite=Strict` on auth cookies AND separate the dashboard domain from the tunnel wildcard domain

### C2. TOTP Secret Stored Plaintext in MongoDB
**File:** `db/models/user-model.ts:14`, `services/auth-service.ts:80`

`totpSecret` is stored as plaintext `String` in the User model. If the database is compromised, attackers can generate valid TOTP codes for all users, bypassing 2FA entirely.

**Fix:** Encrypt `totpSecret` at rest using AES-256-GCM with a key derived from an env var (e.g., `ENCRYPTION_KEY`). Decrypt only during verification.

### C3. Signup Returns QR Code Without Authentication -- No Session Binding
**File:** `services/auth-service.ts:60-85`, `api/auth-routes.ts:31-46`

After `signup`, the TOTP secret is created and QR code returned, but there is no session/token issued. The `verify-totp` endpoint requires `cookieAuth` (line 49-51 of auth-routes), but signup never sets cookies. **Users cannot complete TOTP verification after signup.**

The flow is: signup (no auth) -> verify-totp (requires cookieAuth) -> broken.

**Fix:** Either:
- Issue a temporary, limited-scope JWT after signup (e.g., `{ userId, scope: "totp-setup" }`)
- Remove `cookieAuth` from verify-totp and accept userId+totpCode directly (with rate limiting)

### C4. Migration Script Creates User with Invalid passwordHash
**File:** `scripts/migrate-keys.ts:40`

`passwordHash: "migration-placeholder"` is not a valid bcrypt hash. If anyone discovers this email (`migration@tunelo.local`), `bcrypt.compare()` against a non-bcrypt string will throw or behave unpredictably depending on bcrypt version.

**Fix:** Generate a proper bcrypt hash of a random password, or mark the user with `status: "suspended"` so login is blocked.

---

## Important Issues (Should Fix)

### I1. Refresh Token Reuse -- No Rotation or Revocation
**File:** `services/auth-service.ts:138-168`

Refresh tokens are stateless JWTs with 7-day expiry. A stolen refresh token can be used indefinitely until expiry. There is no:
- Token rotation (issuing a new refresh token on each refresh)
- Token family tracking (detecting reuse of rotated tokens)
- Revocation mechanism (logout only clears cookies, doesn't invalidate the token server-side)

**Impact:** A token stolen from a cookie (e.g., via a compromised tunnel subdomain) remains valid for 7 days regardless of logout.

**Fix:** Store refresh token hashes in the User document. On refresh, rotate the token. On logout, clear the stored hash.

### I2. Rate Limiter Shared Across Unrelated Endpoints
**File:** `api/create-api-router.ts:26`, `api/auth-routes.ts:17-27`

A single `MemoryRateLimitStore` instance is passed to `createAuthRouter`, but `signupLimiter` and `loginLimiter` share the same store with different windows. The store uses a single `windowMs` (constructor arg = 1 hour from line 26), but `loginLimiter` expects 15 min windows. The store's cleanup and window logic uses the constructor-provided `windowMs`, which won't match the per-limiter config.

Actually, looking more closely: `createRateLimiter` doesn't use `config.windowMs` to set the window -- the `MemoryRateLimitStore` uses its own `windowMs`. The `RateLimitConfig.windowMs` is never used by the limiter middleware. **All rate limits use the same 1-hour window regardless of per-route config.**

**Fix:** Either make the store window-aware per key, or create separate store instances per rate limit config.

### I3. Admin Usage Route Accepts Unsanitized Query Params
**File:** `api/usage-routes.ts:55-96`

`createAdminUsageHandler` casts `req.query.startDate` and `req.query.endDate` directly to `string` without validation. Unlike the user usage route (which uses `usageQuerySchema`), admin usage has no schema validation. Arbitrary strings flow into the MongoDB `$match` stage.

While MongoDB is not vulnerable to SQL injection, malformed date strings cause incorrect query results.

**Fix:** Apply `usageQuerySchema.parse()` to admin usage params too.

### I4. N+1 Query in MongoKeyStore.validate()
**File:** `key-store/mongo-key-store.ts:12-48`

Each WS authentication triggers two sequential queries: `ApiKey.findOne()` then `User.findOne()`. For a target of 5-10k concurrent tunnels with frequent reconnects, this is a hot path.

**Fix:** Use MongoDB `$lookup` aggregation or cache validated KeyInfo in an LRU cache with short TTL (e.g., 30s) keyed by keyHash.

### I5. No Password Complexity Beyond Min Length
**File:** `api/schemas/auth-schemas.ts:5`

Password validation is only `min(8)`. No check for uppercase, digits, or common passwords.

**Fix:** At minimum add a regex for mixed character classes. Consider integrating `zxcvbn` for strength scoring.

### I6. `totpCode` Schema Allows Non-Digit Characters
**File:** `api/schemas/auth-schemas.ts:10`

`z.string().length(6)` accepts any 6-char string (e.g., `"abcdef"`). TOTP codes are always numeric.

**Fix:** `z.string().regex(/^\d{6}$/)`

### I7. Auth Cookies Accessible From Tunnel Subdomains
**File:** `services/auth-service.ts:43-57`

Cookies are set with `path: "/"` and no `domain` restriction. On `*.tunnel.inetdev.io.vn`, tunnel-served content can read `httpOnly: false` cookies and potentially access auth cookies via subdomain cookie scope rules.

**Fix:** Set explicit `domain` to the API host only. Use `__Host-` prefix for auth cookies to enforce `Secure; Path=/; no Domain`.

---

## Minor Suggestions

### M1. Duplicate `getJwtSecret()` Function
**Files:** `services/auth-service.ts:16-20`, `api/middleware/cookie-auth.ts:18-22`

Identical function duplicated. Extract to a shared config module.

### M2. `console.log` in Migration Script
**File:** `scripts/migrate-keys.ts`

Project rule says "Never use `console.log` — use pino logger." Migration scripts are an acceptable exception, but flag for consistency.

### M3. Usage Tracker Buffer Overflow Drops Oldest (Not Least Important)
**File:** `services/usage-tracker.ts:37-40`

On buffer overflow, the first entry (oldest) is dropped. This silently loses usage data. Consider logging a count metric or flushing urgently instead of dropping.

### M4. `otplib` Import May Not Work with ESM
**File:** `services/totp-service.ts:1`

`otplib` v13 has known ESM compatibility issues. The named imports `{ generateSecret, generateURI, verifySync }` may fail at runtime depending on the build. Verify with `pnpm build && node dist/services/totp-service.js`.

### M5. `parseCookies` Doesn't Handle Encoded Cookie Names
**File:** `api/middleware/cookie-auth.ts:51-58`

Cookie names are not `decodeURIComponent`'d. Only values are decoded. Low-risk since Tunelo controls cookie names.

### M6. Missing Index on `usageLogSchema` for Admin Aggregation
**File:** `db/models/usage-log-model.ts`

Admin usage aggregation queries `$match: { date: { $gte, $lte } }` without a standalone `date` index. Existing compound indexes `{ userId: 1, date: 1 }` and `{ keyId: 1, date: 1 }` won't help admin-level date-only queries.

**Fix:** Add `usageLogSchema.index({ date: 1 })`.

### M7. `closeAll()` Iterates and Mutates Same Map
**File:** `tunnel-manager.ts:278-282`

```ts
for (const [subdomain, tunnel] of this.tunnels) {
    tunnel.socket.close();
    this.unregister(subdomain); // deletes from this.tunnels
}
```

Deleting from a Map while iterating it with `for...of` is safe in JS (per spec), but collecting subdomains first is clearer and avoids potential confusion.

---

## Positive Observations

1. **No `any` types** anywhere in the codebase -- strict TypeScript throughout
2. **Consistent error handling** with `TuneloError` class and centralized error handler
3. **Zod validation** at API boundaries with proper error responses
4. **API keys stored as SHA-256 hashes** -- never logged plaintext
5. **Timing-safe comparison** for Basic Auth in `tunnel-auth-checker.ts`
6. **`.lean()`** used consistently for read-only Mongoose queries
7. **Proper cookie attributes** -- `httpOnly`, `secure` in prod, `sameSite`
8. **Usage tracker buffer pattern** -- sync writes, batched async flushes -- good for throughput
9. **Graceful shutdown** with usage flush and keystore cleanup
10. **Admin queries exclude sensitive fields** (`-passwordHash -totpSecret`)

---

## Summary Table

| # | Severity | Issue |
|---|----------|-------|
| C1 | CRITICAL | CSRF bypassable via tunnel subdomain cookie injection |
| C2 | CRITICAL | TOTP secrets stored plaintext in DB |
| C3 | CRITICAL | Signup->TOTP-verify flow broken (no session after signup) |
| C4 | CRITICAL | Migration user has invalid bcrypt hash |
| I1 | HIGH | No refresh token rotation/revocation |
| I2 | HIGH | Rate limiter windowMs config ignored |
| I3 | HIGH | Admin usage route has no input validation |
| I4 | MEDIUM | N+1 queries in WS auth hot path |
| I5 | MEDIUM | Weak password policy |
| I6 | MEDIUM | TOTP schema accepts non-digit chars |
| I7 | HIGH | Auth cookies scoped to tunnel wildcard domain |

---

## Unresolved Questions

1. Is the dashboard (`/dashboard/*`) intended to run on the same domain as tunnel subdomains? If yes, C1 and I7 are critical. If the dashboard runs on a separate domain, severity is reduced.
2. Is `otplib` v13 tested with the project's ESM + TypeScript build pipeline?
3. What is the expected behavior when `ADMIN_EMAILS` env var changes while the server is running? Currently role assignment only happens at signup time.
4. Is there a plan for session invalidation when a user is suspended? Currently, existing JWTs remain valid until expiry.
