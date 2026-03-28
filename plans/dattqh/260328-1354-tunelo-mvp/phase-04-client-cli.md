# Phase 4: Client CLI

## Overview
- **Priority:** P1
- **Status:** completed
- **Effort:** 4h
- **Depends on:** Phase 2 (can run parallel with Phase 3)
- **Description:** Implement CLI tool that connects to tunnel server, receives relayed HTTP requests, proxies to local service, returns responses.

## Key Insights
- `commander` for CLI parsing — mature, zero-config
- `chalk` for colored terminal output — familiar UX
- Auto-reconnect with exponential backoff critical for reliability
- Config file (`~/.tunelo/config.json`) avoids repeating --key every time
- Body handling: buffer full response from localhost, base64 if binary

## Requirements

### Functional
- CLI: `tunelo http <port> [--subdomain] [--key] [--server]`
- Connect to tunnel server via WS
- Authenticate with API key
- Receive TunnelRequest messages, proxy to localhost:<port>
- Return TunnelResponse with status/headers/body
- Auto-reconnect on disconnect with exponential backoff
- Pretty terminal UI: connection status, request log
- Config file support for persistent settings

### Non-functional
- npm installable globally: `npm install -g tunelo`
- Start-to-connected time <3s
- Minimal dependencies
- Clean exit on Ctrl+C

## Architecture

```
CLI args → resolve config → connect WS → auth handshake
  → on TunnelRequest: proxy to localhost → send TunnelResponse
  → on disconnect: exponential backoff reconnect
  → display: status bar + request log in terminal
```

## Related Code Files

### Files to Create
- `packages/client/src/cli.ts` — CLI entry point, arg parsing, orchestration
- `packages/client/src/tunnel-client.ts` — WS connection, auth, reconnect logic
- `packages/client/src/local-proxy.ts` — proxy TunnelRequest to localhost
- `packages/client/src/display.ts` — terminal UI formatting
- `packages/client/src/config.ts` — load/save config from ~/.tunelo/config.json

## Implementation Steps

### 1. Implement config.ts (~40 lines)

```typescript
interface TuneloConfig {
  server?: string;   // default: wss://tunnel.inetdev.io.vn
  key?: string;      // API key
}

// Load from ~/.tunelo/config.json (create dir if not exists)
export function loadConfig(): TuneloConfig
export function saveConfig(config: TuneloConfig): void
export function getConfigPath(): string
```

Config resolution order (later wins):
1. Default values
2. Config file (~/.tunelo/config.json)
3. Environment variables (TUNELO_KEY, TUNELO_SERVER)
4. CLI flags

### 2. Implement display.ts (~60 lines)

```typescript
export class Display {
  showBanner(version: string): void
  showConnecting(server: string): void
  showConnected(tunnelUrl: string, localUrl: string): void
  showDisconnected(reason?: string): void
  showReconnecting(attempt: number, delayMs: number): void
  logRequest(method: string, path: string, status: number, durationMs: number): void
  showError(message: string): void
}
```

Terminal output format:
```
┌─────────────────────────────────────────────┐
│  tunelo                          v0.1.0     │
├─────────────────────────────────────────────┤
│  Status:     Online                         │
│  Tunnel:     https://myapp.tunnel.inetdev.io.vn │
│  Forwarding: http://localhost:3000          │
├─────────────────────────────────────────────┤
│  GET  /api/users          200  12ms         │
│  POST /api/login          200  45ms         │
└─────────────────────────────────────────────┘
```

Use chalk for colors:
- Green: connected status, 2xx
- Yellow: 3xx, 4xx
- Red: 5xx, errors, disconnected
- Cyan: tunnel URL
- Gray: timestamps

### 3. Implement local-proxy.ts (~60 lines)

```typescript
export async function proxyRequest(
  request: TunnelRequest,
  localPort: number,
  localHost: string = 'localhost'
): Promise<TunnelResponse>
```

Steps:
1. Receive TunnelRequest
2. Build `http.request` options: `http://localhost:{port}{path}`
3. Set headers from TunnelRequest (strip hop-by-hop headers)
4. If body: decode from base64/string, write to request
5. Await response
6. Collect response body (buffer)
7. Build TunnelResponse with status, headers, body
8. Return

Error handling:
- Connection refused → TunnelResponse with 502, "Local service unavailable"
- Timeout → TunnelResponse with 504, "Local service timeout"
- Other errors → TunnelResponse with 502, error message

Headers to strip (hop-by-hop):
```typescript
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers',
  'transfer-encoding', 'upgrade'
]);
```

### 4. Implement tunnel-client.ts (~100 lines)

```typescript
interface TunnelClientOptions {
  serverUrl: string;     // wss://tunnel.inetdev.io.vn
  apiKey: string;
  subdomain?: string;
  localPort: number;
  localHost?: string;
}

export class TunnelClient extends EventEmitter {
  constructor(options: TunnelClientOptions)

  connect(): Promise<AuthResult>   // connect + auth handshake
  disconnect(): void

  // Events: 'connected', 'disconnected', 'request', 'error', 'reconnecting'
}
```

Internal flow:
1. `connect()`: Open WS to `${serverUrl}/tunnel`
2. On open: send AuthMessage with key + subdomain
3. Await AuthResult message
4. If success: emit 'connected', start message loop
5. On TunnelRequest message:
   - Call `proxyRequest(request, localPort)`
   - Send TunnelResponse back via WS
   - Emit 'request' event for display logging
6. On PingMessage: respond with PongMessage
7. On close/error: emit 'disconnected', start reconnect

Reconnect logic:
```typescript
private async reconnect() {
  let delay = DEFAULTS.RECONNECT_BASE_MS;
  while (!this.stopped) {
    this.emit('reconnecting', { attempt: this.attempts, delay });
    await sleep(delay);
    try {
      await this.connect();
      this.attempts = 0;
      return;
    } catch {
      this.attempts++;
      delay = Math.min(delay * 2, DEFAULTS.RECONNECT_MAX_MS);
    }
  }
}
```

### 5. Implement cli.ts (~60 lines)

```typescript
#!/usr/bin/env node
import { program } from 'commander';

program
  .name('tunelo')
  .version('0.1.0')
  .description('Expose local services to the internet');

program
  .command('http <port>')
  .description('Create HTTP tunnel to local port')
  .option('-s, --subdomain <name>', 'Request specific subdomain')
  .option('-k, --key <apikey>', 'API key for authentication')
  .option('--server <url>', 'Tunnel server URL', 'wss://tunnel.inetdev.io.vn')
  .action(async (port, options) => {
    // 1. Resolve config (file + env + flags)
    // 2. Validate port is number
    // 3. Require API key (from config or flag)
    // 4. Create Display instance, show banner
    // 5. Create TunnelClient
    // 6. Wire events to display
    // 7. Connect
    // 8. Handle Ctrl+C: disconnect, exit
  });

program
  .command('config')
  .description('Set default configuration')
  .option('-k, --key <apikey>', 'Set default API key')
  .option('-s, --server <url>', 'Set default server URL')
  .action((options) => {
    // Save to ~/.tunelo/config.json
  });

program.parse();
```

### 6. Update client package.json
```jsonc
{
  "name": "@tunelo/client",
  "version": "0.1.0",
  "bin": { "tunelo": "dist/cli.js" },
  "dependencies": {
    "@tunelo/shared": "*",
    "ws": "^8.16",
    "commander": "^12.0",
    "chalk": "^5.3"
  },
  "devDependencies": {
    "@types/ws": "^8.5"
  }
}
```

Note: chalk v5 is ESM-only. If using CommonJS, use chalk v4. Depends on module strategy.

### 7. Build and verify
```bash
npm run build -w @tunelo/client
npx tunelo --help   # verify CLI works
```

## Todo List
- [x] Implement config.ts — load/save ~/.tunelo/config.json
- [x] Implement display.ts — banner, status, request log with chalk
- [x] Implement local-proxy.ts — proxy TunnelRequest to localhost
- [x] Implement tunnel-client.ts — WS connect, auth, message loop, reconnect
- [x] Implement cli.ts — commander setup, http + config commands
- [x] Update package.json with dependencies and bin field
- [x] Build and verify `tunelo --help` works
- [x] Manual test: connect to running server, verify auth
- [x] Manual test: tunnel HTTP request to local Express server
- [x] Post-review fixes: response body size limit on client proxy (C3)

## Success Criteria
- `tunelo http 3000` connects to server and shows status banner
- HTTP requests through tunnel reach localhost:3000 and return correct response
- Disconnection triggers auto-reconnect with backoff
- `tunelo config --key tk_abc` saves to config file
- Ctrl+C cleanly disconnects and exits
- Request log shows method, path, status, duration

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| chalk v5 ESM incompatibility | Use chalk v4 if sticking with CJS, or configure ESM properly |
| Reconnect loop spam | Exponential backoff with 30s cap |
| Local service slow/hanging | 30s timeout per proxied request |
| Binary response body corruption | base64 encode all non-text bodies |
| Config file permissions | Create ~/.tunelo with 700, config with 600 |

## Security Considerations
- API key stored in config file with restricted permissions
- Never log API key to terminal
- Local proxy only connects to localhost (configurable but defaults safe)
