---
phase: 1
title: "MongoDB + KeyStore + TunnelConnection"
status: completed
effort: 9h
---

# Phase 1: MongoDB + KeyStore + TunnelConnection

## Context Links
- [Current auth.ts](../../../packages/server/src/auth.ts) — static keys.json, validateApiKey()
- [tunnel-manager.ts](../../../packages/server/src/tunnel-manager.ts) — TunnelConnection w/ raw apiKey
- [ws-handler.ts](../../../packages/server/src/ws-handler.ts) — calls validateApiKey(msg.key)
- [server.ts](../../../packages/server/src/server.ts) — loadApiKeys/watchApiKeys startup

## Overview
- **Priority:** P1 (foundation for all subsequent phases)
- **Status:** pending
- Install mongoose, create connection manager, define User/ApiKey models, implement KeyStore interface with MongoKeyStore + JsonFileKeyStore fallback, enhance TunnelConnection with apiKeyHash/userId.

## Key Insights
- Auth happens 1x per WS connection; ~3ms MongoDB query acceptable, no cache needed
- TunnelConnection currently stores raw apiKey string — security risk, replace with apiKeyHash
- Factory pattern: MONGO_URI env -> MongoKeyStore, else -> JsonFileKeyStore (dev mode)
- Need countByKeyHash/countByUserId on TunnelManager for limit enforcement in Phase 2

## Requirements

### Functional
- F1: MongoDB connection manager with connect/disconnect/health check
- F2: Mongoose User model (email, passwordHash, limits, status, plan, timestamps)
- F3: Mongoose ApiKey model (userId, keyHash, keyPrefix, label, status, expiresAt, lastUsedAt)
- F4: KeyStore interface: validate(keyHash) -> KeyInfo | null
- F5: MongoKeyStore implementation querying ApiKey + User
- F6: JsonFileKeyStore wrapping current auth.ts logic
- F7: TunnelConnection stores apiKeyHash + userId + keyId instead of raw apiKey
- F8: TunnelManager gains countByKeyHash(), countByUserId(), disconnectByKeyHash()
- F9: Migration script: keys.json -> MongoDB

### Non-Functional
- NF1: All Mongoose reads use .lean() for performance
- NF2: Indexes on keyHash (unique), userId, expiresAt (TTL)
- NF3: Graceful handling of MongoDB down (reject auth, existing tunnels continue)
- NF4: Max 200 lines per file

## Architecture

```
KeyStore (interface)
  ├── MongoKeyStore (mongoose queries)
  └── JsonFileKeyStore (file-based, dev fallback)

createKeyStore(config) -> KeyStore  // factory

server.ts: keyStore.initialize() on startup
           keyStore.shutdown() on SIGTERM
ws-handler.ts: keyStore.validate(hash) -> KeyInfo
```

## Related Code Files

### CREATE
| File | Purpose |
|------|---------|
| `packages/server/src/db/connection-manager.ts` | MongoDB connect/disconnect/health |
| `packages/server/src/db/models/user-model.ts` | User mongoose model |
| `packages/server/src/db/models/api-key-model.ts` | ApiKey mongoose model |
| `packages/server/src/key-store/key-store-types.ts` | KeyStore interface + KeyInfo type |
| `packages/server/src/key-store/mongo-key-store.ts` | MongoKeyStore implementation |
| `packages/server/src/key-store/json-file-key-store.ts` | JsonFileKeyStore (wraps old auth) |
| `packages/server/src/key-store/create-key-store.ts` | Factory function |
| `packages/server/src/scripts/migrate-keys.ts` | keys.json -> MongoDB migration |

### MODIFY
| File | Changes |
|------|---------|
| `packages/server/src/server.ts` | Replace loadApiKeys/watchApiKeys with createKeyStore(), pass to attachWsHandler |
| `packages/server/src/ws-handler.ts` | Accept KeyStore param, async validate, pass keyHash+userId to register |
| `packages/server/src/tunnel-manager.ts` | TunnelConnection: apiKeyHash+userId; add countByKeyHash/countByUserId/disconnectByKeyHash |
| `packages/server/package.json` | Add mongoose dependency |

### DELETE
| File | Reason |
|------|--------|
| `packages/server/src/auth.ts` | Replaced by KeyStore abstraction |

## Implementation Steps

### 1. Install mongoose
```bash
cd packages/server && pnpm add mongoose
```

### 2. Create connection manager (`db/connection-manager.ts`)
- `connectDb(uri: string): Promise<void>` — mongoose.connect with retry logic
- `disconnectDb(): Promise<void>` — mongoose.disconnect
- `isDbHealthy(): boolean` — check mongoose.connection.readyState
- Use pino logger, handle connection events (error, disconnected)

### 3. Create User model (`db/models/user-model.ts`)
```typescript
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  totpSecret: { type: String, default: null },  // TOTP secret for Google Authenticator
  totpVerified: { type: Boolean, default: false },  // true after first successful TOTP verify
  limits: {
    maxKeys: { type: Number, default: 5 },
    maxTunnelsPerKey: { type: Number, default: 3 },
    maxRequestsPerDay: { type: Number, default: 10000 },
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  plan: { type: String, default: 'free' },
}, { timestamps: true });
```

### 4. Create ApiKey model (`db/models/api-key-model.ts`)
```typescript
const apiKeySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  keyHash: { type: String, required: true, unique: true, index: true },
  keyPrefix: { type: String, required: true },
  label: { type: String, default: 'Default' },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  expiresAt: { type: Date, default: null, index: { expireAfterSeconds: 0 } },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
```

### 5. Create KeyStore types (`key-store/key-store-types.ts`)
- Export `KeyInfo` interface: userId, keyId, keyHash, maxTunnels, plan, role
- Export `KeyStore` interface: validate, recordUsage, initialize, shutdown

### 6. Implement MongoKeyStore (`key-store/mongo-key-store.ts`)
- `validate(keyHash)`: find ApiKey by keyHash+status:'active', populate/join user, check user.status='active', check !expiresAt or expiresAt > now, update lastUsedAt (fire-and-forget), return KeyInfo
- `recordUsage(keyHash)`: no-op in Phase 1 (placeholder for Phase 3)
- `initialize()`: call connectDb(uri)
- `shutdown()`: call disconnectDb()

### 7. Implement JsonFileKeyStore (`key-store/json-file-key-store.ts`)
- Wraps current loadApiKeys logic
- validate returns KeyInfo with dummy userId/keyId (for dev)
- initialize/shutdown: no-op

### 8. Create factory (`key-store/create-key-store.ts`)
- `createKeyStore(): KeyStore` — MONGO_URI set? MongoKeyStore : JsonFileKeyStore

### 9. Enhance TunnelConnection (`tunnel-manager.ts`)
- Replace `apiKey: string` with `apiKeyHash: string` + `userId: string` + `keyId: string`
- Update `register()` signature: accept apiKeyHash, userId, keyId instead of apiKey
- Add `countByKeyHash(keyHash: string): number`
- Add `countByUserId(userId: string): number`
- Add `disconnectByKeyHash(keyHash: string): void` — close sockets + unregister

### 10. Update ws-handler.ts
- `attachWsHandler(server, keyStore)` — accept KeyStore param
- `handleAuth`: hash msg.key, call `await keyStore.validate(hash)`, get KeyInfo
- Pass keyInfo.keyHash + keyInfo.userId + keyInfo.keyId to tunnelManager.register()
- handleRegisterTunnel: get userId/keyHash from existing tunnel

### 11. Update server.ts
- Replace loadApiKeys/watchApiKeys with createKeyStore()
- Call keyStore.initialize() before server.listen
- Call keyStore.shutdown() in shutdown handler
- Pass keyStore to attachWsHandler(server, keyStore)

### 12. Delete auth.ts

### 13. Migration script (`scripts/migrate-keys.ts`)
- Read keys.json, create default User, create ApiKey docs with hashed keys
- One-time run: `pnpm tsx packages/server/src/scripts/migrate-keys.ts`

### 14. Tests
- Unit: MongoKeyStore.validate() with mongodb-memory-server
- Unit: JsonFileKeyStore backward compat
- Unit: TunnelManager.countByKeyHash/disconnectByKeyHash
- Integration: ws-handler auth flow with MongoKeyStore

## Todo List
- [x] Install mongoose
- [x] Create connection-manager.ts
- [x] Create user-model.ts
- [x] Create api-key-model.ts
- [x] Create key-store-types.ts
- [x] Create mongo-key-store.ts
- [x] Create json-file-key-store.ts
- [x] Create create-key-store.ts
- [x] Enhance TunnelConnection in tunnel-manager.ts
- [x] Update ws-handler.ts (async validate, KeyStore param)
- [x] Update server.ts (createKeyStore lifecycle)
- [x] Delete auth.ts
- [x] Create migration script
- [x] Write tests
- [x] Run biome lint + fix

## Success Criteria
- `MONGO_URI` set -> server connects to MongoDB, validates keys via MongoKeyStore
- `MONGO_URI` unset -> server falls back to JsonFileKeyStore (dev mode)
- WS auth works end-to-end with MongoDB-backed validation
- TunnelConnection stores apiKeyHash+userId+keyId, never raw key
- All existing tests pass, new tests cover KeyStore + TunnelManager changes
- Biome lint clean

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| MongoDB connection failure on startup | Retry with backoff; log error, reject auth until connected |
| Mongoose .lean() forgotten | Code review checklist; grep for `.find(` without `.lean()` |
| Breaking WS auth flow | JsonFileKeyStore fallback ensures dev mode works without MongoDB |

## Security Considerations
- API keys stored as SHA-256 hashes only (already done, preserved)
- Raw API key never stored in TunnelConnection (apiKeyHash replaces apiKey)
- MongoDB credentials via env var MONGO_URI, never committed
- User passwords hashed with bcrypt (model stores passwordHash, actual hashing in Phase 2)

## Next Steps
- Phase 2 builds Express routes on top of KeyStore + models
- Phase 2 implements bcrypt password hashing for User signup/login
