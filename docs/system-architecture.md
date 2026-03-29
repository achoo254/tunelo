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

### Overview (Device Code Auth Flow — v0.3.1)

Starting from v0.3.1, Tunelo supports **Device Code Authorization Flow** — a browser-based authentication pattern similar to GitHub's `gh auth login`. This replaces manual CLI prompts and improves user experience.

### 1. nginx (Reverse Proxy)

- Terminates TLS with Let's Encrypt wildcard cert (`*.tunnel.inetdev.io.vn`)
- Routes requests based on `Host` header subdomain
- Proxies to tunnel server on localhost:3001
- Handles WebSocket upgrade (`Upgrade: websocket`)

### 2. Tunnel Server (`packages/server`) — v0.3 Complete Architecture

Express.js + MongoDB + Node.js http server on port 3001 (behind nginx).

**Route Layers:**

| Layer | Path | Purpose |
|-------|------|---------|
| **API** | `/api/auth/*` | POST /signup, /login, /verify-totp, /refresh, /logout |
| **API** | `/api/profile/*` | GET /profile, PATCH /profile |
| **API** | `/api/keys/*` | GET /keys, POST /keys, DELETE /keys/:id |
| **API** | `/api/usage/*` | GET /usage, /usage/detailed |
| **API** | `/api/admin/*` | Admin-only: /users, /tunnels, /stats, /keys (requires ADMIN_EMAILS) |
| **Dashboard** | `/dashboard/*` | Admin SPA (React, protected by admin role) |
| **Tunnel Relay** | `/*` | Tunnel request + WS routing (unchanged from v0.1) |

**Integration:** Express wraps `http.createServer()`. API routes use middleware (JSON parsing, auth, CSRF). Catch-all handler passes raw req/res to relay (no Express middleware).

**Core Modules (Tunnel Relay — v0.1 Unchanged):**

| Module | Responsibility |
|--------|---------------|
| `tunnel-manager.ts` | Map<subdomain, TunnelInfo>, register/unregister/lookup |
| `ws-handler.ts` | Accept WS connections, validate API key, register tunnel |
| `request-relay.ts` | Serialize HTTP req to WS message, await response, send back |

**New Modules (v0.3 User Management — Complete):**

| Module | Responsibility |
|--------|---------------|
| `db/models/user-model.ts` | Mongoose User schema (email, password, TOTP, role, status) |
| `db/models/api-key-model.ts` | Mongoose ApiKey schema (userId, keyHash, label, expiry, status) |
| `db/models/device-code-model.ts` | Mongoose DeviceCode schema (deviceCode, userCode, approval status, TTL) |
| `db/models/usage-log-model.ts` | Mongoose UsageLog schema (daily request/bandwidth tracking) |
| `db/connection-manager.ts` | MongoDB connection + shutdown lifecycle |
| `services/totp-service.ts` | TOTP secret generation + verification (otplib, qrcode) |
| `services/auth-service.ts` | User registration, login, password/TOTP validation |
| `services/device-auth-service.ts` | Device code creation, polling, approval (5min TTL) |
| `services/key-service.ts` | API key generation, validation, revocation |
| `services/admin-service.ts` | Admin operations (user list, stats, key management) |
| `services/usage-tracker.ts` | Request logging + daily snapshot aggregation |
| `api/auth-routes.ts` | POST /signup, /login, /verify-totp, /refresh, /logout |
| `api/device-auth-routes.ts` | POST /device (create), /device/poll (CLI), /device/approve (Portal) |
| `api/profile-routes.ts` | GET /profile, PATCH /profile |
| `api/key-routes.ts` | GET /keys, POST /keys, DELETE /keys/:id |
| `api/usage-routes.ts` | GET /usage, /usage/detailed |
| `api/admin-routes.ts` | Admin endpoints (users, tunnels, stats, keys) |
| `api/create-api-router.ts` | Express router factory with middleware stack |
| `api/middleware/cookie-auth.ts` | JWT extraction + verification from httpOnly cookies |
| `api/middleware/admin-guard.ts` | Role-based access control (admin only) |
| `api/middleware/csrf-protection.ts` | CSRF token double-submit validation |
| `api/middleware/rate-limiter.ts` | Per-IP rate limiting (configurable) |
| `api/middleware/validate-body.ts` | Zod schema validation with error response |
| `api/middleware/error-handler.ts` | Centralized error handling (TuneloError → JSON) |
| `api/schemas/*.ts` | Zod validation schemas for request bodies |
| `key-store/key-store-types.ts` | KeyStore interface (injectable dependency) |
| `key-store/mongo-key-store.ts` | MongoDB-backed key validation |
| `key-store/json-file-key-store.ts` | JSON file-based (legacy, backward compat) |
| `key-store/create-key-store.ts` | Factory (selects Mongo or JSON based on env) |
| `tunnel-auth-checker.ts` | Validates API key during WS auth |
| `rate-limit/rate-limit-store.ts` | Rate limiter interface |
| `rate-limit/memory-rate-limit-store.ts` | In-memory rate limit store |
| `scripts/migrate-keys.ts` | CLI tool for migrating keys from env → MongoDB |

**State:**
- **In-memory:** `Map<subdomain, TunnelInfo>` for tunnel relay (v0.1 unchanged)
- **Persistent:** MongoDB for users, API keys, usage logs (new v0.3)

### 3. Tunnel Client (`packages/client`) — v0.3 Complete

CLI tool + embedded React Portal SPA. Distributes via npm.

**CLI Modules (v0.1 — Tunnel Creation):**

| Module | Responsibility |
|--------|---------------|
| `cli.ts` | Parse args (http, tcp, config) with commander |
| `tunnel-client.ts` | HTTP/TCP WS connection, message handling, auto-reconnect |
| `local-proxy.ts` | HTTP proxy to localhost:PORT |
| `tcp-proxy.ts` | TCP proxy to localhost:PORT |
| `tcp-ws-handler.ts` | TCP-over-WS message framing |
| `portal-server.ts` | Local Node.js server for Portal SPA at :4041 |
| `display.ts` | Terminal UI with chalk — status bar, request log |

**Portal SPA Modules (v0.3 — Complete):**

| Module | Responsibility |
|--------|---------------|
| `portal/app.tsx` | React entry, routing, auth context |
| `portal/pages/signup-page.tsx` | Email/password registration + TOTP setup |
| `portal/pages/login-page.tsx` | Email/password + TOTP verification |
| `portal/pages/keys-page.tsx` | List, create, revoke API keys (copy-to-clipboard) |
| `portal/pages/usage-page.tsx` | Daily usage chart (requests/bandwidth per key) |
| `portal/pages/profile-page.tsx` | View/edit user profile |
| `portal/components/totp-setup.tsx` | QR code display, manual entry fallback |
| `portal/components/key-create-modal.tsx` | Create key modal (label, optional expiry) |
| `portal/components/key-list.tsx` | Key list with revoke/copy actions |
| `portal/components/usage-chart.tsx` | Recharts line/bar charts |
| `portal/components/nav-bar.tsx` | Navigation header with logout |
| `portal/hooks/use-auth.ts` | Auth context + token refresh logic |
| `portal/hooks/use-api.ts` | Fetch wrapper with error handling |
| `portal/api/client.ts` | Typed API client for /api/* endpoints |

**Portal Flow:**
1. User runs `npx tunelo http 3000`
2. CLI starts portal server at `http://localhost:4041`
3. CLI shows: `Portal: http://localhost:4041`
4. User visits portal → sign up or login
5. Sign up: email → password → TOTP secret (QR code) → scan in Google Authenticator
6. Portal verifies TOTP code → generates API key (one-time display, not retrievable later)
7. User copies key to clipboard → closes portal
8. CLI: User enters API key → tunnel starts with valid credentials
9. Subsequent logins: email → password → TOTP verification → manage keys/view usage

### 4. MongoDB Database — v0.3 New

Persistent storage for users, API keys, usage logs.

**Models:**

| Collection | Purpose | Indexes |
|------------|---------|---------|
| `users` | User accounts, passwords (bcrypt), TOTP secrets, roles | `email` (unique) |
| `apikeys` | API keys per user, hashes, labels, expiry | `userId`, `keyHash` (unique) |
| `devicecodes` | Device code flows (pending, approved, expired) | `deviceCode` (unique), `userCode` (unique), `expiresAt` (TTL) |
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

1. User: `npx tunelo http 3000` → CLI starts portal at `http://localhost:4041`
2. Portal: Sign-up form → email + password
3. Server: `POST /api/auth/signup` → bcrypt hash password → create User in MongoDB
4. Server: Generate TOTP secret (otplib) → return with QR code image
5. Portal: Display QR code → user scans in Google Authenticator
6. Portal: User enters 6-digit TOTP code → `POST /api/auth/verify-totp`
7. Server: Validate code → set `user.totpVerified = true` → issue JWT + refresh token
8. Portal: Display API key (one-time, never shown again) → user copies to clipboard
9. User closes portal, returns to CLI → enters API key → tunnel connects

### 2. Device Code Authorization Flow (v0.3.1)

CLI requests device code for browser-based authentication (like `gh auth login`):

1. CLI: `tunelo login` → calls `POST /api/auth/device` (rate limit: 5/hour)
2. Server: Generate cryptographically random 32-char deviceCode + 8-char userCode (XXXX-XXXX format)
3. Server: Store in MongoDB `deviceCodes` collection with 5-minute TTL + `status: 'pending'`
4. Server: Return deviceCode, userCode, verificationUrl to CLI
5. CLI: Open browser → `{serverBaseUrl}/portal/auth/device?code={userCode}`
6. Portal: Display userCode for visual confirmation + Approve button
7. User clicks Approve → `POST /api/auth/device/approve` with userCode (requires cookie auth)
8. Server: Atomically mark deviceCode as `status: 'approved'` + generate API key + store in document
9. CLI: Polls `POST /api/auth/device/poll` every 3s (rate limit: 1/2s)
10. Server: On approved status, atomically delete document + return API key
11. CLI: Save key to `~/.tunelo/config.json` → ready to create tunnels

**Key properties:**
- **5-minute expiry:** deviceCode auto-expires via MongoDB TTL index
- **Atomic operations:** findOneAndDelete prevents duplicate key retrieval on concurrent polls
- **User-friendly code:** XXXX-XXXX format (excludes 0/O/1/I for clarity)
- **CSRF protected:** Approval requires valid httpOnly session cookie

### 3. User Login (v0.3 — Portal)

1. Portal: User enters email + password
2. Server: `POST /api/auth/login` → bcrypt compare password → validate if TOTP required
3. Portal: If TOTP not verified, user must complete TOTP setup first
4. Portal: For verified users, prompt TOTP code from authenticator
5. Server: `POST /api/auth/verify-totp` → validate code → issue JWT (24h access, 7d refresh)
6. Response: Set httpOnly secure cookies (`__Host-accessToken`, `__Host-refreshToken`)
7. Portal: User can now create keys, view usage, manage profile
8. Token refresh: When access token expires, client sends refresh token via POST /api/auth/refresh

### 4. Tunnel Connection (HTTP, v0.3 Updated)

1. User runs: `tunelo http 3000 --subdomain myapp --key tk_xxxxx`
2. Client: Connect WS to `wss://tunnel.inetdev.io.vn/tunnel`
3. Client: Send auth message (type: 'auth') with API key + subdomain
4. Server: Hash incoming key (SHA-256) → look up in MongoDB ApiKey collection
5. Server: Validate: hash match, status='active', expiry not passed
6. Server: Extract `userId` from ApiKey → find User
7. Server: Register subdomain in TunnelManager with tunnel metadata
8. Browser: Hit `https://myapp.tunnel.inetdev.io.vn/api/data`
9. nginx: TLS termination, proxy to server:3001 (HTTP)
10. Server: Lookup subdomain in TunnelManager, serialize HTTP request, send via WS
11. Client (TunnelClient): Receive request, proxy to `http://localhost:3000/api/data`
12. Local service responds with status + headers + body
13. Client: Send response back via WS (type: 'response', id: uuid)
14. Server: Receive response, send HTTP response to browser
15. UsageLog: Increment daily request count + byte counters for this key
16. On disconnect: Server unregisters subdomain, cancels pending requests

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
