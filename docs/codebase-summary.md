# Tunelo Codebase Summary

**Status:** v0.3.1 (2026-03-29) | Device Code Auth Flow | MongoDB User & Key Management | Tests: 19/19 passing

## Project Structure

```
tunelo/
├── packages/
│   ├── shared/           # Protocol types, error codes, constants
│   ├── server/           # Tunnel server (Express + WS + MongoDB)
│   ├── client/           # CLI tool + Client Portal SPA (npm: tunelo)
│   ├── dashboard/        # Admin Dashboard SPA (planned v0.3)
│   └── infra/            # nginx, certbot, PM2 configs
├── tests/                # E2E test suite
├── docs/                 # Documentation
└── plans/                # Implementation plans & reports
```

## Shared Package (`packages/shared`)

**Purpose:** Type definitions and constants shared between server and client.

### Key Files

| File | Purpose |
|------|---------|
| `protocol.ts` | WS message types (discriminated unions) |
| `constants.ts` | Defaults, limits, regex patterns |
| `errors.ts` | TuneloError class, error codes |

### Protocol Types

Discriminated union pattern on `type` field:

**Server to Client:**
- `TunnelRequest` — HTTP request to relay (method, path, headers, body, id)
- `PingMessage` — Keepalive heartbeat

**Client to Server:**
- `TunnelResponse` — HTTP response from local service (status, headers, body, id)
- `AuthMessage` — Initial auth with API key + subdomain
- `PongMessage` — Keepalive response
- `ErrorMessage` — Error with code + message

### Error Codes

Format: `TUNELO_{DOMAIN}_{NUMBER}`

| Domain | Prefix | Range | Examples |
|--------|--------|-------|----------|
| Auth | `AUTH_` | 001-099 | `AUTH_001` Invalid key |
| Tunnel | `TUNNEL_` | 001-099 | `TUNNEL_001` Subdomain in use |
| Relay | `RELAY_` | 001-099 | `RELAY_001` Request timeout |
| Server | `SERVER_` | 001-099 | `SERVER_001` Startup failed |
| Client | `CLIENT_` | 001-099 | `CLIENT_001` Connection failed |

## Server Package (`packages/server`) — v0.3 Complete Implementation

**Purpose:** Express.js + MongoDB + WebSocket server for authentication, user management, and tunnel relay.

### New Modules (v0.3 — Implemented)

#### Database Models
| Module | Purpose |
|--------|---------|
| `db/models/user-model.ts` | Mongoose User schema (email, passwordHash, role, TOTP secret/verified) |
| `db/models/api-key-model.ts` | Mongoose ApiKey schema (userId, keyHash, keyPrefix, label, expiry, status) |
| `db/models/device-code-model.ts` | Mongoose DeviceCode schema (deviceCode, userCode, approval status, API key storage, 5min TTL) |
| `db/models/usage-log-model.ts` | Mongoose UsageLog schema (daily request/bandwidth tracking per key) |
| `db/connection-manager.ts` | MongoDB connection + lifecycle (initialize, shutdown) |

#### Services
| Module | Purpose |
|--------|---------|
| `services/totp-service.ts` | Generate/verify TOTP secrets (otplib), QR code generation |
| `services/auth-service.ts` | User registration, password validation (bcrypt), TOTP verification |
| `services/device-auth-service.ts` | Create device codes, poll approval status, approve & generate keys (atomic ops) |
| `services/key-service.ts` | Generate/validate/revoke API keys (SHA-256 hashing) |
| `services/admin-service.ts` | Admin operations (list users, tunnels, stats, bulk key operations) |
| `services/usage-tracker.ts` | Log requests per key, aggregate daily snapshots |

#### API Routes
| Module | Purpose |
|--------|---------|
| `api/auth-routes.ts` | POST /signup, /login, /verify-totp, /refresh, /logout |
| `api/device-auth-routes.ts` | POST /device (create), /device/poll (CLI), /device/approve (Portal) |
| `api/profile-routes.ts` | GET /profile, PATCH /profile (email, password update) |
| `api/key-routes.ts` | GET /keys, POST /keys, DELETE /keys/:id, PATCH /keys/:id |
| `api/usage-routes.ts` | GET /usage (daily summary), /usage/detailed (per-key breakdown) |
| `api/admin-routes.ts` | GET /users, /users/:id, /tunnels, /stats, /keys, PATCH /users/:id |
| `api/create-api-router.ts` | Express router factory with middleware stack |

#### Middleware
| Module | Purpose |
|--------|---------|
| `api/middleware/cookie-auth.ts` | JWT extraction + verification from httpOnly cookies |
| `api/middleware/admin-guard.ts` | Enforce admin role (403 if user) |
| `api/middleware/csrf-protection.ts` | CSRF token validation (double-submit pattern) |
| `api/middleware/rate-limiter.ts` | Per-IP rate limiting with configurable limits |
| `api/middleware/validate-body.ts` | Zod schema validation with structured error responses |
| `api/middleware/error-handler.ts` | Centralized error handler (TuneloError → JSON) |

#### Validation Schemas
| Module | Purpose |
|--------|---------|
| `api/schemas/auth-schemas.ts` | Zod schemas for signup, login, verify-totp, refresh |
| `api/schemas/device-auth-schemas.ts` | Zod schemas for device code poll (deviceCode) and approve (userCode) |
| `api/schemas/key-schemas.ts` | Zod schemas for key creation (label, optional expiry) |
| `api/schemas/usage-schemas.ts` | Zod schemas for usage queries (date range, key filters) |
| `api/schemas/admin-schemas.ts` | Zod schemas for admin operations (user updates, bulk actions) |

#### Key Store (Pluggable)
| Module | Purpose |
|--------|---------|
| `key-store/key-store-types.ts` | KeyStore interface (injectable: validate, store, revoke) |
| `key-store/mongo-key-store.ts` | MongoDB implementation (queries ApiKey collection) |
| `key-store/json-file-key-store.ts` | JSON file implementation (legacy, backward compat) |
| `key-store/create-key-store.ts` | Factory: selects Mongo or JSON based on TUNELO_KEY_STORE env |

#### Rate Limiting (Pluggable)
| Module | Purpose |
|--------|---------|
| `rate-limit/rate-limit-store.ts` | RateLimitStore interface |
| `rate-limit/memory-rate-limit-store.ts` | In-memory store (suitable for single-server MVP) |

#### Utilities
| Module | Purpose |
|--------|---------|
| `tunnel-auth-checker.ts` | Validates API key during WS auth (uses KeyStore) |
| `scripts/migrate-keys.ts` | CLI tool: migrate keys from env → MongoDB |
| `logger.ts` | Pino logger factory with request-level context |

### Existing Modules (v0.1 Unchanged)

| Module | Purpose |
|--------|---------|
| `tunnel-manager.ts` | In-memory Map<subdomain, TunnelConnection> |
| `ws-handler.ts` | WebSocket lifecycle (auth, register, relay, cleanup) |
| `request-relay.ts` | HTTP request serialization + WS relay |

## Server Package (`packages/server`) — v0.1 Architecture

### Architecture

```
HTTP Request (from nginx)
       ↓
 [request-relay.ts] — Lookup tunnel, serialize request
       ↓
 [ws-handler.ts] — Send via WS to client
       ↓
 [tunnel-manager.ts] — Wait for response with timeout
       ↓
 HTTP Response back to client
```

### Key Modules

#### `server.ts`
- Bootstrap HTTP + WS server on port 3001
- Health check endpoint (`GET /health`)
- Message routing based on path (`/tunnel` for WS)

#### `tunnel-manager.ts`
**In-memory tunnel registry:** `Map<subdomain, TunnelConnection>`

```typescript
interface TunnelConnection {
  ws: WebSocket;
  apiKey: string;
  subdomain: string;
  connectedAt: Date;
  pendingRequests: Map<string, PendingRequest>;
}
```

Methods:
- `register(subdomain, ws, apiKey)` — Add tunnel, reject if exists
- `unregister(subdomain)` — Remove tunnel, reject pending requests
- `get(subdomain)` / `has(subdomain)` — Lookup
- `sendRequest(subdomain, request)` — Send request, await response with timeout

#### `ws-handler.ts`
Handles WebSocket lifecycle:

1. **Connection:** Accept WS upgrade
2. **Auth:** First message must be `AuthMessage` with valid API key
3. **Register:** Validate subdomain, add to TunnelManager
4. **Relay:** Handle incoming requests, send responses
5. **Cleanup:** Unregister on disconnect

**Rate Limiting:** Drop connection if >100 messages/sec

#### `request-relay.ts`
Serialize HTTP request → WS message:

1. Extract subdomain from `Host` header (via nginx X-Subdomain)
2. Look up tunnel in manager
3. Serialize request (method, path, headers, body)
4. Send as `TunnelRequest` with UUID id
5. Wait for `TunnelResponse` (30s timeout)
6. Send HTTP response back to client

**Security:**
- Strip hop-by-hop headers
- Set X-Forwarded-* headers
- Validate body size (<10MB)
- Sanitize subdomain with regex

#### `auth.ts`
API key validation:

1. Load hashes from `TUNELO_API_KEYS` env var (comma-separated)
2. Validate incoming key by SHA-256 hash comparison
3. Return `true` if match, `false` otherwise

**No plaintext storage:** Keys stored only as hashes in memory.

### Tests (Unit)

File: `packages/server/src/__tests__/`

- `auth.test.ts` (4 tests) — Hash validation, env loading
- `request-relay.test.ts` (5 tests) — Request serialization, error handling

## Client Package (`packages/client`)

**Purpose:** CLI tool for end users to create tunnels.

### Key Modules

#### `cli.ts`
Commander.js CLI interface:

```bash
tunelo http <port> [options]
  --subdomain <name>      Request specific subdomain
  --key <apikey>          API key (override config/env)
  --server <url>          Server URL (override config)
  --help, -h              Show help
  --version, -v           Show version
```

**Initialization:**
1. Parse arguments
2. Load config from `~/.tunelo/config.json`
3. Check env vars (`TUNELO_KEY`, `TUNELO_SERVER`)
4. Validate port number
5. Create TunnelClient instance
6. Listen for events (connected, disconnected, request)

#### `tunnel-client.ts`
WebSocket client with auto-reconnect:

**Connection Flow:**
1. Connect to server via WS
2. Send `AuthMessage` with API key + subdomain
3. Receive `AuthResult` (success/error)
4. Listen for `TunnelRequest` messages
5. Proxy to local service
6. Send `TunnelResponse` back

**Auto-reconnect:** Exponential backoff, configurable max attempts

**Keepalive:** Send ping/pong every 30s to detect dead connections

#### `local-proxy.ts`
HTTP proxy to localhost:

1. Receive `TunnelRequest` from WS
2. Make HTTP request to `http://localhost:{port}{path}`
3. Capture response (status, headers, body)
4. Send `TunnelResponse` back via WS

**Limits:**
- Max body size: 10 MB
- Request timeout: 30s
- Handle all HTTP methods (GET, POST, PUT, DELETE, PATCH, etc.)

#### `config.ts`
Config file management:

**Location:** `~/.tunelo/config.json`

```json
{
  "server": "wss://tunnel.inetdev.io.vn",
  "key": "tk_..."
}
```

**Priority:** CLI flags > env vars > config file

#### `display.ts`
Terminal UI with chalk:

**Output:**
```
┌─────────────────────────────────────┐
│ tunelo                      v0.1.0   │
│ Status: Online                      │
│ Tunnel: https://app.tunnel.io.vn    │
│ Forwarding: http://localhost:3000   │
├─────────────────────────────────────┤
│ GET  /api/users     200   12ms      │
│ POST /api/login     200   45ms      │
└─────────────────────────────────────┘
```

**Colors:**
- 2xx responses: Green
- 3xx responses: Cyan
- 4xx responses: Yellow
- 5xx responses: Red
- Status connecting/online: Green/yellow/red

### Tests (E2E)

File: `tests/e2e/`

- `auth-flow.test.ts` (5 tests) — Auth success/failure, invalid keys
- `tunnel-flow.test.ts` (5 tests) — Request/response relay, timeouts

## Dashboard Package (`packages/dashboard`) — v0.3 Planned/Built

**Purpose:** React + Vite admin dashboard for user/tunnel/usage management (served at `/dashboard/*`).

### Tech Stack
- React 18 + Vite + TypeScript
- Recharts for metrics visualization
- React Router for navigation
- Tailwind CSS for styling
- Axios/fetch wrapper for `/api/admin/*` endpoints

### Key Pages (Planned)
- **Users:** Table of all users (email, role, status, created date), actions (view details, suspend/activate)
- **Tunnels:** Active tunnels per user (subdomain, connected time, request rate, bandwidth)
- **Stats:** Usage charts (daily requests, bandwidth), peak times, error rates
- **Keys:** All API keys across users (label, owner, usage, expiry), revoke actions

**Access:** Protected by admin role (ADMIN_EMAILS env var)

## Client Package (`packages/client`) — v0.3 Complete

### CLI (HTTP Tunnel)
| Module | Purpose |
|--------|---------|
| `cli.ts` | Commander.js CLI: parse args (http, tcp, config, auth commands) |
| `cli-device-auth.ts` | Device code auth: login/register/logout commands with browser flow |
| `tunnel-client.ts` | WebSocket client: connect, auth, message relay, auto-reconnect |
| `local-proxy.ts` | HTTP proxy to localhost:PORT, serialize req/resp |
| `display.ts` | Terminal UI (chalk): status bar, request log, colors |
| `portal-server.ts` | Embedded Node.js server for Portal SPA at :4041 |

### CLI (TCP Tunnel)
| Module | Purpose |
|--------|---------|
| `cli-tcp-command.ts` | TCP tunnel mode implementation |
| `tcp-proxy.ts` | TCP proxy to localhost:PORT |
| `tcp-ws-handler.ts` | TCP ↔ WS message framing (binary compatibility) |
| `tcp-port-manager.ts` | Manage allocated ports for multiple tunnels |

### Portal SPA (v0.3+ — Complete)
**Embedded React app served by client at `http://localhost:4041`**

| Module | Purpose |
|--------|---------|
| `portal/app.tsx` | React SPA: routing, auth context, session management |
| `portal/pages/signup-page.tsx` | Email/password registration + TOTP setup |
| `portal/pages/login-page.tsx` | Email/password login + TOTP verification |
| `portal/pages/device-auth-page.tsx` | Device code confirmation (visual code match + approve button) |
| `portal/pages/keys-page.tsx` | List user's API keys, create (with label/expiry), revoke, copy |
| `portal/pages/usage-page.tsx` | Daily usage chart (requests/bandwidth per key, Recharts) |
| `portal/pages/profile-page.tsx` | View user profile, change password |
| `portal/components/totp-setup.tsx` | QR code display (qrcode.react), manual secret entry |
| `portal/components/key-create-modal.tsx` | Modal: create key with label and optional expiry |
| `portal/components/key-list.tsx` | Key table with copy/revoke actions |
| `portal/components/usage-chart.tsx` | Recharts line/bar charts for usage metrics |
| `portal/components/nav-bar.tsx` | Header with user email, logout button |
| `portal/hooks/use-auth.ts` | Auth context: login, signup, TOTP verify, token refresh |
| `portal/hooks/use-api.ts` | Fetch wrapper: auto-refresh token on 401, error handling |
| `portal/api/client.ts` | Typed API client for /api/* endpoints |

**How it works:**
1. User runs: `npx tunelo http 3000`
2. CLI starts portal server at `http://localhost:4041`
3. CLI prints: `Portal: http://localhost:4041` and opens in browser
4. User signs up → email → password → TOTP (scan QR) → generates API key
5. User copies key → returns to CLI → enters key → tunnel connects
6. Subsequent use: email → password → TOTP → manage keys/view usage

## Infrastructure (`infra/`)

### nginx Config

**Wildcard routing:**
```
Host: app.tunnel.io.vn → proxy to server:3001 with X-Subdomain: app
Host: tunnel.io.vn     → WS endpoint for /tunnel
```

**TLS:** Let's Encrypt wildcard cert (`*.tunnel.inetdev.io.vn`)

**Features:**
- HTTP → HTTPS redirect
- WebSocket upgrade (Upgrade header, Connection: upgrade)
- X-Forwarded-* headers for client IP tracking
- 86400s timeout for long-lived WS connections

### PM2 Config (`pm2.config.cjs`)

```javascript
{
  name: 'tunelo-server',
  script: 'packages/server/dist/server.js',
  instances: 1,
  env: {
    NODE_ENV: 'production',
    PORT: 3001,
    TUNELO_API_KEYS: '<sha256-hash>'
  }
}
```

### certbot Script

Wildcard certificate via DNS-01 challenge:
```bash
certbot certonly --manual --preferred-challenges dns \
  -d tunnel.inetdev.io.vn -d "*.tunnel.inetdev.io.vn"
```

Auto-renewal via cron (installed by certbot).

## Build & Test

### Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm build` | TypeScript compile (tsc) |
| `pnpm test` | Run vitest (unit + E2E) |
| `pnpm dev:server` | Dev server with tsx --watch |
| `pnpm dev:client` | Dev client |
| `pnpm lint` | Biome lint check |
| `pnpm lint:fix` | Auto-fix linting issues |

### Test Results (MVP Complete)

```
✓ packages/server/src/__tests__/auth.test.ts        (4 tests)
✓ packages/server/src/__tests__/request-relay.test.ts (5 tests)
✓ tests/e2e/auth-flow.test.ts                       (5 tests)
✓ tests/e2e/tunnel-flow.test.ts                     (5 tests)

Total: 19 tests, 100% pass rate, 327ms
```

## Key Design Decisions

### Discriminated Unions (Protocol)
Use `type` field to distinguish message types. Allows TypeScript to narrow types safely.

### In-Memory Tunnels
No database needed for MVP. `Map<subdomain, TunnelConnection>` handles registration. Suitable for 5-10k concurrent.

### SHA-256 API Keys
Store only hashes, never plaintext. Keys loaded from env var at startup.

### Request-Response Pairing
UUID-based request ID links request to response. Timeout after 30s if no response.

### WebSocket Rate Limiting
Drop connections exceeding 100 msg/sec to prevent DoS.

### Hop-by-Hop Header Stripping
Remove headers that don't apply to relay (Connection, TE, Upgrade, etc.).

### Exponential Backoff Reconnect
Client auto-reconnect with configurable max attempts. Prevents connection storms.

## Constraints & Limits (MVP)

| Limit | Value | Enforced By |
|-------|-------|-------------|
| Max body size | 10 MB | request-relay.ts |
| WS message rate | 100 msg/sec | ws-handler.ts |
| HTTP relay timeout | 30s | tunnel-manager.ts |
| WS ping interval | 30s | tunnel-client.ts |
| Max tunnels per key | 10 (configurable) | Can be added to ws-handler |
| Subdomain length | 1-63 chars | constants.ts regex |

## Security Summary

- **Auth:** SHA-256 hashed API keys from env
- **Validation:** JSON schema type guards, subdomain regex, body size limits
- **Secrets:** No plaintext keys in logs or memory
- **Headers:** Strip hop-by-hop, set X-Forwarded-*
- **Rate Limiting:** 100 msg/sec per connection
- **Timeouts:** 30s request relay, 30s WS ping

## Feature Progression

**v0.1 (Complete — 2026-03-28):**
✓ WebSocket relay + HTTP tunneling
✓ API key auth (SHA-256 hashed, env-based, from env var)
✓ Client CLI + chalk display
✓ 19 unit + E2E tests passing

**v0.3 (Complete — 2026-03-29):**
✓ MongoDB models (User, ApiKey, UsageLog)
✓ Express API (auth, keys, usage, admin endpoints)
✓ TOTP 2FA setup + verification (otplib, qrcode)
✓ Client Portal SPA (signup, login, key management, usage charts)
✓ JWT token management (24h access, 7d refresh, httpOnly cookies)
✓ Rate limiter interface + memory implementation
✓ Usage tracking + daily snapshot aggregation
✓ Admin Dashboard SPA (served at /dashboard/*)
✓ CSRF protection (double-submit pattern)
✓ Zod validation for all request bodies
✓ Pluggable KeyStore (MongoDB + JSON file)
✓ TCP tunneling support

**v0.3.1 (Complete — 2026-03-29):**
✓ Device Code Authorization Flow (browser-based, like gh auth)
✓ Atomic device code operations (prevent race conditions)
✓ 5-minute TTL with MongoDB TTL index
✓ CLI commands: login, register, logout
✓ Portal device approval page (visual code confirmation)

**v0.4+ (Planned):**
- WebSocket pass-through (tunnel WS traffic, not just HTTP)
- Binary streaming (replace base64 with binary frames)
- Standalone binary distribution (pkg/nexe)
- Request inspection/replay
- Custom domain support
- Multi-server scaling (Redis + load balancer)
