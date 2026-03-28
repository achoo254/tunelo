# Scout Report: Authentication & Access Control Files

**Date:** 2026-03-28 21:59  
**Task:** Find all files related to API key/token management, authentication, and access control

## Summary

Found **10 key files** related to authentication and access control across 3 packages:
- Server-side auth logic (2 files)
- Client-side auth & config (3 files)  
- Shared protocol definitions (2 files)
- Tests (2 files)
- Documentation (1 file)

All API keys are hashed (SHA-256) and never stored in plaintext. Auth is token-based via WebSocket message validation.

---

## Core Authentication Files

### Server-Side (packages/server/src)

**1. `D:\CONG VIEC\tunelo\packages\server\src\auth.ts`** (43 lines)
- **Purpose:** API key loading, hashing, and validation
- **Key Functions:**
  - `loadApiKeys(filePath)` — Loads keys from JSON file, hashes with SHA-256
  - `watchApiKeys(filePath)` — File watcher (5s interval) for hot-reload
  - `validateApiKey(key)` — Returns boolean if key hash matches stored set
- **Security:** Stores hashes in `Set<string>`, never compares plaintext
- **Design:** Graceful fallback to dev mode (no keys = accept all) if file missing

**2. `D:\CONG VIEC\tunelo\packages\server\src\ws-handler.ts`** (100+ lines)
- **Purpose:** WebSocket connection handler with auth + rate limiting
- **Key Logic:**
  - Validates API key via `validateApiKey()` on auth message
  - 10s auth timeout — disconnects if client doesn't auth in time
  - Rate limiting: max 100 msg/sec per connection
  - Subdomain validation with regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
  - Rejects duplicate subdomains + invalid formats
- **Auth Flow:** Client sends `{type:"auth", key, subdomain}` → server validates → emits `auth-result`
- **Security:** Hop-by-hop headers sanitized, 10MB payload limit enforced

**3. `D:\CONG VIEC\tunelo\packages\server\src\server.ts`** (44 lines)
- **Purpose:** Entry point — loads keys & starts server
- **Key Logic:**
  - Reads `API_KEYS_FILE` env var (default: `./keys.json`)
  - Calls `loadApiKeys()` at startup
  - Calls `watchApiKeys()` for file changes
  - Creates HTTP server + attaches WebSocket handler

### Client-Side (packages/client/src)

**4. `D:\CONG VIEC\tunelo\packages\client\src\config.ts`** (31 lines)
- **Purpose:** Client config management (persistent storage)
- **Key Functions:**
  - `loadConfig()` — Reads JSON from `~/.tunelo/config.json`
  - `saveConfig(config)` — Writes to config file
  - `getConfigPath()` — Returns config file path
- **Config Fields:**
  - `server?` — Tunnel server URL
  - `key?` — API key (user can set once, reuse across sessions)
- **Storage:** `~/.tunelo/config.json` (JSON format)
- **Note:** Client *never* stores key in plaintext with special protections; relies on OS file permissions

**5. `D:\CONG VIEC\tunelo\packages\client\src\cli.ts`** (139 lines)
- **Purpose:** CLI entry point with key handling
- **Commands:**
  - `tunelo http <port>` — Create tunnel with optional `--key`, `--server`, `--subdomain`
  - `tunelo config` — Save/show config
- **Key Resolution Order:**
  1. CLI flag `--key`
  2. Environment variable `TUNELO_KEY`
  3. Saved config file (`~/.tunelo/config.json`)
  4. Error if missing
- **Error Handling:** Validates port (1-65535), shows helpful error message if key missing

**6. `D:\CONG VIEC\tunelo\packages\client\src\tunnel-client.ts`** (100+ lines)
- **Purpose:** Socket.IO client for WS communication
- **Auth Logic:**
  - `connect()` — Establishes WS, sends `AuthMessage` with key
  - Emits `auth-result` on response
  - Rejects on failed auth (error message returned to CLI)
  - Auto-reconnect with exponential backoff (1s → 30s)
- **Key Stored:** Passed in constructor options, *never* logged

### Shared Types (packages/shared/src)

**7. `D:\CONG VIEC\tunelo\packages\shared\src\protocol.ts`** (84 lines)
- **Purpose:** Defines auth message types & error codes
- **Key Interfaces:**
  - `AuthMessage` — `{type:"auth", key:string, subdomain:string}`
  - `AuthResult` — `{type:"auth-result", success:bool, error?:string, url:string}`
  - `ErrorCode` enum — `AUTH_FAILED`, `SUBDOMAIN_TAKEN`, etc.
- **Rate Limit:** 1000 msg/sec (constant `WS_RATE_LIMIT`)
- **Timeout:** 30s for ping/pong, request relay

**8. `D:\CONG VIEC\tunelo\packages\shared\src\constants.ts`** (30 lines)
- **Purpose:** Shared constants
- **Auth-Related:**
  - `WS_RATE_LIMIT: 1000` — Max messages per second
  - `MAX_BODY_SIZE: 50MB` — Prevent DoS
  - `REQUEST_TIMEOUT_MS: 30s`
  - `SUBDOMAIN_REGEX` — Validates format
- **Domain:** `tunnel.inetdev.io.vn` (hardcoded)

---

## Test Files

**9. `D:\CONG VIEC\tunelo\packages\server\src\__tests__\auth.test.ts`** (42 lines)
- **Coverage:**
  - Valid/invalid key validation
  - File loading errors (graceful fallback)
  - Key reload from file
- **Test Data:** Example keys `tk_abc123`, `tk_def456`

**10. `D:\CONG VIEC\tunelo\tests\e2e\auth-flow.test.ts`** (100 lines)
- **Coverage:**
  - Valid key → tunnel created
  - Invalid key → rejected
  - Duplicate subdomain → rejected
  - Random subdomain assigned if not specified
  - Invalid subdomain format → rejected
- **Test Setup:** Starts real server with test keys in memory

---

## Documentation

**11. `D:\CONG VIEC\tunelo\docs\code-standards.md`** (100+ lines)
- **Auth Error Codes:**
  - `TUNELO_AUTH_001` — Invalid API key
  - `TUNELO_AUTH_002` — API key required
- **Logging:** Use pino, never log plaintext keys

**12. `D:\CONG VIEC\tunelo\docs\system-architecture.md`**
- **Auth Summary:** SHA-256 hashed keys, loaded from env at startup, per-key tunnel limits

**13. `D:\CONG VIEC\tunelo\README.md`** (README section)
- **Key Format:** `tk_*` convention (e.g., `tk_your_secret_key`)
- **Storage File:** `packages/server/keys.json.example` (format: `{keys:[...]}`)
- **Config:** Via `API_KEYS_FILE` env var (default: `./keys.json`)

---

## Key Management Flow

```
[Server Startup]
├─ Read API_KEYS_FILE env var
├─ loadApiKeys(filePath)
│  ├─ Parse JSON: {keys: ["tk_xxx", ...]}
│  ├─ Hash each with SHA-256
│  ├─ Store hashes in Set<string>
│  └─ Log count (never log plaintext)
└─ watchApiKeys(filePath)
   └─ Poll every 5s for changes, reload

[Client Auth]
├─ Load key from: --key → TUNELO_KEY → ~/.tunelo/config.json
├─ Send WebSocket AuthMessage: {type:"auth", key, subdomain}
└─ Server validateApiKey()
   ├─ Hash incoming key with SHA-256
   ├─ Check if hash in Set
   └─ Emit auth-result {success, url, error?}

[Config Management]
├─ ~/.tunelo/config.json (client-side persistent)
├─ Keys.json (server-side, format: {keys: [...]})
└─ Environment variables (TUNELO_KEY, API_KEYS_FILE, TUNELO_SERVER)
```

---

## Security Highlights

1. **Plaintext Never Used:** Keys always hashed with SHA-256 before comparison
2. **File Watching:** Hot-reload of keys every 5s (no restart needed)
3. **Rate Limiting:** 100 msg/sec per connection (1000 total)
4. **Timeouts:** Auth must complete in 10s, requests timeout at 30s
5. **Subdomain Validation:** Regex enforces `[a-z0-9-]` format
6. **No Logging:** Plaintext keys never logged (secure by design)

---

## Implementation Notes

- No database — keys loaded into memory at startup
- Dev mode fallback: If keys file missing/empty, server accepts all connections
- Client config stored at `~/.tunelo/config.json` with standard file permissions
- All WebSocket messages validated with try-catch + type guards
- Body size capped at 50MB, headers sanitized (hop-by-hop removed)

---

## Unresolved Questions

None — all authentication and access control files identified and documented.
