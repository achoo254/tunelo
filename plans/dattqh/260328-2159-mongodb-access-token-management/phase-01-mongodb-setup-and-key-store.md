# Phase 1: MongoDB Setup + KeyStore + TunnelConnection Enhancement

## Context Links
- [Brainstorm review](../reports/brainstorm-260328-2359-mongodb-plan-review.md)
- [Current auth.ts](../../packages/server/src/auth.ts)
- [Current tunnel-manager.ts](../../packages/server/src/tunnel-manager.ts)
- [Current ws-handler.ts](../../packages/server/src/ws-handler.ts)
- [Code standards](../../docs/code-standards.md)

## Overview
- **Priority:** P1 (Critical — foundation for all other phases)
- **Status:** Pending
- **Effort:** 8h
- **Description:** Add MongoDB connection, define Mongoose schemas, create KeyStore abstraction layer, enhance TunnelConnection with orgId + apiKeyHash. Keep JSON file mode for dev/fallback.

## Key Insights
- Current `auth.ts`: loads `keys.json` → SHA-256 hash → `Set<string>` → `validateApiKey()` returns boolean
- `ws-handler.ts` line 173: `validateApiKey(msg.key)` — synchronous boolean check
- `tunnelManager.register(subdomain, socket, connectionId, apiKey, auth?)` — `apiKey` is raw string
- `TunnelConnection.apiKey` stores raw key — security risk, change to hash
- Auth happens ONCE per WS connection → ~3ms MongoDB query latency acceptable
- **Phase 1 adds orgId + apiKeyHash to TunnelConnection** — avoids double-refactor in Phase 3

## Requirements

### Functional
- MongoDB connection with Mongoose ODM
- Collections: `organizations`, `users`, `api-keys`
- `KeyStore` interface abstracting key validation
- `MongoKeyStore` implementation (production)
- `JsonFileKeyStore` implementation (dev/fallback, wraps current logic)
- `validateApiKey` replaced by `keyStore.validate()` returning `KeyInfo | null`
- `TunnelConnection` enhanced with `apiKeyHash: string` and `orgId: string`
- `tunnelManager.register()` updated to accept `apiKeyHash` + `orgId`
- Env-based switching: `MONGO_URI` set → Mongo, else → JSON file
- Migration script: import `keys.json` → MongoDB

### Non-Functional
- Auth latency <10ms per WS connection
- Graceful fallback if MongoDB unavailable at startup
- Connection pooling (Mongoose default: 100)
- Zero downtime migration — old keys.json still works

## Architecture

```
server.ts
  ├── createKeyStore(config)  → MongoKeyStore | JsonFileKeyStore
  │     ↓
  ├── keyStore.validate(hash) → KeyInfo | null
  │     ↓ (MongoKeyStore)
  │     MongoDB.apiKeys.findOne({ keyHash, status: "active" }).lean()
  │       → check expiresAt
  │       → join org.status === "active"
  │       → return KeyInfo { orgId, orgSlug, keyId, maxTunnels, plan }
  │       → async: update lastUsedAt
  │     ↓ (JsonFileKeyStore)
  │     Set.has(hash) → KeyInfo { orgId: "local", ... }
  │
  └── ws-handler.ts
        auth event → keyStore.validate(hashKey(msg.key))
                   → if null: reject
                   → else: tunnelManager.register(subdomain, ws, connId, keyHash, orgId, auth)
```

### MongoDB Schema (Mongoose)

```typescript
// organizations
{
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  plan: { type: String, enum: ["free"], default: "free" },
  contactEmail: { type: String, required: true },
  limits: {
    maxKeys: { type: Number, default: 5 },
    maxTunnelsPerKey: { type: Number, default: 3 },
    maxRequestsPerDay: { type: Number, default: 10_000 },
  },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  createdAt: Date,
  updatedAt: Date,
}

// users
{
  orgId: { type: ObjectId, ref: "Organization", required: true, index: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["owner", "member"], default: "member" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  createdAt: Date,
}

// api-keys
{
  orgId: { type: ObjectId, ref: "Organization", required: true, index: true },
  createdBy: { type: ObjectId, ref: "User", required: true },
  keyHash: { type: String, required: true, unique: true, index: true },
  keyPrefix: { type: String, required: true },  // "tk_a3x..." first 7 chars
  label: { type: String, default: "Default" },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
  expiresAt: { type: Date, default: null },      // TTL index
  lastUsedAt: { type: Date, default: null },
  createdAt: Date,
}
```

### KeyStore Interface

```typescript
export interface KeyInfo {
  orgId: string;
  orgSlug: string;
  keyId: string;
  keyHash: string;
  maxTunnels: number;
  plan: string;
}

export interface KeyStore {
  validate(keyHash: string): Promise<KeyInfo | null>;
  recordUsage(keyHash: string): Promise<void>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### TunnelConnection Enhancement

```typescript
// BEFORE (current):
export interface TunnelConnection {
  socket: WebSocket;
  connectionId: string;
  apiKey: string;        // ← raw key string (security risk)
  subdomain: string;
  connectedAt: Date;
  pendingRequests: Map<string, PendingRequest>;
  authHash?: string;
}

// AFTER (Phase 1):
export interface TunnelConnection {
  socket: WebSocket;
  connectionId: string;
  apiKeyHash: string;    // ← SHA-256 hash (secure)
  orgId: string;         // ← NEW: for org-level queries
  subdomain: string;
  connectedAt: Date;
  pendingRequests: Map<string, PendingRequest>;
  authHash?: string;
}
```

## Related Code Files

### Files to CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/db/mongo-connection.ts` | MongoDB connection manager (connect, disconnect, health) |
| `packages/server/src/db/models/organization-model.ts` | Mongoose Organization schema + model |
| `packages/server/src/db/models/user-model.ts` | Mongoose User schema + model |
| `packages/server/src/db/models/api-key-model.ts` | Mongoose ApiKey schema + model |
| `packages/server/src/key-store/key-store-interface.ts` | KeyStore interface + KeyInfo type |
| `packages/server/src/key-store/mongo-key-store.ts` | MongoKeyStore implementation |
| `packages/server/src/key-store/json-file-key-store.ts` | JsonFileKeyStore (wraps current auth.ts logic) |
| `packages/server/src/key-store/create-key-store.ts` | Factory: env → MongoKeyStore or JsonFileKeyStore |
| `packages/server/src/__tests__/mongo-key-store.test.ts` | Unit tests for MongoKeyStore |
| `packages/server/src/__tests__/json-file-key-store.test.ts` | Unit tests for JsonFileKeyStore |
| `scripts/migrate-keys-to-mongo.ts` | One-time migration script: keys.json → MongoDB |

### Files to MODIFY
| File | Change |
|------|--------|
| `packages/server/src/server.ts` | Replace `loadApiKeys`/`watchApiKeys` with `createKeyStore()` init + shutdown |
| `packages/server/src/ws-handler.ts` | Replace `validateApiKey(key)` → `keyStore.validate(hashKey(key))`, pass keyHash+orgId to register |
| `packages/server/src/tunnel-manager.ts` | Change `apiKey: string` → `apiKeyHash: string` + add `orgId: string` in TunnelConnection, update `register()` signature |
| `packages/server/package.json` | Add `mongoose` dependency |

### Files to DELETE
| File | Reason |
|------|--------|
| `packages/server/src/auth.ts` | Replaced by key-store modules (after migration confirmed) |

## Implementation Steps

### Step 1: Install dependencies
```bash
cd packages/server && pnpm add mongoose
```

### Step 2: Create MongoDB connection manager
- `db/mongo-connection.ts`: connect with `MONGO_URI`, handle errors, expose health check
- Use Mongoose connection events for logging (pino)
- Graceful disconnect on server shutdown
- Export `connectMongo()`, `disconnectMongo()`, `isMongoConnected()`

### Step 3: Create Mongoose models
- `db/models/organization-model.ts`: Organization schema with slug unique index
- `db/models/user-model.ts`: User schema with email unique index, NO `emailVerified` field
- `db/models/api-key-model.ts`: ApiKey schema with keyHash unique index + TTL on expiresAt

### Step 4: Create KeyStore interface
- `key-store/key-store-interface.ts`: `KeyStore` interface + `KeyInfo` type
- Export types directly (no barrel file)

### Step 5: Implement MongoKeyStore
- `key-store/mongo-key-store.ts`:
  - `validate(keyHash)`: `ApiKey.findOne({ keyHash, status: "active" }).lean()` → lookup org → check org.status → check expiresAt → return KeyInfo
  - `recordUsage(keyHash)`: `ApiKey.updateOne({ keyHash }, { $set: { lastUsedAt: new Date() } })` — fire-and-forget
  - `initialize()`: verify MongoDB connection alive
  - `shutdown()`: call `disconnectMongo()`

### Step 6: Implement JsonFileKeyStore
- `key-store/json-file-key-store.ts`: wrap current `auth.ts` logic
  - `validate(keyHash)`: `Set.has(keyHash)` → return fixed KeyInfo `{ orgId: "local", orgSlug: "local", keyHash, keyId: "local", maxTunnels: 10, plan: "free" }`
  - `recordUsage()`: no-op
  - `initialize()`: load + watchFile (current logic from auth.ts)
  - `shutdown()`: unwatchFile

### Step 7: Create KeyStore factory
- `key-store/create-key-store.ts`: if `MONGO_URI` env set → `MongoKeyStore`, else → `JsonFileKeyStore`
- Log which store is being used

### Step 8: Enhance TunnelConnection + TunnelManager
- In `tunnel-manager.ts`:
  - Change `apiKey: string` → `apiKeyHash: string` in TunnelConnection interface
  - Add `orgId: string` to TunnelConnection interface
  - Update `register()` signature: `register(subdomain, socket, connectionId, apiKeyHash, orgId, auth?)`
  - Add `countByKeyHash(keyHash: string): number` — iterate tunnels, count matches
  - Add `countByOrg(orgId: string): number`
  - Add `disconnectByKeyHash(keyHash: string): void` — find + close + unregister all

### Step 9: Update server.ts
- Replace `loadApiKeys(keysFile)` + `watchApiKeys(keysFile)` with:
  ```typescript
  const keyStore = createKeyStore();
  await keyStore.initialize();
  ```
- Pass `keyStore` to `attachWsHandler(server, keyStore)`
- Call `keyStore.shutdown()` in graceful shutdown

### Step 10: Update ws-handler.ts
- Accept `keyStore: KeyStore` parameter in `attachWsHandler()`
- Change `handleAuth()` to async:
  ```typescript
  const keyHash = hashKey(msg.key);
  const keyInfo = await keyStore.validate(keyHash);
  if (!keyInfo) { /* reject */ }
  ```
- Pass `keyInfo.keyHash` + `keyInfo.orgId` to `tunnelManager.register()`
- Fire-and-forget `keyStore.recordUsage(keyHash)`
- Update `handleRegisterTunnel()` to use keyHash from existing tunnel

### Step 11: Write migration script
- `scripts/migrate-keys-to-mongo.ts`:
  - Read `keys.json`
  - Create default org "internal" with slug "internal"
  - Create default admin user
  - Hash each key → insert into api-keys collection
  - Log results

### Step 12: Write tests
- `mongo-key-store.test.ts`: mock Mongoose models, test validate/recordUsage
- `json-file-key-store.test.ts`: test with temp JSON file
- Run existing tests — verify no regressions

### Step 13: Run lint + build + test
```bash
pnpm lint:fix && pnpm build && pnpm test
```

## Todo List

- [ ] Install mongoose dependency
- [ ] Create `db/mongo-connection.ts`
- [ ] Create `db/models/organization-model.ts`
- [ ] Create `db/models/user-model.ts`
- [ ] Create `db/models/api-key-model.ts`
- [ ] Create `key-store/key-store-interface.ts`
- [ ] Create `key-store/mongo-key-store.ts`
- [ ] Create `key-store/json-file-key-store.ts`
- [ ] Create `key-store/create-key-store.ts`
- [ ] Enhance TunnelConnection (apiKeyHash + orgId)
- [ ] Add countByKeyHash, countByOrg, disconnectByKeyHash to TunnelManager
- [ ] Update `server.ts` to use KeyStore
- [ ] Update `ws-handler.ts` to use KeyStore (async validate)
- [ ] Remove old `auth.ts`
- [ ] Create migration script
- [ ] Write unit tests
- [ ] Run lint + build + test

## Success Criteria

- `MONGO_URI` set → server connects to MongoDB, validates keys via MongoKeyStore
- `MONGO_URI` not set → server falls back to `keys.json` via JsonFileKeyStore
- TunnelConnection stores `apiKeyHash` (not raw key) and `orgId`
- `countByKeyHash()` and `countByOrg()` return correct counts
- `disconnectByKeyHash()` closes all tunnels for a given key
- Existing tunnel connections work identically
- All current tests pass (adapted for new register signature)
- Migration script imports keys.json into MongoDB
- `pnpm build` + `pnpm lint` + `pnpm test` all green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mongoose adds significant bundle size | Low | Low | Acceptable for server-side, no tree-shaking needed |
| MongoDB connection fails at startup | Medium | High | Fallback to JsonFileKeyStore with warning log |
| register() signature change breaks tests | Medium | Medium | Update all test files referencing register() |
| async validate() changes ws-handler flow | Medium | Medium | handleAuth becomes async, test carefully |

## Security Considerations

- **Never log plaintext API keys** — only hash or prefix
- **keyHash indexed unique** — prevents duplicate key insertion
- **Org status check** — suspended orgs can't auth even with valid keys
- **TTL index on expiresAt** — MongoDB auto-removes expired keys
- **TunnelConnection stores hash, not raw key** — no plaintext in memory
- **Password hashing** — bcrypt for user passwords (schema ready, used in Phase 2)

## Next Steps
- Phase 2 depends on: MongoDB connection + models + KeyStore + TunnelConnection enhancement working
- Phase 2 adds: Express integration, user auth endpoints, admin CRUD API
