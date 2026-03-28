# Phase 3: Customer API + Org Limits Enforcement

## Context Links
- [Phase 1](./phase-01-mongodb-setup-and-key-store.md) — MongoDB + KeyStore
- [Phase 2](./phase-02-user-auth-and-admin-api.md) — User auth + Admin API
- [tunnel-manager.ts](../../packages/server/src/tunnel-manager.ts)
- [ws-handler.ts](../../packages/server/src/ws-handler.ts)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 10h
- **Description:** Customer-facing API for self-service key management. Enforce org-level limits (maxKeys, maxTunnelsPerKey). Customers can create/revoke/list their own keys.

## Key Insights
- Phase 2 provides JWT middleware + api-key-service — reuse here
- `tunnel-manager.ts` currently doesn't track org association — need to add `orgId` to `TunnelConnection`
- `maxTunnelsPerKey` enforcement requires counting active tunnels per key hash at auth time
- Key generation: `tk_` prefix + 32 char random → plaintext returned ONCE, hash stored
- Current `TunnelConnection.apiKey` stores raw key string — change to keyHash for security

## Requirements

### Functional
- **Customer endpoints (JWT auth):**
  - GET `/api/keys` — list own org's keys (prefix, label, status, created, lastUsed)
  - POST `/api/keys` — create new key (returns plaintext ONCE)
  - DELETE `/api/keys/:keyId` — revoke key (soft delete: status → "revoked")
  - GET `/api/profile` — own user + org info
  - PATCH `/api/profile/password` — change password
- **Org limits enforcement:**
  - `maxKeys`: reject key creation if org at limit
  - `maxTunnelsPerKey`: reject tunnel registration if key at tunnel limit
  - `org.status`: reject auth if org suspended
- **Key format:** `tk_{32_random_alphanumeric}` (total 35 chars)

### Non-Functional
- Key creation returns plaintext exactly once — never retrievable again
- Revoking a key disconnects all active tunnels using that key
- Customer can only see/manage keys in their own org
- Member role can create/revoke keys; owner can do everything

## Architecture

```
Customer API Flow:
  JWT → jwtAuthMiddleware → req.user = { userId, orgId, role }

  POST /api/keys:
    → check org.limits.maxKeys > current active key count
    → generate tk_{random32}
    → hash → store in api-keys collection
    → return { key: "tk_xxx", keyId, label, prefix }  ← plaintext ONCE

  DELETE /api/keys/:keyId:
    → verify key belongs to req.user.orgId
    → set status = "revoked"
    → disconnect all tunnels using this keyHash

Tunnel Limit Enforcement:
  ws-handler.ts auth event:
    → keyStore.validate(hash) → KeyInfo { maxTunnels }
    → count active tunnels with same keyHash in TunnelManager
    → if count >= maxTunnels → reject with error
```

### TunnelConnection Enhancement
```typescript
// Add to TunnelConnection interface:
interface TunnelConnection {
  socket: Socket;
  apiKeyHash: string;     // Changed from apiKey (raw) to hash
  orgId: string;          // NEW: for org-level queries
  subdomain: string;
  connectedAt: Date;
  pendingRequests: Map<string, PendingRequest>;
  authHash?: string;
}
```

### TunnelManager New Methods
```typescript
// Count tunnels by key hash
countByKeyHash(keyHash: string): number;

// Count tunnels by org
countByOrg(orgId: string): number;

// Disconnect all tunnels for a key hash (when key revoked)
disconnectByKeyHash(keyHash: string): void;
```

## Related Code Files

### Files to CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/api/customer-routes.ts` | `/api/keys`, `/api/profile` endpoints |
| `packages/server/src/__tests__/customer-routes.test.ts` | Customer API tests |
| `packages/server/src/__tests__/org-limits.test.ts` | Limit enforcement tests |

### Files to MODIFY
| File | Change |
|------|--------|
| `packages/server/src/tunnel-manager.ts` | Add `orgId`, `apiKeyHash` to TunnelConnection. Add `countByKeyHash()`, `countByOrg()`, `disconnectByKeyHash()` methods |
| `packages/server/src/ws-handler.ts` | Enforce maxTunnelsPerKey limit during auth. Store keyHash + orgId in tunnel registration |
| `packages/server/src/api/api-router.ts` | Mount customer routes under `/api` |
| `packages/server/src/services/api-key-service.ts` | Add `createKey()` with limit check, `listKeysByOrg()` |

## Implementation Steps

### Step 1: Enhance TunnelManager
- Add `apiKeyHash` and `orgId` fields to `TunnelConnection`
- Update `register()` signature: `register(subdomain, socket, apiKeyHash, orgId, auth?)`
- Add `countByKeyHash(keyHash): number` — iterate tunnels, count matches
- Add `countByOrg(orgId): number`
- Add `disconnectByKeyHash(keyHash): void` — find + disconnect + unregister all

### Step 2: Update ws-handler.ts for limits
- After `keyStore.validate()` returns `KeyInfo`:
  - Count active tunnels: `tunnelManager.countByKeyHash(keyHash)`
  - If count >= `keyInfo.maxTunnels` → emit error, disconnect
- Pass `keyHash` + `keyInfo.orgId` to `tunnelManager.register()`

### Step 3: Create customer routes
- `customer-routes.ts`:
  - GET `/keys` — `apiKeyService.listKeysByOrg(req.user.orgId)`
  - POST `/keys` — validate label, check limit, `apiKeyService.createKey(orgId, userId, label)`
  - DELETE `/keys/:keyId` — verify ownership, revoke, `tunnelManager.disconnectByKeyHash()`
  - GET `/profile` — return user + org info (no passwordHash)
  - PATCH `/profile/password` — bcrypt verify old, hash new, update

### Step 4: Enhance api-key-service
- `createKey(orgId, userId, label)`:
  - Check `org.limits.maxKeys` vs active key count
  - Generate: `tk_${nanoid(32)}`
  - Hash: SHA-256
  - Store: `{ orgId, createdBy, keyHash, keyPrefix: key.slice(0, 7), label, status: "active" }`
  - Return: `{ key (plaintext), keyId, prefix, label }`
- `listKeysByOrg(orgId)`:
  - Find all keys for org, return prefix + metadata (no hash)
- `revokeKey(keyId, orgId)`:
  - Verify key belongs to org
  - Set status = "revoked"
  - Return keyHash (for tunnel disconnection)

### Step 5: Mount customer routes
- In `api-router.ts`: mount customer routes with `jwtAuthMiddleware`

### Step 6: Write tests
- Customer routes: create key, list keys, revoke, profile
- Org limits: maxKeys enforcement, maxTunnelsPerKey enforcement
- Key revocation: verify tunnels disconnected after revoke

### Step 7: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Enhance `TunnelConnection` with `apiKeyHash` + `orgId`
- [ ] Add `countByKeyHash()`, `countByOrg()`, `disconnectByKeyHash()` to TunnelManager
- [ ] Update `ws-handler.ts` for maxTunnelsPerKey enforcement
- [ ] Enhance `api-key-service.ts` with createKey, listKeys, revokeKey
- [ ] Create `customer-routes.ts`
- [ ] Mount customer routes in `api-router.ts`
- [ ] Write customer API tests
- [ ] Write org limits tests
- [ ] Run lint + build + test

## Success Criteria

- Customer can create API key → receives plaintext once
- Customer can list own keys (sees prefix, not full key)
- Customer can revoke key → active tunnels using it disconnect
- maxKeys limit enforced → error when org exceeds limit
- maxTunnelsPerKey enforced → WS auth rejected when key at limit
- Customer cannot see/manage keys of other orgs
- `pnpm build` + `pnpm lint` + `pnpm test` green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TunnelManager changes break existing tests | Medium | Medium | Update all tests referencing `register()` signature |
| Key revocation race condition | Low | Medium | Disconnect after DB update, accept brief window |
| countByKeyHash O(n) scan | Low | Low | n = active tunnels (~10k max), iteration fast enough |

## Security Considerations

- **Org isolation** — JWT `orgId` always checked against resource ownership
- **Key plaintext** — returned only on creation, never stored/logged
- **Password change** — requires old password verification
- **Revocation** — immediate tunnel disconnection prevents stale access

## Next Steps
- Phase 4 depends on: all API endpoints working + limits enforced
- Phase 4 adds: dashboard UI + usage tracking
