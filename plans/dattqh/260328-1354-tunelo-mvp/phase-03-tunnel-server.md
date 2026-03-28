# Phase 3: Tunnel Server

## Overview
- **Priority:** P1
- **Status:** completed
- **Effort:** 5h
- **Depends on:** Phase 2
- **Description:** Implement the tunnel server — WS connection handler, subdomain management, HTTP request relay, API key auth.

## Key Insights
- Raw `http` module + `ws` library — no framework overhead
- In-memory `Map<subdomain, TunnelConnection>` for O(1) lookup
- Extract subdomain from `Host` header (nginx passes it through)
- Each HTTP request gets unique ID; server awaits matching WS response
- Ping/pong keepalive detects dead connections
- Graceful shutdown: close all WS connections, drain HTTP requests

## Requirements

### Functional
- Accept WS connections with API key + subdomain validation
- Maintain subdomain-to-WS mapping
- Receive HTTP requests, extract subdomain from Host header
- Serialize HTTP request → WS message, send to correct client
- Await client response, send back as HTTP response
- Health endpoint (`/health`)
- Handle WS disconnection (cleanup subdomain)
- Ping/pong keepalive every 30s

### Non-functional
- Handle 100+ concurrent tunnels
- <50ms relay overhead
- Graceful shutdown on SIGTERM/SIGINT

## Architecture

```
HTTP Request → extractSubdomain(Host) → tunnelManager.get(subdomain)
  → serialize to TunnelRequest → ws.send() → await response → HTTP response

WS Connection → validate auth → tunnelManager.register(subdomain, ws)
  → on close: tunnelManager.unregister(subdomain)
```

## Related Code Files

### Files to Create
- `packages/server/src/server.ts` — HTTP + WS server bootstrap, health endpoint, graceful shutdown
- `packages/server/src/tunnel-manager.ts` — Map<subdomain, TunnelConnection>, register/unregister/lookup
- `packages/server/src/ws-handler.ts` — WS upgrade handler, auth validation, message routing
- `packages/server/src/request-relay.ts` — HTTP request → WS relay → HTTP response
- `packages/server/src/auth.ts` — Load API keys from keys.json, validate

### Files to Create (support)
- `packages/server/keys.json.example` — example API keys file

## Implementation Steps

### 1. Implement auth.ts (~30 lines)

```typescript
// Load keys from JSON file: { "keys": ["tk_abc123", "tk_def456"] }
// export function loadApiKeys(filePath: string): Set<string>
// export function validateApiKey(key: string, keys: Set<string>): boolean
// Watch file for changes (fs.watchFile) to reload keys without restart
```

Key behaviors:
- Keys stored as `Set<string>` for O(1) lookup
- Keys prefixed with `tk_` convention
- File path from env `API_KEYS_FILE` or default `./keys.json`

### 2. Implement tunnel-manager.ts (~80 lines)

```typescript
interface TunnelConnection {
  ws: WebSocket;
  apiKey: string;
  subdomain: string;
  connectedAt: Date;
  pendingRequests: Map<string, {
    resolve: (res: TunnelResponse) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>;
}

class TunnelManager {
  private tunnels = new Map<string, TunnelConnection>();

  register(subdomain: string, ws: WebSocket, apiKey: string): boolean
  unregister(subdomain: string): void
  get(subdomain: string): TunnelConnection | undefined
  has(subdomain: string): boolean
  sendRequest(subdomain: string, request: TunnelRequest): Promise<TunnelResponse>
  handleResponse(subdomain: string, response: TunnelResponse): void
  getStats(): { activeTunnels: number; subdomains: string[] }
  closeAll(): void
}
```

Key behaviors:
- `sendRequest` creates pending request entry with timeout (30s)
- Returns Promise that resolves when client sends matching response
- `handleResponse` resolves the pending Promise by request ID
- Timeout rejects with REQUEST_TIMEOUT error
- `unregister` rejects all pending requests for that tunnel

### 3. Implement ws-handler.ts (~80 lines)

```typescript
// export function handleWsUpgrade(server: http.Server, tunnelManager: TunnelManager, apiKeys: Set<string>)

// On WS connection:
// 1. Parse query params: key, subdomain
// 2. Validate API key
// 3. Validate subdomain format (SUBDOMAIN_REGEX)
// 4. Check subdomain availability
// 5. Register tunnel
// 6. Send AuthResult success message
// 7. Set up message handler (route responses to tunnelManager.handleResponse)
// 8. Set up close handler (tunnelManager.unregister)
// 9. Start ping interval
```

Key behaviors:
- If no subdomain provided, generate random one (nanoid, 8 chars, lowercase)
- Reject with AuthResult error if key invalid or subdomain taken
- Parse incoming messages, validate type, route to appropriate handler
- On close: cleanup tunnel, clear ping interval

### 4. Implement request-relay.ts (~80 lines)

```typescript
// export function createRelayHandler(tunnelManager: TunnelManager): http.RequestListener

// On HTTP request:
// 1. Extract subdomain from Host header: myapp.tunnel.inetdev.io.vn → myapp
// 2. Look up tunnel in tunnelManager
// 3. If not found → 502 "Tunnel not found"
// 4. Collect request body (with size limit check)
// 5. Build TunnelRequest message
// 6. await tunnelManager.sendRequest(subdomain, request)
// 7. Write TunnelResponse back as HTTP response
```

Subdomain extraction:
```typescript
function extractSubdomain(host: string): string | null {
  // host = "myapp.tunnel.inetdev.io.vn" or "myapp.tunnel.inetdev.io.vn:3001"
  const match = host.match(/^([^.]+)\.tunnel\.inetdev\.io\.vn/);
  return match ? match[1] : null;
}
```

Error responses:
- No subdomain in host → 400
- Tunnel not found → 502 with friendly HTML
- Request timeout → 504
- Body too large → 413

### 5. Implement server.ts (~60 lines)

```typescript
// 1. Load env vars (dotenv)
// 2. Load API keys
// 3. Create TunnelManager instance
// 4. Create HTTP server with relay handler
// 5. Attach WS handler for upgrade events
// 6. Health endpoint: GET /health → { status: "ok", tunnels: N }
// 7. Listen on TUNNEL_PORT (default 3001)
// 8. Graceful shutdown: SIGTERM/SIGINT → close WS connections, close HTTP server
```

Health check (handled before relay):
```typescript
if (req.url === '/health' && req.method === 'GET') {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', ...tunnelManager.getStats() }));
  return;
}
```

### 6. Handle WebSocket pass-through

When the end-user opens a WebSocket to `wss://myapp.tunnel.inetdev.io.vn/ws`:
- Detect `Upgrade: websocket` header in incoming request
- Instead of serializing to JSON, establish a WS-over-WS bridge
- This is complex — for MVP, signal to client via a special message type
- **MVP approach:** Serialize the WS upgrade as a regular HTTP request; client responds with 101; server then pipes raw frames. Alternatively, defer WS pass-through to v0.2 if too complex.
- **Decision:** Implement basic HTTP relay first. Add WS pass-through as stretch goal.

### 7. Add dev dependencies to server package.json
```jsonc
{
  "dependencies": {
    "@tunelo/shared": "*",
    "ws": "^8.16",
    "nanoid": "^5.0",
    "dotenv": "^16.4"
  },
  "devDependencies": {
    "@types/ws": "^8.5"
  }
}
```

## Todo List
- [x] Implement auth.ts — load keys from file, validate
- [x] Implement tunnel-manager.ts — Map, register/unregister/lookup, pending requests
- [x] Implement ws-handler.ts — upgrade handler, auth flow, message routing
- [x] Implement request-relay.ts — HTTP→WS relay, subdomain extraction, error handling
- [x] Implement server.ts — bootstrap, health endpoint, graceful shutdown
- [x] Create keys.json.example
- [x] Add dependencies to package.json (ws, nanoid, dotenv)
- [x] Build and verify compilation
- [x] Manual test: start server, connect WS client (wscat), verify auth flow
- [x] Manual test: send HTTP request, verify relay to WS
- [x] Post-review fixes: API key hashing (SHA-256), WS rate limiting (100 msg/s)

## Success Criteria
- Server starts on configured port
- WS connection with valid API key succeeds, gets AuthResult
- WS connection with invalid key is rejected
- HTTP request to subdomain is relayed to connected client WS
- Response from client WS is sent back as HTTP response
- Disconnected tunnel returns 502
- Health endpoint returns active tunnel count
- Graceful shutdown closes all connections

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Large request bodies exhaust memory | Enforce MAX_BODY_SIZE (10MB), return 413 |
| WS connection silently dies | Ping/pong keepalive every 30s, timeout detection |
| Subdomain collision | First-come-first-served, reject with SUBDOMAIN_TAKEN |
| Pending request never resolved | 30s timeout, reject Promise, return 504 |
| Many tunnels slow down lookup | Map is O(1); 100 tunnels is trivial |

## Security Considerations
- API key validated before tunnel registration
- Subdomain regex prevents injection/traversal
- Body size limit prevents DoS
- No eval/exec of tunneled content
- Keys file should be 600 permissions on server
