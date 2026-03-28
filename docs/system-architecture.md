# System Architecture

## Overview

Tunelo is a WebSocket relay tunnel proxy. It exposes local services via public HTTPS wildcard subdomains.

```
                    INTERNET
                       |
            +----------+----------+
            |   nginx (port 443)  |
            |  - TLS termination  |
            |  - Wildcard cert    |
            |  - Subdomain route  |
            +----------+----------+
                       | HTTP (port 3001)
            +----------+----------+
            |   Tunnel Server     |
            |   (Node.js)         |
            |  - WS connections   |
            |  - Request relay    |
            |  - Subdomain mgmt  |
            |  - API key auth     |
            +----------+----------+
                       | WebSocket (persistent, outbound from client)
            +----------+----------+
            |   Tunnel Client     |
            |   (CLI tool)        |
            |  - Connect to server|
            |  - Receive requests |
            |  - Proxy to local   |
            +----------+----------+
                       | HTTP proxy
            +----------+----------+
            |   Local Service     |
            |   localhost:PORT    |
            +---------------------+
```

## Components

### 1. nginx (Reverse Proxy)

- Terminates TLS with Let's Encrypt wildcard cert (`*.tunnel.inetdev.io.vn`)
- Routes requests based on `Host` header subdomain
- Proxies to tunnel server on localhost:3001
- Handles WebSocket upgrade (`Upgrade: websocket`)

### 2. Tunnel Server (`packages/server`)

HTTP + WebSocket server running on port 3001 (behind nginx).

**Modules:**

| Module | Responsibility |
|--------|---------------|
| `server.ts` | Bootstrap HTTP + WS server, health endpoint |
| `tunnel-manager.ts` | Map<subdomain, TunnelInfo>, register/unregister/lookup |
| `ws-handler.ts` | Accept WS connections, validate API key, register tunnel |
| `request-relay.ts` | Serialize HTTP req to WS message, await response, send back |
| `auth.ts` | Load API key hashes from env, validate incoming keys |

**State:** In-memory `Map<string, TunnelInfo>` — no database needed.

```typescript
interface TunnelInfo {
  ws: WebSocket;
  apiKeyHash: string;
  subdomain: string;
  connectedAt: Date;
  requestCount: number;
}
```

### 3. Tunnel Client (`packages/client`)

CLI tool distributed via npm. Connects to server via WebSocket.

**Modules:**

| Module | Responsibility |
|--------|---------------|
| `cli.ts` | Parse args with commander |
| `tunnel-client.ts` | WS connection, message handling, auto-reconnect |
| `local-proxy.ts` | Proxy requests to localhost:PORT |
| `display.ts` | Terminal UI with chalk — status bar, request log |

### 4. Shared Package (`packages/shared`)

Types and constants shared between server and client.

| Module | Contents |
|--------|----------|
| `protocol.ts` | WS message types (discriminated unions) |
| `constants.ts` | Defaults, limits, regex patterns |
| `errors.ts` | TuneloError class, error codes |

## Request Flow

1. User runs: `tunelo http 3000 --subdomain myapp`
2. Client connects WS to `wss://tunnel.inetdev.io.vn/tunnel?key=xxx&subdomain=myapp`
3. Server validates API key (SHA-256 hash match), registers subdomain `myapp`
4. Browser hits `https://myapp.tunnel.inetdev.io.vn/api/data`
5. nginx terminates TLS, extracts subdomain from Host header, proxies to server:3001
6. Server looks up `myapp` in TunnelManager Map
7. Server serializes HTTP request as JSON, sends via WS to client
8. Client receives message, makes `http.request` to `localhost:3000/api/data`
9. Local service responds
10. Client serializes response, sends back via WS
11. Server sends HTTP response to browser

## WebSocket Protocol

All messages are JSON with discriminated union on `type` field.

### Server to Client

```typescript
// Incoming HTTP request
{ type: 'request', id: string, method: string, path: string, headers: Record<string, string>, body: string | null }

// Ping (keepalive)
{ type: 'ping' }
```

### Client to Server

```typescript
// HTTP response
{ type: 'response', id: string, status: number, headers: Record<string, string>, body: string | null }

// Pong (keepalive)
{ type: 'pong' }
```

### Server to Client (control)

```typescript
// Auth success
{ type: 'auth_ok', subdomain: string, url: string }

// Error
{ type: 'error', code: string, message: string }
```

## Infrastructure

| Component | Details |
|-----------|---------|
| VPS | 2-4 vCPU, 4-8GB RAM, Ubuntu |
| nginx | TLS termination, wildcard routing |
| Let's Encrypt | Wildcard cert via DNS-01 challenge |
| DNS | `*.tunnel.inetdev.io.vn` A record to VPS IP |
| PM2 | Process manager for tunnel server |
| Node.js | v20+ (ESM support) |

## Implementation Details (MVP Complete)

### State Management
- **In-memory Map:** `Map<subdomain, TunnelConnection>` for fast O(1) lookup
- **Per-tunnel pending requests:** UUID-based pairing for request/response correlation
- **No persistence:** Tunnels cleared on server restart (acceptable for MVP)

### Protocol Implementation
- **Message format:** JSON with discriminated union on `type` field
- **Request serialization:** Method, path, headers (sanitized), body (base64)
- **Response deserialization:** Status, headers, body (base64)
- **Keepalive:** Ping/pong every 30s to detect dead connections
- **Timeouts:** 30s for HTTP relay, configurable for WS reconnect

### Rate Limiting & Backpressure
- Per-connection message rate: 100 msg/sec (drop if exceeded)
- Per-key tunnels: Configurable max (10 in MVP)
- Body size limit: 10 MB
- Header size: No explicit limit (nginx default ~4-8KB)

### Error Handling
- **Structured errors:** `TuneloError` class with code + message + HTTP status
- **Automatic error propagation:** Via `ErrorMessage` WS type
- **Client auto-reconnect:** Exponential backoff with max attempts
- **Request timeout:** Reject after 30s if no response

### Security Implementation
- **API key auth:** SHA-256 hashed keys loaded from env at startup
- **No plaintext storage:** Keys never logged or cached plaintext
- **Header sanitization:** Strip hop-by-hop headers (Connection, TE, Upgrade, etc.)
- **Subdomain validation:** RFC 1123 compliant regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
- **Input validation:** JSON schema type guards on all WS messages

## Scaling Path

- **Phase 1 (MVP — Complete):** Single VPS, in-memory state, ~5-10k concurrent, 19/19 tests passing
- **Phase 2:** Add Redis for state sharing, second server behind nginx LB, ~20k concurrent
- **Phase 3:** Horizontal scaling, connection migration, 100k+ concurrent
