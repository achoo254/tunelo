---
phase: 06
title: TCP Tunnel
priority: low
status: completed
effort: ~12h
depends_on: phase-03
---

# Phase 06 — TCP Tunnel

## Overview

Expose any TCP port (database, SSH, game server, etc.) through the tunnel. Unlike HTTP tunnels which use subdomain routing, TCP tunnels use dedicated port allocation on the server.

## Key Insights

- TCP = raw bytes, no HTTP semantics (no Host header, no request/response)
- Cannot use subdomain routing → need dedicated port per tunnel on server
- Server allocates port from configured range (e.g., 10000-10999)
- nginx cannot handle this — server listens directly on allocated port
- Binary data relay via WebSocket (ArrayBuffer, not JSON)
- Security risk higher — exposed port accepts any TCP connection

## Requirements

### Functional
- CLI: `tunelo tcp 5432` → `tcp://tunnel.inetdev.io.vn:10042`
- CLI: `tunelo tcp 22 --remote-port 10022` (request specific remote port)
- Server allocates available port from configured range
- Bidirectional raw byte streaming through WebSocket
- Display shows: `TCP: tunnel.inetdev.io.vn:10042 → localhost:5432`
- Graceful cleanup: close allocated port on disconnect

### Non-Functional
- Port range configurable via env `TCP_PORT_RANGE=10000-10999`
- Max 100 TCP tunnels per server (configurable)
- Firewall: only open allocated ports, close on disconnect
- Connection timeout: idle TCP connections closed after 10min
- Max concurrent TCP connections per tunnel: 50

## Architecture

```
External Client (psql, ssh, etc.)
  ↓ TCP connect to tunnel.inetdev.io.vn:10042
  ↓
Server (net.createServer on port 10042)
  ↓ raw bytes
  ↓
WebSocket message (binary) to tunnel client
  ↓
Client (net.createConnection to localhost:5432)
  ↓ raw bytes
  ↓ response bytes flow back the same path
```

### Key Difference from HTTP

| Aspect | HTTP Tunnel | TCP Tunnel |
|--------|-------------|------------|
| Routing | Subdomain (Host header) | Dedicated port |
| Data format | JSON (request/response) | Binary (raw bytes) |
| Multiplexing | Many HTTP requests on 1 WS | Many TCP connections on 1 WS |
| Protocol | Request → Response | Bidirectional stream |
| nginx | Handles TLS + proxy | Not involved |

## Protocol Changes

### New Message Types

```typescript
// Client → Server
interface TcpRegisterMessage {
  type: "tcp-register";
  localPort: number;
  remotePort?: number; // Requested port, server may assign different
}

// Server → Client
interface TcpRegisterResult {
  type: "tcp-register-result";
  success: boolean;
  localPort: number;
  remotePort: number;
  url: string; // "tcp://tunnel.inetdev.io.vn:10042"
  error?: string;
}

// Bidirectional — binary data relay
interface TcpDataMessage {
  type: "tcp-data";
  connectionId: string; // Unique per TCP connection
  data: string; // Base64 encoded bytes
}

// Server → Client — new TCP connection opened
interface TcpConnectionOpen {
  type: "tcp-connection-open";
  connectionId: string;
  remotePort: number;
  sourceIp: string;
}

// Bidirectional — TCP connection closed
interface TcpConnectionClose {
  type: "tcp-connection-close";
  connectionId: string;
}
```

## Related Code Files

### Create (Server)
- `packages/server/src/tcp-port-manager.ts` — port allocation/deallocation
- `packages/server/src/tcp-relay.ts` — TCP server per tunnel, byte relay

### Create (Client)
- `packages/client/src/tcp-proxy.ts` — local TCP connection handler

### Modify
- `packages/shared/src/protocol.ts` — TCP message types
- `packages/shared/src/constants.ts` — TCP defaults (port range, limits)
- `packages/server/src/ws-handler.ts` — handle tcp-register event
- `packages/server/src/tunnel-manager.ts` — track TCP tunnels per socket
- `packages/client/src/cli.ts` — add `tunelo tcp <port>` command
- `packages/client/src/tunnel-client.ts` — handle TCP messages
- `packages/client/src/display.ts` — show TCP tunnel info

## Implementation Steps

### Server Side
1. Create `tcp-port-manager.ts`:
   - Parse `TCP_PORT_RANGE` env (default 10000-10999)
   - `allocate(preferred?)` → returns available port
   - `release(port)` → free port
   - Track allocated ports with tunnel metadata
2. Create `tcp-relay.ts`:
   - `createTcpRelay(port, socket)` → `net.createServer` on allocated port
   - On new TCP connection: generate connectionId, send `tcp-connection-open` to client
   - On TCP data: base64 encode, send `tcp-data` to client via WS
   - On WS `tcp-data` from client: decode, write to TCP connection
   - On TCP close: send `tcp-connection-close` to client
   - On WS disconnect: close all TCP connections for that tunnel
3. Update ws-handler — handle `tcp-register` event:
   - Allocate port via tcp-port-manager
   - Create TCP relay on allocated port
   - Send `tcp-register-result` to client
4. Update tunnel-manager — track TCP tunnels (port → relay mapping)

### Client Side
5. Create `tcp-proxy.ts`:
   - On `tcp-connection-open`: create `net.createConnection` to local port
   - On `tcp-data`: decode base64, write to local TCP connection
   - On local TCP data: encode, send `tcp-data` to server via WS
   - On local TCP close: send `tcp-connection-close` to server
6. Update CLI — add `tunelo tcp <port>` command with `--remote-port` option
7. Update tunnel-client — handle TCP message types
8. Update display — show TCP tunnel URL format

### Infrastructure
9. Update firewall rules — allow TCP port range
10. Document TCP tunnel usage in README

## Todo List

- [ ] Protocol: add TCP message types
- [ ] Constants: add TCP defaults
- [ ] Server: create tcp-port-manager.ts
- [ ] Server: create tcp-relay.ts
- [ ] Server: handle tcp-register in ws-handler
- [ ] Server: track TCP tunnels in tunnel-manager
- [ ] Client: create tcp-proxy.ts
- [ ] Client: add tcp CLI command
- [ ] Client: handle TCP messages in tunnel-client
- [ ] Client: display TCP tunnel info
- [ ] Infra: firewall rules for TCP port range
- [ ] Test: port allocation/deallocation
- [ ] Test: bidirectional byte relay
- [ ] Test: concurrent TCP connections
- [ ] Test: cleanup on disconnect

## Success Criteria

- `tunelo tcp 5432` → allocates remote port, shows TCP URL
- External client connects to remote port → data relayed to localhost:5432
- Bidirectional: data flows both ways correctly
- Disconnect cleans up: port released, TCP connections closed
- Multiple concurrent TCP connections handled correctly
- Port range configurable and respected

## Risk Assessment

- **Security:** Exposed TCP port on internet — recommend IP whitelist (future feature)
- **Port exhaustion:** Max 1000 ports in range — monitor allocation
- **Performance:** Base64 encoding adds 33% overhead for binary data — acceptable for now, consider binary WS frames later
- **Firewall:** Must open port range — document clearly for ops
- **Idle connections:** 10min timeout prevents resource leak

## Security Considerations

- Rate limit new TCP connections (max 10/sec per tunnel)
- Log all TCP connection opens with source IP
- Max data throughput per tunnel (optional, for abuse prevention)
- Consider IP whitelist per TCP tunnel (future enhancement)
- Never relay to ports < 1024 on server (privileged ports)
