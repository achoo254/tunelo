# System Architecture (v0.3)

## Overview

Tunelo is a multi-tenant tunnel proxy with user management, TOTP 2FA, and persistent storage.

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
            |   Express.js Server |
            |   (Tunnel Server v0.3) |
            |  ┌────────────────┐  |
            |  │ /api/*         │  │ Auth, keys, usage, admin
            |  │ /dashboard/*   │  │ Admin SPA (optional)
            |  │ /*             │  │ Tunnel relay (unchanged)
            |  └────────────────┘  |
            |  ┌────────────────┐  |
            |  │ Middleware     │  │ JWT auth, RBAC, CSRF
            |  │ Rate Limiter   │  │ Redis/memory/stub
            |  └────────────────┘  |
            |  ┌────────────────┐  |
            |  │ WebSocket      │  │ Tunnel registration
            |  │ Handler        │  │ Request relay
            |  └────────────────┘  |
            +----------+----------+
                   ↓
            +----------+----------+
            |  MongoDB             |
            |  - Users             |
            |  - API Keys          |
            |  - Usage Logs        |
            +----------+----------+

    [Client CLI / Portal SPA] → WebSocket → Tunnel Server → localhost:PORT
```

## Components

### 1. nginx (Reverse Proxy)

- Terminates TLS with Let's Encrypt wildcard cert (`*.tunnel.inetdev.io.vn`)
- Routes requests based on `Host` header subdomain
- Proxies to tunnel server on localhost:3001
- Handles WebSocket upgrade (`Upgrade: websocket`)

### 2. Tunnel Server (`packages/server`) — v0.3 Architecture

Express.js + MongoDB server running on port 3001 (behind nginx).

**Route Layers:**

| Layer | Path | Purpose |
|-------|------|---------|
| **API** | `/api/auth/*` | POST /signup, /login, /verify-totp, /refresh, /logout |
| **API** | `/api/user/*` | GET /profile, /keys, /usage; POST /keys; DELETE /keys/:id |
| **API** | `/api/admin/*` | Admin-only: /users, /tunnels, /stats, /keys (requires ADMIN_EMAILS) |
| **Dashboard** | `/dashboard/*` | Admin SPA (React, protected by admin role) |
| **Tunnel Relay** | `/*` | Tunnel request routing (unchanged from v0.1) |

**Core Modules (Tunnel Relay — v0.1 Unchanged):**

| Module | Responsibility |
|--------|---------------|
| `tunnel-manager.ts` | Map<subdomain, TunnelInfo>, register/unregister/lookup |
| `ws-handler.ts` | Accept WS connections, validate API key, register tunnel |
| `request-relay.ts` | Serialize HTTP req to WS message, await response, send back |

**New Modules (v0.3 User Management):**

| Module | Responsibility |
|--------|---------------|
| `models/user.ts` | Mongoose User schema + methods |
| `models/api-key.ts` | Mongoose ApiKey schema + validation |
| `models/usage-log.ts` | Mongoose UsageLog schema + aggregation |
| `auth/totp-service.ts` | TOTP secret generation + verification (otplib) |
| `auth/jwt-service.ts` | Access + refresh token management |
| `api/auth-routes.ts` | Authentication endpoints |
| `api/user-routes.ts` | User self-service endpoints |
| `api/admin-routes.ts` | Admin-only endpoints |
| `middleware/auth.ts` | JWT extraction + verification from httpOnly cookies |
| `middleware/rbac.ts` | Role-based access control (admin vs user) |
| `middleware/rate-limiter.ts` | Interface: Redis/memory/stub implementations |
| `services/usage-tracker.ts` | Request logging + daily snapshot aggregation |

**State:**
- **In-memory:** `Map<subdomain, TunnelInfo>` for tunnel relay (v0.1 unchanged)
- **Persistent:** MongoDB for users, API keys, usage logs (new v0.3)

### 3. Tunnel Client (`packages/client`) — v0.3 Enhancements

CLI tool + embedded React Portal SPA. Distributes via npm.

**CLI Modules (v0.1 — Tunnel Creation):**

| Module | Responsibility |
|--------|---------------|
| `cli.ts` | Parse args with commander |
| `tunnel-client.ts` | WS connection, message handling, auto-reconnect |
| `local-proxy.ts` | Proxy requests to localhost:PORT |
| `display.ts` | Terminal UI with chalk — status bar, request log |

**Portal SPA Modules (v0.3 — New):**

| Module | Responsibility |
|--------|---------------|
| `portal/app.tsx` | React entry, routing, context setup |
| `portal/pages/signup.tsx` | Email/password registration |
| `portal/pages/login.tsx` | Email/password login |
| `portal/pages/totp-setup.tsx` | TOTP secret generation + QR code |
| `portal/pages/keys.tsx` | List, create, revoke API keys |
| `portal/pages/usage.tsx` | View personal usage charts |
| `portal/api-client.ts` | Fetch wrapper for API calls |

**Portal Flow:**
1. User runs `npx tunelo http 3000`
2. No API key yet → CLI redirects to `http://localhost:4040`
3. User signs up → sets password → verifies TOTP (Google Authenticator)
4. Portal generates & displays API key (one-time display)
5. User returns to CLI → enters key → tunnel starts

### 4. MongoDB Database — v0.3 New

Persistent storage for users, API keys, usage logs.

**Models:**

| Collection | Purpose | Indexes |
|------------|---------|---------|
| `users` | User accounts, passwords (bcrypt), TOTP secrets, roles | `email` (unique) |
| `apikeys` | API keys per user, hashes, labels, expiry | `userId`, `keyHash` (unique) |
| `usagelogs` | Daily request/bandwidth tracking per key | `keyId`, `userId`, `date` |

**Queries use `.lean()`** for read-only operations (no Document methods, faster).

**Example:**
```javascript
// Fast read
const user = await User.findById(userId).select('email role').lean();

// Aggregate daily usage
const usage = await UsageLog
  .aggregate([
    { $match: { userId: ObjectId(userId), date: { $gte: '2026-03-01' } } },
    { $group: { _id: '$date', requests: { $sum: '$requestCount' } } },
    { $sort: { _id: 1 } }
  ])
  .exec();
```

### 5. Shared Package (`packages/shared`)

Types and constants shared between server and client.

| Module | Contents |
|--------|----------|
| `protocol.ts` | WS message types (discriminated unions) |
| `constants.ts` | Defaults, limits, regex patterns |
| `errors.ts` | TuneloError class, error codes (expanded for v0.3) |

## Request Flows

### 1. User Registration + TOTP Setup (Portal SPA)

1. User: `npx tunelo http 3000` → no API key → redirects to `http://localhost:4040`
2. Portal: Sign-up form → email + password
3. Server: `POST /api/auth/signup` → bcrypt password → create User in MongoDB
4. Server: Return TOTP secret + QR code image
5. Portal: Display QR code → user scans in Google Authenticator
6. Portal: User enters 6-digit TOTP code → `POST /api/auth/verify-totp`
7. Server: Validate code (otplib) → set `user.totpVerified = true` → send JWT
8. Portal: Display API key (one-time) → user copies to clipboard
9. CLI: User pastes key → tunnel connects with valid ApiKey

### 2. User Login (v0.3)

1. Portal: User enters email + password
2. Server: `POST /api/auth/login` → bcrypt compare → validate TOTP requirement
3. Portal: If TOTP not verified, prompt setup
4. Portal: User enters TOTP from Google Authenticator
5. Server: `POST /api/auth/verify-totp` → validate → issue JWT (24h) + refresh token (7d)
6. Response: Set httpOnly cookies (`accessToken`, `refreshToken`)
7. Portal: User can now manage keys, view usage

### 3. Tunnel Connection (Unchanged from v0.1)

1. User runs: `tunelo http 3000 --subdomain myapp --key tk_xxxxx`
2. Client: Connect WS to `wss://tunnel.inetdev.io.vn/tunnel`
3. Client: Send auth message with API key + subdomain
4. Server: Look up API key in MongoDB (validate hash + status + expiry)
5. Server: Extract `userId` from ApiKey → associate tunnel with user
6. Server: Register subdomain in TunnelManager
7. Browser: Hit `https://myapp.tunnel.inetdev.io.vn/api/data`
8. nginx: TLS termination, route to server:3001
9. Server: Lookup `myapp` tunnel, serialize HTTP request, send via WS
10. Client: Receive, proxy to `localhost:3000/api/data`
11. Local service responds
12. Client: Send response back via WS
13. Server: Send HTTP response to browser
14. UsageLog: Increment request count + byte counters for this key

## WebSocket Protocol

All messages are JSON with discriminated union on `type` field.

### v0.3 Auth Message (First Message)

Client **must** send this first; server rejects connection without it.

```typescript
{
  type: 'auth',
  apiKey: string,          // tk_xxxxxxxx (hashed as SHA-256 on server)
  subdomain: string        // myapp (validated with RFC 1123 regex)
}
```

Server responds:
```typescript
// Success
{ type: 'auth_ok', subdomain: string, url: string, userId: string }

// Failure
{ type: 'error', code: 'TUNELO_AUTH_001', message: 'Invalid API key' }
```

### Tunnel Relay Messages (v0.1 Unchanged)

**Server to Client:**
```typescript
// Incoming HTTP request
{ type: 'request', id: string, method: string, path: string, headers: Record<string, string>, body: string | null }

// Ping (keepalive)
{ type: 'ping' }
```

**Client to Server:**
```typescript
// HTTP response
{ type: 'response', id: string, status: number, headers: Record<string, string>, body: string | null }

// Pong (keepalive)
{ type: 'pong' }

// Error (if relay to local service failed)
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
