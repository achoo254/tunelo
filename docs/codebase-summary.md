# Tunelo MVP — Codebase Summary

**Status:** MVP Complete (2026-03-28) | Tests: 19/19 passing

## Project Structure

```
tunelo/
├── packages/
│   ├── shared/           # Protocol types, error codes, constants
│   ├── server/           # Tunnel server (HTTP + WebSocket)
│   ├── client/           # CLI tool (npm: tunelo)
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

## Server Package (`packages/server`)

**Purpose:** HTTP + WebSocket server for tunnel relay.

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

## Next Steps (v0.2+)

- WebSocket pass-through (tunnel WS traffic)
- Binary streaming (replace base64 with binary frames)
- Standalone binary distribution (pkg/nexe)
- Request inspection dashboard
- Per-key rate limiting
- Custom domain support
- Multi-server scaling (Redis + load balancer)
