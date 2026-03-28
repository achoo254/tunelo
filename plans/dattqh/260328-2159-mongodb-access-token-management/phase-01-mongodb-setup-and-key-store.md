# Phase 1: MongoDB Setup + KeyStore Abstraction

## Context Links
- [Brainstorm report](../reports/brainstorm-260328-2159-mongodb-access-token-management.md)
- [Current auth.ts](../../packages/server/src/auth.ts)
- [Current server.ts](../../packages/server/src/server.ts)
- [System architecture](../../docs/system-architecture.md)
- [Code standards](../../docs/code-standards.md)

## Overview
- **Priority:** P1 (Critical — foundation for all other phases)
- **Status:** Pending
- **Effort:** 8h
- **Description:** Add MongoDB connection, define schemas, create KeyStore abstraction layer, migrate `auth.ts` from JSON file to MongoDB. Keep JSON file mode for dev/fallback.

## Key Insights
- Current `auth.ts` loads `keys.json` at startup, hashes keys with SHA-256, stores in `Set<string>`
- `validateApiKey()` does `Set.has(hash)` — O(1) but no metadata
- `ws-handler.ts` calls `validateApiKey(msg.key)` on each WS `auth` event
- Auth happens ONCE per WS connection → ~3ms MongoDB query latency acceptable
- `tunnel-manager.ts` stores `apiKey` string per tunnel but doesn't use it for validation
- Server uses `watchFile` for hot-reload — need equivalent MongoDB polling or skip for Phase 1

## Requirements

### Functional
- MongoDB connection with Mongoose ODM
- Collections: `organizations`, `users`, `api-keys`
- `KeyStore` interface abstracting key validation
- `MongoKeyStore` implementation (production)
- `JsonFileKeyStore` implementation (dev/fallback, wraps current logic)
- `validateApiKey` replaced by `keyStore.validate()` returning `KeyInfo | null`
- Migration script: import `keys.json` → MongoDB
- Env-based switching: `MONGO_URI` set → Mongo, else → JSON file

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
  │     MongoDB.apiKeys.findOne({ keyHash, status: "active" })
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
                   → else: register tunnel with KeyInfo
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
  emailVerified: { type: Boolean, default: false },
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
| `packages/server/src/server.ts` | Replace `loadApiKeys`/`watchApiKeys` with `createKeyStore()` init |
| `packages/server/src/ws-handler.ts` | Replace `validateApiKey(key)` with `keyStore.validate(hashKey(key))` |
| `packages/server/src/auth.ts` | Deprecate or remove — logic moves to key-store modules |
| `packages/server/package.json` | Add `mongoose`, `@types/mongoose` dependencies |
| `packages/shared/src/protocol.ts` | Add `KeyInfo` to AuthResult (optional, for client display) |

### Files to DELETE
| File | Reason |
|------|--------|
| `packages/server/src/auth.ts` | Replaced by key-store modules (after migration confirmed) |

## Implementation Steps

### Step 1: Install dependencies
```bash
cd packages/server
pnpm add mongoose
```

### Step 2: Create MongoDB connection manager
- `mongo-connection.ts`: connect with `MONGO_URI`, handle errors, expose health check
- Use Mongoose connection events for logging
- Graceful disconnect on server shutdown

### Step 3: Create Mongoose models
- `organization-model.ts`: Organization schema with slug unique index
- `user-model.ts`: User schema with email unique index
- `api-key-model.ts`: ApiKey schema with keyHash unique index + TTL on expiresAt

### Step 4: Create KeyStore interface
- `key-store-interface.ts`: `KeyStore` interface + `KeyInfo` type
- Export from a barrel-free path

### Step 5: Implement MongoKeyStore
- `mongo-key-store.ts`:
  - `validate(keyHash)`: `ApiKey.findOne({ keyHash, status: "active" })` → join Org → check org.status → check expiresAt → return KeyInfo
  - `recordUsage(keyHash)`: `ApiKey.updateOne({ keyHash }, { $set: { lastUsedAt: new Date() } })` — fire-and-forget
  - `initialize()`: verify MongoDB connection
  - `shutdown()`: disconnect

### Step 6: Implement JsonFileKeyStore
- `json-file-key-store.ts`: Wrap current `auth.ts` logic
  - `validate(keyHash)`: `Set.has(keyHash)` → return fixed KeyInfo `{ orgId: "local", orgSlug: "local", ... }`
  - `recordUsage()`: no-op
  - `initialize()`: load + watch file
  - `shutdown()`: unwatch

### Step 7: Create KeyStore factory
- `create-key-store.ts`: if `MONGO_URI` → `MongoKeyStore`, else → `JsonFileKeyStore`

### Step 8: Update server.ts
- Replace `loadApiKeys(keysFile)` + `watchApiKeys(keysFile)` with:
  ```typescript
  const keyStore = createKeyStore();
  await keyStore.initialize();
  ```
- Pass `keyStore` to `attachWsHandler(server, keyStore)`
- Call `keyStore.shutdown()` in graceful shutdown

### Step 9: Update ws-handler.ts
- Accept `keyStore: KeyStore` parameter
- Replace `validateApiKey(msg.key)` with:
  ```typescript
  const keyInfo = await keyStore.validate(hashKey(msg.key));
  if (!keyInfo) { /* reject */ }
  ```
- Pass `keyInfo` to `tunnelManager.register()` (optional, for future org-level limits)
- Fire-and-forget `keyStore.recordUsage(hashKey(msg.key))`

### Step 10: Write migration script
- `scripts/migrate-keys-to-mongo.ts`:
  - Read `keys.json`
  - Create default org "internal" with slug "internal"
  - Create default user (admin)
  - Hash each key → insert into api-keys collection
  - Log results

### Step 11: Write tests
- `mongo-key-store.test.ts`: mock Mongoose models, test validate/recordUsage
- `json-file-key-store.test.ts`: test with temp JSON file
- Update `auth.test.ts` or remove if fully replaced

### Step 12: Run lint + build + test
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
- [ ] Update `server.ts` to use KeyStore
- [ ] Update `ws-handler.ts` to use KeyStore
- [ ] Remove old `auth.ts` (or deprecate)
- [ ] Create migration script
- [ ] Write unit tests
- [ ] Run lint + build + test

## Success Criteria

- `MONGO_URI` set → server connects to MongoDB, validates keys via MongoKeyStore
- `MONGO_URI` not set → server falls back to `keys.json` via JsonFileKeyStore
- Existing tunnel connections work identically
- All current tests pass (auth.test.ts adapted)
- Migration script imports keys.json into MongoDB successfully
- `pnpm build` + `pnpm lint` + `pnpm test` all green

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mongoose adds significant bundle size | Low | Low | Tree-shaking, or consider native MongoDB driver instead |
| MongoDB connection fails at startup | Medium | High | Fallback to JsonFileKeyStore with warning log |
| Schema changes break existing tunnels | Low | High | AuthMessage unchanged, only server-side validation path changes |
| Performance regression from async validate | Low | Low | Auth 1x per connection, <10ms target |

## Security Considerations

- **Never log plaintext API keys** — only hash or prefix
- **keyHash indexed unique** — prevents duplicate key insertion
- **Org status check** — suspended orgs can't auth even with valid keys
- **TTL index on expiresAt** — MongoDB auto-removes expired keys
- **Password hashing** — bcrypt for user passwords (Phase 2, but schema ready)

## Next Steps
- Phase 2 depends on: MongoDB connection + models + KeyStore working
- Phase 2 adds: user auth endpoints, admin CRUD API
