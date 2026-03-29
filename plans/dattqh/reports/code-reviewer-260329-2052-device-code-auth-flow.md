# Code Review: Device Code Auth Flow

**Date:** 2026-03-29
**Reviewer:** code-reviewer
**Scope:** Device Code Flow implementation (OAuth 2.0 Device Authorization pattern)

## Scope

- **Files reviewed:** 12 (6 new, 6 modified)
- **LOC new:** ~450
- **Focus:** Security, correctness, edge cases, architectural consistency

## Overall Assessment

Well-structured implementation following the Device Authorization Grant pattern. Good separation of concerns (model/schema/service/routes/UI). However, there is one **critical blocking bug** (CSRF rejecting CLI requests) and several high-priority issues.

---

## Critical Issues (Blocking)

### C1. CSRF middleware blocks CLI device auth endpoints

**Impact:** Device auth flow completely broken in production.

The CSRF middleware (`csrf-protection.ts`) rejects all mutating requests that are NOT in `CSRF_EXEMPT_PATHS` and do NOT carry a `Bearer` token. The CLI endpoints `POST /auth/device` and `POST /auth/device/poll` match neither condition:

- They are not in `CSRF_EXEMPT_PATHS`
- The CLI sends no Bearer token (user isn't authenticated yet)
- The CLI sends no CSRF cookie/header

Result: Both requests receive HTTP 403 "Invalid CSRF token".

**Fix:** Add device auth CLI paths to the CSRF exemption set:

```typescript
// csrf-protection.ts
const CSRF_EXEMPT_PATHS = new Set([
  "/auth/signup",
  "/auth/login-cli",
  "/auth/verify-totp",
  "/auth/device",      // CLI creates device code
  "/auth/device/poll",  // CLI polls for approval
]);
```

Note: `/auth/device/approve` should NOT be exempted -- it uses cookie auth + CSRF from Portal.

### C2. Plaintext API key stored in MongoDB between approve and poll

**Impact:** Data leak risk. The `apiKey` field in the `DeviceCode` document holds the raw API key in plaintext for up to 5 minutes (TTL window).

`device-auth-service.ts:134` stores `keyResult.key` (the full plaintext key) in MongoDB. If the DB is compromised or logs query results, keys are exposed. The key is only deleted when the CLI polls, but could persist if the CLI never polls (user closes terminal).

**Recommended mitigations (pick one):**
1. Encrypt the key at rest with a derived key from the `deviceCode` (which only the CLI knows), so DB compromise alone doesn't leak it
2. Accept the risk but document it -- the TTL index auto-deletes after 5 min, and the key is also deleted on successful poll

---

## High Priority

### H1. Race condition: concurrent poll requests can both receive the key

`pollDeviceCode` does a `findOne` followed by a separate `deleteOne`. Two concurrent poll requests could both read the document before either deletes it, resulting in the key being returned twice.

**Fix:** Use `findOneAndDelete` atomically:

```typescript
if (doc.status === "approved" && doc.apiKey && doc.keyPrefix && doc.email) {
  const deleted = await DeviceCode.findOneAndDelete({
    _id: doc._id,
    status: "approved",
  });
  if (!deleted) return { status: "pending" }; // another poller got it
  return {
    status: "approved" as const,
    key: deleted.apiKey!,
    // ...
  };
}
```

### H2. Race condition: concurrent approve requests bypass attempt counter

`approveDeviceCode` reads `doc.approveAttempts`, increments in JS, then saves. Two concurrent requests can both read the same count and both pass the `>= MAX_APPROVE_ATTEMPTS` check.

**Fix:** Use atomic increment with a condition:

```typescript
const result = await DeviceCode.findOneAndUpdate(
  { userCode, status: "pending", approveAttempts: { $lt: MAX_APPROVE_ATTEMPTS } },
  { $inc: { approveAttempts: 1 } },
  { new: true },
);
if (!result) {
  throw new TuneloError("TUNELO_DEVICE_004", "Invalid, expired, or too many attempts", 400);
}
```

### H3. userCode collision not handled

`generateUserCode()` creates an 8-char code from a 30-char alphabet = 30^8 = ~656 billion combinations, BUT with `unique: true` index, a duplicate insert throws. The `createDeviceCode` function does not catch this and retry.

With active codes expiring in 5 min and low volume, collisions are extremely unlikely, but the unique index WILL throw a Mongoose duplicate key error (E11000) that bubbles as a 500.

**Fix:** Catch duplicate key errors and retry (max 3 attempts):

```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    await DeviceCode.create({ deviceCode, userCode, ... });
    break;
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000 && attempt < 2) {
      userCode = generateUserCode();
      continue;
    }
    throw err;
  }
}
```

### H4. Modulo bias in userCode generation

`USER_CODE_CHARS` has 30 characters. `bytes[i] % 30` produces bias: first 16 chars get probability 9/256 vs 8/256 for the rest (~12% relative difference). For a security-sensitive code, use rejection sampling:

```typescript
function generateUserCode(): string {
  const chars = USER_CODE_CHARS;
  const limit = 256 - (256 % chars.length); // 240
  let code = "";
  while (code.length < 8) {
    const [byte] = randomBytes(1);
    if (byte < limit) code += chars[byte % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
```

Severity is moderate since the code is short-lived and user-facing (not a cryptographic secret), but easy to fix.

---

## Medium Priority

### M1. `/auth/device` route is public with no abuse protection beyond rate limit

The `POST /auth/device` endpoint (create device code) is rate-limited to 5/hour/IP, but an attacker behind multiple IPs can flood the DB with pending device codes. Each creates a MongoDB document.

The TTL index provides automatic cleanup, so this is bounded. However, consider adding a global rate limit or requiring a CAPTCHA token for creation.

### M2. Portal device-auth-page shows userCode from URL without sanitization

`DeviceAuthPage` reads `userCode` from `searchParams.get("code")` and renders it directly in JSX. React auto-escapes JSX content, so XSS is not possible. However, the value is sent to the server without client-side format validation -- the server Zod schema handles it, but validating client-side would improve UX (show error immediately vs network round-trip).

### M3. `openBrowser` uses `exec` with URL string

`cli-device-auth.ts:29` passes the URL to shell via template literal. The URL is constructed from server response data (`verificationUrl`), not user input. However, if a malicious server returned a crafted URL, it could inject shell commands.

**Fix:** Use `execFile` instead of `exec` to avoid shell interpretation:

```typescript
import { execFile } from "node:child_process";
if (platform === "darwin") await execFileAsync("open", [url]);
else if (platform === "win32") await execFileAsync("cmd", ["/c", "start", "", url]);
else await execFileAsync("xdg-open", [url]);
```

### M4. Silent catch in CLI poll loop hides all errors

`cli-device-auth.ts:90` catches all exceptions during polling with an empty catch. This silently swallows non-network errors (e.g., JSON parse failures, unexpected response shapes). Consider logging in verbose mode or distinguishing network errors.

### M5. `req.userId ?? ""` in approve route passes empty string

`device-auth-routes.ts:67`: If `cookieAuth` middleware passes but somehow `req.userId` is undefined (shouldn't happen, but defensive coding), an empty string userId would be passed to `approveDeviceCode`, which would then call `User.findById("")` and throw "User not found". This is acceptable behavior but a guard would be clearer:

```typescript
if (!req.userId) { res.status(401).json({...}); return; }
```

---

## Low Priority

### L1. No rate limit on `/auth/device/approve`

The approve endpoint has cookie auth + CSRF + max 5 attempts per userCode, which is decent. However, there's no IP rate limit, so an authenticated attacker could brute-force random userCodes. The XXXX-XXXX format from 30 chars = 30^8 combinations makes brute force impractical, but a rate limit is cheap defense-in-depth.

### L2. `device-auth-${date}` key labels are not unique per device

If a user runs device auth twice on the same day, both keys get the same label. Not a bug, but could confuse users in the keys list. Consider appending a short random suffix.

### L3. Pre-existing bug: Portal CSRF token field name mismatch

The server returns `{ csrfToken: token }` but `portal/api/client.ts:24` reads `data.token`. This means CSRF tokens are never actually read from the response body. The Portal relies on the cookie being set (double-submit pattern reads from cookie, not response body). This is a pre-existing issue, not introduced by this PR, but the CSRF protection may not be working as intended for Portal requests.

---

## Positive Observations

- Clean separation: model / schema / service / route layers
- Zod validation on all inputs
- TTL index for automatic cleanup -- no stale data accumulation
- One-time key retrieval (delete after poll) limits exposure window
- Safe alphabet for userCode (no ambiguous chars)
- Cookie auth required for approve -- prevents unauthorized approvals
- Rate limiting on create and poll endpoints
- Cross-platform browser opening with graceful fallback
- File sizes within 200-line limit

---

## Recommended Actions (Priority Order)

1. **[BLOCKING] Add `/auth/device` and `/auth/device/poll` to `CSRF_EXEMPT_PATHS`** -- without this, the entire flow is broken
2. **[HIGH] Use `findOneAndDelete` in `pollDeviceCode`** to prevent double-delivery race
3. **[HIGH] Use atomic `$inc` in `approveDeviceCode`** to prevent attempt counter bypass
4. **[HIGH] Handle duplicate key errors in `createDeviceCode`** with retry loop
5. **[MEDIUM] Use `execFile` instead of `exec`** in `openBrowser` for shell injection prevention
6. **[LOW] Fix modulo bias in `generateUserCode`** with rejection sampling

---

## Unresolved Questions

1. Is the plaintext API key in MongoDB (between approve and poll) an accepted risk given the 5-min TTL? Or should it be encrypted at rest?
2. Should the Portal CSRF token field name mismatch (L3) be fixed in this PR or tracked separately?
3. Is there a plan to add integration tests for the device auth flow end-to-end?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Implementation is architecturally sound but has a critical CSRF blocking bug (C1) that makes the entire flow non-functional, plus race conditions in poll/approve (H1, H2). The security model is otherwise well-designed.
**Concerns:** C1 is a hard blocker -- must be fixed before merge. H1/H2 race conditions are exploitable under load.
