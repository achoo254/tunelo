# Scout Report: Socket.IO to WS Migration

Date: 2026-03-28
Project: Tunelo

## Executive Summary

Socket.IO currently used in server+client packages. Migration requires:
- Server: socket.io → ws (minimal changes)
- Client: socket.io-client → ws (needs EventEmitter wrapper)
- Shared: Types remain valid (discriminated union on type field)

Files requiring changes: 11 TypeScript source + 3 package.json + 2 build scripts


## SERVER-SIDE SOURCE FILES (5 FILES)

### 1. packages/server/src/ws-handler.ts (217 lines)
- Primary WS server handler
- Imports: Socket, Server as SocketIOServer from socket.io
- Creates: SocketIOServer with typed events
- Handles: auth, register-tunnel, response, disconnect, error
- Key: Connection mgmt, rate limiting (100 msg/sec), auth timeout

### 2. packages/server/src/tcp-ws-handler.ts (101 lines)
- TCP tunnel WebSocket handlers
- Function: attachTcpHandlers(socket)
- Handles: tcp-register, tcp-data, tcp-connection-close
- Key: Maps connectionId to relay, forwards binary data base64

### 3. packages/server/src/tcp-relay.ts (164 lines)
- Creates TCP relay server, bridges data to/from WS client
- Function: createTcpRelay(remotePort, wsSocket, onConnection)
- Uses: wsSocket.emit() for tcp-connection-open, tcp-data, tcp-connection-close
- Key: TCP lifecycle, idle timeout 30s

### 4. packages/server/src/tunnel-manager.ts (232 lines)
- Tunnel registry and request routing
- Stores: Socket refs in TunnelConnection
- Uses: socket.emit(request), socket.disconnect()
- Key: Multi-tunnel registration, pending request tracking, grace period

### 5. packages/server/src/server.ts (47 lines)
- Server bootstrap, calls attachWsHandler(server)
- Status: Minimal changes


## CLIENT-SIDE SOURCE FILES (3 FILES)

### 6. packages/client/src/tunnel-client.ts (217 lines)
- Main WS client using socket.io-client
- Imports: Socket, io from socket.io-client
- Uses: .on() listeners, .emit() sender, .disconnect()
- Key: Connection lifecycle, auth, request forwarding, reconnection exponential backoff

### 7. packages/client/src/tcp-proxy.ts (110 lines)
- TCP proxy for client-side TCP tunnels
- Uses: wsSocket.on() listeners, wsSocket.emit() sender
- Key: Local TCP connection mgmt, bidirectional relay

### 8. packages/client/src/cli-tcp-command.ts
- CLI command, uses client.getSocket() for TcpProxy
- Refactor: Return raw ws.WebSocket


## SHARED TYPE DEFINITIONS (3 FILES - NO SOCKETIO IMPORTS)

### 9. packages/shared/src/protocol.ts (163 lines)
- Message type definitions
- Defines: ServerToClientEvents, ClientToServerEvents interfaces
- Protocol: Discriminated union on type field
- Status: KEEP AS-IS

### 10. packages/shared/src/constants.ts
- Protocol defaults: WS_PATH, PING_INTERVAL_MS, MAX_BODY_SIZE
- Status: NO CHANGES

### 11. packages/shared/src/index.ts
- Package re-exports
- Status: NO CHANGES


## BUILD SCRIPTS (2 FILES)

### scripts/build-server.ts (24 lines)
- Bundles server with esbuild to dist/server.cjs
- Status: No code changes

### scripts/build-client.ts (35 lines)
- Bundles client with esbuild
- Externals: socket.io-client (REMOVE), chalk, commander, pino, ws
- Status: Remove socket.io-client from externals


## PACKAGE.JSON CHANGES (3 FILES)

### Root package.json
REMOVE: socket.io, socket.io-client

### packages/server/package.json
REMOVE: socket.io
KEEP: @types/ws, ws

### packages/client/package.json
REMOVE: socket.io-client
KEEP: @types/ws, ws


## MIGRATION STRATEGY

1. Protocol compatible: Messages use discriminated union
2. Server simpler: Attach ws.Server to HTTP server
3. Client wrapper: Create EventEmitter to match .on()/.emit() API
4. Ping/Pong: ws native frames replace Socket.IO
5. Reconnection: Already exponential backoff in TunnelClient

## DEPENDENCIES

REMOVE: socket.io@^4.8.3, socket.io-client@^4.8.3
KEEP: ws@^8.16.0, @types/ws@^8.5.0

## UNRESOLVED QUESTIONS

1. Create WebSocketWrapper class or refactor handlers directly?
2. Performance targets for 5-10k concurrent tunnels?
3. E2E test confirmation needed?
