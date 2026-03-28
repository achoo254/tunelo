# Brainstorm: Tunelo — ngrok Alternative MVP
**Date:** 2026-03-28 | **Status:** Agreed

---

## Problem Statement

ngrok free plan has severe limitations: rate limits, endpoint caps, session restrictions. Need self-hosted tunnel proxy that:
- Exposes local services via public HTTPS domain
- Uses wildcard subdomains (like ngrok)
- No artificial limits on usage
- Path: self-hosted first → SaaS later

## Agreed Constraints

| Aspect | Decision |
|--------|----------|
| **Tech stack** | Node.js / TypeScript (end-to-end) |
| **Architecture** | WebSocket Relay (tunnelmole-style) |
| **VPS** | 2-4 vCPU, 4-8GB RAM |
| **Domain** | inetdev.io.vn (staging) |
| **Subdomain** | *.tunnel.inetdev.io.vn |
| **Protocols** | HTTP + WebSocket |
| **Auth** | API key (simple, SaaS-ready) |
| **TLS** | Let's Encrypt wildcard (DNS-01) |
| **Distribution** | npm package + standalone binary |
| **Scale target** | 5-10k concurrent (MVP sufficient) |

---

## Architecture: WebSocket Relay

### How it works

```
                    INTERNET
                       │
            ┌──────────┴──────────┐
            │   nginx (port 443)  │
            │  - TLS termination  │
            │  - Wildcard cert    │
            │  - Subdomain route  │
            └──────────┬──────────┘
                       │ HTTP (internal)
            ┌──────────┴──────────┐
            │   Tunnel Server     │
            │   (Node.js)         │
            │  - WS connections   │
            │  - Request relay    │
            │  - Subdomain mgmt  │
            │  - API key auth     │
            └──────────┬──────────┘
                       │ WebSocket (persistent)
                       │ (outbound from client)
            ┌──────────┴──────────┐
            │   Tunnel Client     │
            │   (CLI tool)        │
            │  - Connect to server│
            │  - Receive requests │
            │  - Proxy to local   │
            └──────────┬──────────┘
                       │ HTTP proxy
            ┌──────────┴──────────┐
            │   Local Service     │
            │   localhost:3000    │
            └─────────────────────┘
```

### Request Flow (detailed)

1. User runs: `tunelo http 3000 --subdomain myapp`
2. Client CLI connects WS to `wss://tunnel.inetdev.io.vn/tunnel?key=xxx&subdomain=myapp`
3. Server validates API key, registers subdomain `myapp` → this WS connection
4. Browser hits `https://myapp.tunnel.inetdev.io.vn/api/data`
5. nginx terminates TLS, proxies to tunnel server (port 3001)
6. Server looks up `myapp` → finds WS connection
7. Server serializes HTTP request → sends via WS to client
8. Client receives, proxies to `http://localhost:3000/api/data`
9. Local service responds → client sends response back via WS
10. Server sends HTTP response to browser

### WebSocket Protocol (simple JSON)

```jsonc
// Server → Client: incoming request
{
  "type": "request",
  "id": "req_abc123",
  "method": "GET",
  "path": "/api/data",
  "headers": { "host": "myapp.tunnel.inetdev.io.vn", ... },
  "body": null
}

// Client → Server: response
{
  "type": "response",
  "id": "req_abc123",
  "status": 200,
  "headers": { "content-type": "application/json" },
  "body": "{\"data\": \"hello\"}"
}
```

---

## Components Breakdown

### 1. Tunnel Server (packages/server)
- **Framework:** Fastify (lightweight, fast) or raw `http` + `ws`
- **Responsibilities:**
  - Accept WS connections from clients (with API key validation)
  - Maintain subdomain → WS connection mapping (in-memory Map)
  - Receive HTTP requests from nginx, relay to correct client
  - Handle WebSocket upgrade for tunneled WS connections
  - Health check endpoint
  - Basic metrics (active tunnels, requests/sec)
- **Key modules:**
  - `tunnel-manager.ts` — Map<subdomain, WebSocket>, register/unregister
  - `request-relay.ts` — serialize HTTP req → WS message, deserialize response
  - `auth.ts` — API key validation (file-based or env-based for MVP)
  - `server.ts` — HTTP server + WS server setup

### 2. Tunnel Client CLI (packages/client)
- **Responsibilities:**
  - Parse CLI args (port, subdomain, server URL, API key)
  - Establish WS connection to server
  - Receive serialized HTTP requests
  - Proxy to local service using `http.request`
  - Send responses back via WS
  - Auto-reconnect on disconnect
  - Pretty terminal output (like ngrok UI)
- **Key modules:**
  - `cli.ts` — arg parsing (commander/yargs)
  - `tunnel-client.ts` — WS connection, message handling
  - `local-proxy.ts` — proxy requests to localhost
  - `display.ts` — terminal UI (request log, status)

### 3. Infrastructure
- **nginx config:** wildcard server_name, proxy_pass to tunnel server
- **Let's Encrypt:** certbot + DNS-01 (Cloudflare/manual)
- **DNS:** `*.tunnel.inetdev.io.vn` A record → VPS IP
- **Process manager:** PM2 or systemd

---

## UX Design (CLI)

```bash
# Basic usage
tunelo http 3000

# Custom subdomain
tunelo http 3000 --subdomain myapp

# With API key (from config or flag)
tunelo http 3000 --key tk_abc123

# Config file (~/.tunelo/config.json)
tunelo http 3000   # reads key from config

# Output
┌─────────────────────────────────────────────┐
│  tunelo                          v0.1.0     │
├─────────────────────────────────────────────┤
│  Status:    Online                          │
│  Tunnel:    https://myapp.tunnel.inetdev.io.vn │
│  Forwarding: http://localhost:3000          │
├─────────────────────────────────────────────┤
│  GET  /api/users          200  12ms         │
│  POST /api/login          200  45ms         │
│  GET  /static/app.js      304   3ms         │
└─────────────────────────────────────────────┘
```

---

## Evaluated Alternatives

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **WebSocket Relay** | Simple, pure TS, full control | WS overhead, ~5-10k limit | **Chosen** — best for MVP |
| TCP Multiplexing | Higher perf, less overhead | Complex mux protocol, 3x dev time | Overkill for MVP |
| Wrap rathole | Best perf (Rust core) | Binary dependency, can't customize | Lose flexibility |
| Fork localtunnel | 30k stars, proven | Minimal features, no WS support | Too basic |
| Fork tunnelmole | TypeScript, closest match | 1.6k stars, may have bugs | Good reference code |

---

## Key Technical Decisions

### Why WebSocket for tunnel transport?
- Bidirectional, persistent — perfect for relay pattern
- Native browser/Node.js support
- Passes through firewalls/proxies (port 443)
- Handles both HTTP relay AND WebSocket tunneling

### Why nginx in front?
- TLS termination (Let's Encrypt wildcard cert)
- Wildcard subdomain routing (`~^(.+)\.tunnel\.inetdev\.io\.vn$`)
- Connection handling (C10k capable)
- Node.js only handles tunnel logic, not TLS/routing
- Easy to swap/scale later

### Why in-memory state (no database)?
- Tunnel connections are ephemeral — no persistence needed
- Map<subdomain, WS> is O(1) lookup
- If server restarts, clients auto-reconnect
- Database adds latency + complexity for zero benefit in MVP
- Add Redis later for multi-server scaling

### Why API key (not JWT)?
- Simple to implement: key in header, lookup in Map/file
- Sufficient for access control
- Easy to migrate to JWT later for SaaS
- No token expiry/refresh complexity

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large request bodies (file uploads) | Memory spike, WS message too big | Stream body in chunks, set max body size (10MB default) |
| WS connection drops | Tunnel goes down | Auto-reconnect with exponential backoff in client |
| Subdomain conflicts | 2 users claim same subdomain | First-come-first-served + API key ownership check |
| nginx single point of failure | All tunnels down | PM2 auto-restart, health checks, easy to add HA later |
| Binary distribution complexity | Cross-platform builds | Use `pkg` for Node.js → binary. Start with npm only, add binary later |

---

## Body Streaming Strategy

For large payloads, instead of sending entire body in one WS message:

```jsonc
// Chunked transfer
{ "type": "request-start", "id": "req_1", "method": "POST", "path": "/upload", "headers": {...} }
{ "type": "request-chunk", "id": "req_1", "data": "<base64 chunk>" }
{ "type": "request-chunk", "id": "req_1", "data": "<base64 chunk>" }
{ "type": "request-end", "id": "req_1" }
```

MVP can start with full-body-in-message (simpler), add streaming in v0.2.

---

## Success Metrics

- [ ] Client connects, tunnel accessible via HTTPS in <3 seconds
- [ ] HTTP requests relay correctly (GET, POST, PUT, DELETE)
- [ ] WebSocket connections pass through tunnel
- [ ] Auto-reconnect works within 5 seconds
- [ ] Handle 100 concurrent tunnels on single VPS
- [ ] Request latency overhead <50ms (tunnel only)

---

## MVP Scope (v0.1)

### In scope
- Server: WS connection handler, subdomain routing, HTTP relay
- Client CLI: connect, proxy, auto-reconnect, request log
- nginx + Let's Encrypt wildcard setup
- API key auth (file-based)
- npm package distribution
- Random subdomain if not specified
- Custom subdomain flag

### Out of scope (v0.2+)
- Standalone binary (pkg)
- Web dashboard (active tunnels, metrics)
- User management / registration
- Rate limiting / usage tracking
- TCP raw tunnel support
- Custom domain support (user brings own domain)
- Request inspection / replay (ngrok-style)
- Multi-server / horizontal scaling
- Database for persistent state

---

## Monorepo Structure

```
tunelo/
├── packages/
│   ├── server/          # Tunnel server (deployed to VPS)
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── tunnel-manager.ts
│   │   │   ├── request-relay.ts
│   │   │   ├── ws-handler.ts
│   │   │   └── auth.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── client/          # CLI tool (npm package)
│   │   ├── src/
│   │   │   ├── cli.ts
│   │   │   ├── tunnel-client.ts
│   │   │   ├── local-proxy.ts
│   │   │   └── display.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/          # Shared types & protocol
│       ├── src/
│       │   ├── protocol.ts   # Message types
│       │   └── constants.ts
│       ├── package.json
│       └── tsconfig.json
├── infra/               # Server setup scripts
│   ├── nginx.conf
│   ├── certbot-setup.sh
│   └── pm2.config.js
├── package.json         # Workspace root
├── tsconfig.base.json
└── README.md
```

---

## Implementation Estimate

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1: Shared protocol + types | Message types, constants | Small |
| Phase 2: Tunnel server | WS handler, relay, subdomain mgmt | Medium |
| Phase 3: Client CLI | WS connect, proxy, display | Medium |
| Phase 4: Infrastructure | nginx, certbot, DNS, PM2 | Small |
| Phase 5: Auth + polish | API key, error handling, reconnect | Small |
| Phase 6: Testing | E2E tunnel test, load test | Medium |

---

## Reference Implementations to Study

1. **tunnelmole** — closest to our architecture, TypeScript
2. **localtunnel** — simple Node.js tunnel, good for understanding basics
3. **frp** — feature-rich, good UX reference

---

## Unresolved Questions

1. Binary body encoding: base64 (simple, 33% overhead) vs binary WS frames (efficient, complex)?
2. Max concurrent tunnels per API key — what limit for free tier?
3. Subdomain naming rules — alphanumeric only? max length?
