# Research Report: Socket.IO vs ws (Raw WebSocket) cho Tunelo

**Date:** 2026-03-28 | **Context:** Tunelo tunnel proxy, Node.js/TypeScript

## Executive Summary

**Kết luận: Tunelo NÊN migrate từ Socket.IO sang raw `ws`.**

Socket.IO dùng ~180KB/connection vs ws ~20KB/connection (9x overhead). Với target 5-10K concurrent tunnels, Socket.IO sẽ ngốn 1.8GB RAM chỉ riêng WS connections, trong khi ws chỉ cần ~200MB. Tất cả tunnel proxy production (localtunnel, bore, frp, cloudflared, wstunnel) đều dùng raw WebSocket hoặc raw TCP — không ai dùng Socket.IO.

Socket.IO features (auto-reconnect, rooms, namespaces, polling fallback) **không cần thiết** cho Tunelo vì:
- Tunelo đã tự implement reconnect logic
- Không cần rooms/namespaces
- Polling fallback không cần (client là CLI, không phải browser)
- Binary relay cho TCP tunnels bị overhead bởi Socket.IO's JSON wrapper

## Key Findings

### 1. Performance Comparison

| Metric | Socket.IO | ws (raw) | Ratio |
|--------|-----------|----------|-------|
| Memory/connection | ~180KB | ~20KB | 9x |
| 10K connections | ~1.8GB | ~200MB | 9x |
| Message latency | baseline | 3.7x faster | 3.7x |
| Bundle size (server) | ~300KB | ~50KB | 6x |
| Protocol overhead/msg | ~40-100 bytes | 2-14 bytes | ~10x |

### 2. What Production Tunnel Proxies Use

| Project | Language | WS Library | Notes |
|---------|----------|------------|-------|
| localtunnel | Node.js | Raw TCP sockets | Không dùng WS library nào, dùng raw TCP pool |
| bore | Rust | tokio-tungstenite | Raw WS |
| frp | Go | gorilla/websocket | Raw WS |
| cloudflared | Go | gorilla/websocket | Raw WS |
| wstunnel | Rust/Node | ws | Raw WS |
| inlets | Go | gorilla/websocket | Raw WS |

**Không có tunnel proxy production nào dùng Socket.IO.** Lý do: overhead không đáng cho relay use case.

### 3. Socket.IO Overhead Analysis cho Tunelo

Cụ thể với Tunelo:
- **JSON wrapper**: Mỗi message Socket.IO thêm `42["event-name",{...}]` prefix → overhead cho mỗi relayed request
- **Polling fallback**: Tunelo client là CLI, luôn support WS → polling fallback vô dụng
- **Engine.IO layer**: Socket.IO chạy trên Engine.IO, thêm 1 layer abstraction không cần thiết
- **Binary encoding**: Socket.IO encode binary thành base64 trong JSON → TCP tunnel data bị 33% overhead + JSON wrapper overhead
- **Heartbeat**: Socket.IO dùng Engine.IO ping/pong → Tunelo đã implement riêng

### 4. Migration Effort Assessment

Features cần tự implement khi migrate sang ws:

| Feature | Socket.IO | Tự implement với ws | Effort |
|---------|-----------|-------------------|--------|
| Auto-reconnect | Built-in | **Đã có** (tunnel-client.ts) | 0 |
| Heartbeat/ping | Built-in | ~20 LOC (ws có sẵn ping/pong frame) | Low |
| Auth handshake | Event-based | HTTP upgrade header check | Low |
| Message routing | Event names | JSON `type` field (đã có protocol.ts) | 0 |
| Binary support | Socket.IO binary | Native WS binary frames | **Better** |
| Rate limiting | Manual | **Đã có** (ws-handler.ts) | 0 |
| Grace period | Manual | **Đã có** (tunnel-manager.ts) | 0 |

**Estimated migration effort: ~8h** — chủ yếu thay Socket.IO server/client APIs bằng ws equivalents.

### 5. Binary Performance (Critical cho TCP Tunnel)

Current flow (Socket.IO):
```
TCP data → base64 encode → JSON.stringify({type:"tcp-data", data:"..."})
→ Socket.IO frame wrapper → Engine.IO frame → WS frame → network
```

With raw ws:
```
TCP data → WS binary frame → network
```

**Giảm 4 layers overhead** cho mỗi TCP data packet. Với database tunnels (PostgreSQL, MySQL) chạy liên tục, đây là bottleneck thật sự.

## Recommendation

### Short-term (v0.2 — current)
Giữ Socket.IO. Đã ship, hoạt động, 19 tests pass. Không cần refactor ngay.

### Medium-term (v0.3)
**Migrate sang raw `ws`** khi:
- Cần scale > 1K concurrent tunnels
- TCP tunnel feature đi production (binary relay overhead matters)
- Cần giảm memory footprint trên VPS

### Migration Plan (v0.3)
1. Server: Replace `socket.io` → `ws` WebSocketServer
2. Client: Replace `socket.io-client` → `ws` WebSocket
3. Protocol: Keep JSON `type` discriminated unions (protocol.ts unchanged)
4. Auth: Move to HTTP upgrade header (`sec-websocket-protocol` or query param)
5. Ping/pong: Use native WS ping/pong frames
6. Binary: Send TCP data as WS binary frames (no base64)
7. Remove `@types/ws` from devDeps → move to deps

## Resources & References

- [Socket.IO Memory Usage Docs](https://socket.io/docs/v4/memory-usage/)
- [Socket.IO Performance Tuning](https://socket.io/docs/v4/performance-tuning/)
- [ws GitHub — Simple, fast WebSocket](https://github.com/websockets/ws)
- [Node.js + WebSockets: When to Use ws vs socket.io](https://dev.to/alex_aslam/nodejs-websockets-when-to-use-ws-vs-socketio-and-why-we-switched-di9)
- [Socket.IO vs WebSocket Performance Guide (Ably)](https://ably.com/topic/socketio-vs-websocket)
- [Socket.IO Performance Discussion #4566](https://github.com/socketio/socket.io/discussions/4566)
- [awesome-tunneling — ngrok alternatives list](https://github.com/anderspitman/awesome-tunneling)
- [Building HTTP Tunnel with WebSocket and Node.js](https://medium.com/@embbnux/building-a-http-tunnel-with-websocket-and-node-js-98068b0225d3)

## Unresolved Questions

1. Có cần support browser-based client trong tương lai không? (Nếu có thì Socket.IO's polling fallback có giá trị)
2. Target VPS RAM constraint cụ thể? (Nếu 1GB RAM thì phải migrate sớm, 4GB+ thì Socket.IO vẫn OK cho 5K connections)
3. TCP tunnel có đi production sớm không? (Binary relay là driver chính cho migration)
