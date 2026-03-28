# Phase 3: Customer API + Org Limits Enforcement

## Context Links
- [Phase 1](./phase-01-mongodb-setup-and-key-store.md) — MongoDB + KeyStore + TunnelConnection
- [Phase 2](./phase-02-express-auth-and-admin-api.md) — Express + Auth + Admin API
- [tunnel-manager.ts](../../packages/server/src/tunnel-manager.ts)
- [ws-handler.ts](../../packages/server/src/ws-handler.ts)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 10h
- **Description:** Customer-facing API for self-service key management. Enforce org-level limits (maxKeys, maxTunnelsPerKey). Revoking a key disconnects active tunnels.

## Key Insights
- Phase 1 already added `apiKeyHash` + `orgId` to TunnelConnection + `countByKeyHash()`/`disconnectByKeyHash()` methods
- Phase 2 provides JWT middleware + api-key-service — reuse here
- `maxTunnelsPerKey` enforcement: check `tunnelManager.countByKeyHash()` during WS auth in ws-handler
- Key format: `tk_` prefix + 32 char nanoid → plaintext returned ONCE, hash stored
- Customer routes need JWT auth (from Phase 2 middleware)
- Accept any key format on validation (no `tk_` prefix enforcement) — new keys generated with `tk_` but old keys without prefix still work

## Requirements

### Functional
- **Customer endpoints (JWT auth):**
  - GET `/api/keys` — list own org's keys (prefix, label, status, created, lastUsed)
  - POST `/api/keys` — create new key (returns plaintext ONCE)
  - DELETE `/api/keys/:keyId` — revoke key (status → "revoked")
  - GET `/api/profile` — own user + org info
  - PATCH `/api/profile/password` — change password
- **Org limits enforcement:**
  - `maxKeys`: reject key creation if org at limit
  - `maxTunnelsPerKey`: reject WS tunnel auth if key at tunnel limit
  - `org.status`: reject auth if org suspended (already in Phase 1 MongoKeyStore)
- **Key revocation side effect:** disconnect all active tunnels using that keyHash

### Non-Functional
- Key creation returns plaintext exactly once — never retrievable again
- Customer can only see/manage keys in their own org
- Member role can create/revoke keys; owner can do everything

## Architecture

### Customer API Flow
```
JWT → jwtAuthMiddleware → req.user = { userId, orgId, role }

POST /api/keys:
  → orgService.getOrg(orgId) → check limits.maxKeys
  → apiKeyService.countActiveKeys(orgId)
  → if count >= maxKeys → 403 "Key limit reached"
  → apiKeyService.createKey(orgId, userId, label)
  → return { key: "tk_xxx", keyId, label, prefix }  ← plaintext ONCE

DELETE /api/keys/:keyId:
  → verify key belongs to req.user.orgId
  → apiKeyService.revokeKey(keyId, orgId) → returns keyHash
  → tunnelManager.disconnectByKeyHash(keyHash)
  → return { success: true }
```

### Tunnel Limit Enforcement (ws-handler.ts update)
```
ws-handler.ts handleAuth():
  → keyStore.validate(keyHash) → KeyInfo { maxTunnels, orgId }
  → tunnelManager.countByKeyHash(keyHash)
  → if count >= keyInfo.maxTunnels → reject with TUNELO_TUNNEL_004 error
  → register tunnel with keyHash + orgId
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
| `packages/server/src/ws-handler.ts` | Add maxTunnelsPerKey check after keyStore.validate() |
| `packages/server/src/api/create-api-router.ts` | Mount customer routes under `/api/keys` + `/api/profile` |
| `packages/server/src/services/api-key-service.ts` | Add `countActiveKeys(orgId)`, enhance `createKey()` with limit check |
| `packages/shared/src/errors.ts` | Add `TUNELO_TUNNEL_004` (tunnel limit reached) error code |

## Implementation Steps

### Step 1: Add tunnel limit error code
- In `packages/shared/src/errors.ts`: add `TUNELO_TUNNEL_004` — "Tunnel limit reached for this key"

### Step 2: Enforce maxTunnelsPerKey in ws-handler.ts
- In `handleAuth()`, after `keyStore.validate()` returns KeyInfo:
  ```typescript
  const currentCount = tunnelManager.countByKeyHash(keyInfo.keyHash);
  if (currentCount >= keyInfo.maxTunnels) {
    safeSend(ws, {
      type: "auth-result",
      success: false,
      subdomain: requestedSubdomain,
      url: "",
      error: "Tunnel limit reached for this key",
    });
    ws.close(WS_CLOSE_CODES.AUTH_FAILED, "Tunnel limit reached");
    return;
  }
  ```
- Same check in `handleRegisterTunnel()` for additional tunnel registration

### Step 3: Enhance api-key-service
- `countActiveKeys(orgId)`: `ApiKeyModel.countDocuments({ orgId, status: "active" })`
- `createKey(orgId, userId, label)`:
  - Fetch org limits: `OrganizationModel.findById(orgId).lean()`
  - Check `limits.maxKeys` vs `countActiveKeys(orgId)`
  - If at limit → throw TuneloError `TUNELO_AUTH_003` "Key limit reached"
  - Generate: `tk_${nanoid(32)}`
  - Hash: SHA-256 of full key
  - Store: `{ orgId, createdBy, keyHash, keyPrefix: key.slice(0, 7), label, status: "active" }`
  - Return: `{ key (plaintext), keyId, prefix, label }`
- `revokeKey(keyId, orgId)`:
  - `ApiKeyModel.findOneAndUpdate({ _id: keyId, orgId }, { status: "revoked" }).lean()`
  - Verify key belongs to org (orgId match)
  - Return `keyHash` for tunnel disconnection

### Step 4: Create customer routes
- `api/customer-routes.ts`: Express router factory, accepts `{ tunnelManager }`
  - Apply `jwtAuthMiddleware` to all routes
  - GET `/keys` — `apiKeyService.listKeysByOrg(req.user.orgId)`
  - POST `/keys` — validate label (Zod), `apiKeyService.createKey(orgId, userId, label)`
  - DELETE `/keys/:keyId` — `apiKeyService.revokeKey(keyId, orgId)` → `tunnelManager.disconnectByKeyHash(keyHash)`
  - GET `/profile` — return user + org info (no passwordHash)
  - PATCH `/profile/password` — Zod validate, bcrypt verify old, hash new, update

### Step 5: Mount customer routes
- In `create-api-router.ts`:
  ```typescript
  apiRouter.use('/keys', jwtAuthMiddleware, createCustomerKeyRoutes({ tunnelManager }));
  apiRouter.use('/profile', jwtAuthMiddleware, createCustomerProfileRoutes());
  ```

### Step 6: Write tests
- Customer routes: create key (success + limit), list keys, revoke + tunnel disconnect, profile
- Org limits: maxKeys enforcement (create beyond limit → 403)
- Tunnel limits: maxTunnelsPerKey enforcement (WS auth rejected when at limit)
- Key revocation: verify tunnels disconnected after revoke

### Step 7: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Add TUNELO_TUNNEL_004 error code
- [ ] Enforce maxTunnelsPerKey in `ws-handler.ts` handleAuth
- [ ] Enforce maxTunnelsPerKey in `ws-handler.ts` handleRegisterTunnel
- [ ] Add `countActiveKeys()` to api-key-service
- [ ] Enhance `createKey()` with maxKeys limit check
- [ ] Enhance `revokeKey()` to return keyHash
- [ ] Create `api/customer-routes.ts` (keys + profile)
- [ ] Mount customer routes in `create-api-router.ts`
- [ ] Write customer API tests
- [ ] Write org limits + tunnel limits tests
- [ ] Run lint + build + test

## Success Criteria

- Customer can create API key → receives plaintext once
- Customer can list own keys (sees prefix, not full key or hash)
- Customer can revoke key → active tunnels using it disconnect immediately
- maxKeys limit enforced → TuneloError when org exceeds limit
- maxTunnelsPerKey enforced → WS auth rejected when key at tunnel limit
- Customer cannot see/manage keys of other orgs (JWT orgId check)
- Old keys without `tk_` prefix still validate correctly
- Password change requires old password verification
- `pnpm build` + `pnpm lint` + `pnpm test` green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Key revocation race condition | Low | Medium | Disconnect after DB update, accept brief window |
| countByKeyHash O(n) scan | Low | Low | n = active tunnels (~10k max), iteration fast enough |
| Customer route conflicts with admin routes | Low | Low | Separate route prefixes (/keys vs /admin) |

## Security Considerations

- **Org isolation** — JWT `orgId` always checked against resource ownership
- **Key plaintext** — returned only on creation, never stored/logged
- **Password change** — requires old password verification (bcrypt compare)
- **Revocation** — immediate tunnel disconnection prevents stale access
- **No hash in response** — list keys returns prefix + metadata only

## Next Steps
- Phase 4 depends on: all API endpoints working + limits enforced
- Phase 4 adds: dashboard UI + usage tracking
