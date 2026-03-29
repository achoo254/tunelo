# Phase 1: Server — Device Code API + MongoDB Model

## Context

- Brainstorm report: `plans/dattqh/reports/brainstorm-260329-2017-device-code-auth-flow.md`
- Existing auth routes: `packages/server/src/api/auth-routes.ts`
- Existing auth service: `packages/server/src/services/auth-service.ts`
- Existing auth schemas: `packages/server/src/api/schemas/auth-schemas.ts`
- DB models dir: `packages/server/src/db/models/`

## Overview

- **Priority:** P1
- **Status:** complete
- **Effort:** 5h
- Create MongoDB model for device codes, 3 new API endpoints, and a device-auth service.

## Requirements

### Functional
- `POST /api/auth/device` — create device code + user code, return verification URL
- `POST /api/auth/device/poll` — CLI polls with deviceCode, returns pending/approved/expired
- `POST /api/auth/device/approve` — Portal calls after user authenticates (cookie auth required)
- Device codes expire after 5 minutes (TTL index)
- Approved response includes API key (generated via existing key-service)

### Non-Functional
- Rate limit: device creation 5/hr per IP, poll 1 req/2s per deviceCode
- Max 5 approve attempts per userCode (brute force protection)
- deviceCode: 32 char crypto random (never shown to user)
- userCode: `XXXX-XXXX` format, 8 alphanumeric uppercase chars (user-friendly)

## Architecture

```
POST /api/auth/device
  → deviceAuthService.createDeviceCode()
  → save to MongoDB deviceCodes collection
  → return { deviceCode, userCode, verificationUrl, expiresIn: 300 }

POST /api/auth/device/poll
  → deviceAuthService.pollDeviceCode(deviceCode)
  → if pending → { status: "pending" }
  → if approved → { status: "approved", key, keyPrefix, userId, email }
  → if expired/not found → { status: "expired" }

POST /api/auth/device/approve  (cookie auth required)
  → deviceAuthService.approveDeviceCode(userCode, userId)
  → generate API key via keyService.createKey()
  → update deviceCode doc: status=approved, apiKey, userId
  → return { success: true }
```

## Files to Create

| File | Purpose |
|------|---------|
| `packages/server/src/db/models/device-code-model.ts` | Mongoose model with TTL index |
| `packages/server/src/services/device-auth-service.ts` | Business logic for device code flow |
| `packages/server/src/api/device-auth-routes.ts` | Express router with 3 endpoints |
| `packages/server/src/api/schemas/device-auth-schemas.ts` | Zod validation schemas |

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server.ts` | Mount device auth router at `/api/auth/device/*` |

## Implementation Steps

### 1. Create Device Code Mongoose Model

```typescript
// packages/server/src/db/models/device-code-model.ts
interface IDeviceCode {
  deviceCode: string;      // 32 char random, index unique
  userCode: string;        // XXXX-XXXX format, index unique
  status: 'pending' | 'approved' | 'expired';
  userId?: mongoose.Types.ObjectId;
  apiKey?: string;         // plaintext key (only stored temporarily until CLI polls)
  keyPrefix?: string;
  email?: string;
  approveAttempts: number; // brute force counter
  expiresAt: Date;         // TTL index, 5 min from creation
  createdAt: Date;
}

// TTL index on expiresAt — MongoDB auto-deletes expired docs
deviceCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
deviceCodeSchema.index({ deviceCode: 1 }, { unique: true });
deviceCodeSchema.index({ userCode: 1 }, { unique: true });
```

### 2. Create Zod Schemas

```typescript
// packages/server/src/api/schemas/device-auth-schemas.ts
export const pollDeviceSchema = z.object({
  deviceCode: z.string().length(32),
});

export const approveDeviceSchema = z.object({
  userCode: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});
```

### 3. Create Device Auth Service

```typescript
// packages/server/src/services/device-auth-service.ts

export async function createDeviceCode(serverBaseUrl: string): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
}>

export async function pollDeviceCode(deviceCode: string): Promise<
  | { status: 'pending' }
  | { status: 'approved'; key: string; keyPrefix: string; userId: string; email: string }
  | { status: 'expired' }
>

export async function approveDeviceCode(userCode: string, userId: string): Promise<void>
```

Key logic:
- `createDeviceCode`: generate crypto random deviceCode (32 chars) + userCode (XXXX-XXXX), save to DB, return verificationUrl pointing to portal
- `pollDeviceCode`: lookup by deviceCode, return status. If approved, return key then delete doc
- `approveDeviceCode`: lookup by userCode, verify not expired, increment approveAttempts (max 5), generate API key via `keyService.createKey(userId, label)`, update doc status to approved

### 4. Create Device Auth Routes

```typescript
// packages/server/src/api/device-auth-routes.ts
router.post('/', rateLimiter, createDeviceCode)           // POST /api/auth/device
router.post('/poll', pollRateLimiter, pollDeviceCode)      // POST /api/auth/device/poll
router.post('/approve', cookieAuth, approveDeviceCode)     // POST /api/auth/device/approve
```

### 5. Mount Router in Server

In `packages/server/src/server.ts`, add:
```typescript
import { createDeviceAuthRouter } from './api/device-auth-routes.js';
// ...
app.use('/api/auth/device', createDeviceAuthRouter());
```

## Todo List

- [x] Create `device-code-model.ts` with TTL index
- [x] Create `device-auth-schemas.ts` with Zod validation
- [x] Create `device-auth-service.ts` with create/poll/approve logic
- [x] Create `device-auth-routes.ts` with 3 endpoints + rate limiting
- [x] Mount router in `server.ts`
- [x] Test: create → poll (pending) → approve → poll (approved + key)
- [x] Test: expired code returns `{ status: "expired" }`
- [x] Test: brute force protection (max 5 approve attempts)

## Success Criteria

- All 3 endpoints working with correct Zod validation
- TTL index auto-deletes expired device codes
- Approved poll returns valid API key
- Rate limiting prevents abuse
- No plaintext secrets logged

## Security Considerations

- deviceCode is high-entropy (32 chars crypto random) — only CLI knows it
- userCode is short but time-limited (5 min) + attempt-limited (5 tries)
- API key in approved doc is temporary — deleted after CLI polls it
- approve endpoint requires cookie auth (user must be logged in)
- Poll endpoint rate limited to prevent enumeration
