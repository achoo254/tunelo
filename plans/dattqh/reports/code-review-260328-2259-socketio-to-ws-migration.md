# Code Review: Socket.IO to Raw WS Migration

**Date:** 2026-03-28
**Reviewer:** code-reviewer
**Scope:** 12 files, ~800 LOC across shared/server/client packages
**Focus:** Security, correctness, performance, edge cases

## Overall Assessment

Clean, well-structured migration. Socket.IO removed completely; raw `ws` with typed JSON protocol is a solid architectural improvement. Auth flow, rate limiting, ping/pong keepalive, and cleanup all present. A few missing readyState guards could cause runtime errors under load.

---

## Critical Issues

None found.

---

## High Priority

### H1. Missing `readyState` check on `tunnel-manager.ts:167` `sendRequest()`

**File:** `packages/server/src/tunnel-manager.ts:167`

`tunnel.socket.send(JSON.stringify(request))` does NOT check `readyState` before sending. If the WebSocket is in CLOSING/CLOSED state (race between disconnect and HTTP relay), this throws an uncaught error.

The `sendMsg` helper in `ws-handler.ts:161` correctly guards with `readyState === OPEN`, but `tunnel-manager` bypasses it.

**Fix:**
```ts
// tunnel-manager.ts line 167
if (tunnel.socket.readyState !== 1 /* WebSocket.OPEN */) {
  tunnel.pendingRequests.delete(request.id);
  clearTimeout(timer);
  return reject(new Error(`Tunnel disconnected [${ErrorCode.TUNNEL_NOT_FOUND}]`));
}
tunnel.socket.send(JSON.stringify(request));
```

### H2. Missing `readyState` checks in `tcp-relay.ts` — 3 bare `wsSocket.send()` calls

**File:** `packages/server/src/tcp-relay.ts:84, 97, 109`

All three `wsSocket.send(...)` calls in `createTcpRelay` lack readyState guards. TCP connections can outlive the WS connection momentarily during disconnect, causing throws on send to closed socket.

**Fix:** Extract a safe-send helper or check `wsSocket.readyState === wsSocket.OPEN` before each send.

### H3. Missing `readyState` checks in `tcp-ws-handler.ts` — 3 bare `ws.send()` calls

**File:** `packages/server/src/tcp-ws-handler.ts:37, 57, 72`

Same issue as H2. `handleTcpRegister` sends results without readyState guard.

**Fix:** Same pattern — guard with `readyState === OPEN` or use shared safe-send utility.

### H4. `parseMessage()` casts without validation — potential prototype pollution / type confusion

**File:** `packages/shared/src/protocol.ts:133-135`

```ts
export function parseMessage(data: string): TunnelMessage {
  return JSON.parse(data) as TunnelMessage;
}
```

`JSON.parse` + `as` cast provides zero runtime validation. A malicious client can send `{"type":"auth","key":"x","subdomain":"y","__proto__":{"admin":true}}` or any arbitrary shape. The `switch(msg.type)` router trusts the type field blindly.

While `JSON.parse` itself is safe from prototype pollution (it doesn't assign to `__proto__`), the lack of schema validation means:
- Missing required fields (e.g., `msg.key` is `undefined`) propagate silently
- Extra fields pass through unchecked

**Recommendation:** Add a lightweight type guard or at minimum validate `msg.type` is a known string before routing:

```ts
export function parseMessage(data: string): TunnelMessage | null {
  const parsed: unknown = JSON.parse(data);
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null;
  return parsed as TunnelMessage; // further field validation in handlers
}
```

---

## Medium Priority

### M1. `customAlphabet` re-instantiated on every auth call

**File:** `packages/server/src/ws-handler.ts:186, 238`

`customAlphabet(...)` is called inside `handleAuth()` and `handleRegisterTunnel()` on every invocation. This creates a new function each time. Should be a module-level constant.

**Fix:**
```ts
// Top of ws-handler.ts
const generateSubdomain = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
```

### M2. Rate limit counter resets only on interval, not on connection close

**File:** `packages/server/src/ws-handler.ts:66-68`

The `rateLimitInterval` is cleared on close (line 148), but if the interval fires between close and clearInterval, `state.messageCount` could be stale for the next connection reusing the same state object. Not a real issue since state is per-connection and GC'd, but worth noting for clarity.

### M3. Reconnect loop in client can stack promises

**File:** `packages/client/src/tunnel-client.ts:241-255`

If `reconnect()` is called while already reconnecting (e.g., the `close` event fires again from a failed reconnect attempt), a second infinite reconnect loop starts. The `stopped` flag prevents this from being catastrophic, but there's no guard against concurrent reconnect calls.

**Fix:** Add a `reconnecting` boolean flag:
```ts
private reconnecting = false;
// In reconnect():
if (this.reconnecting) return;
this.reconnecting = true;
// ... loop ...
this.reconnecting = false;
```

### M4. `MAX_BODY_SIZE` is 50MB but CLAUDE.md says 10MB

**File:** `packages/shared/src/constants.ts:7`

`MAX_BODY_SIZE: 50 * 1024 * 1024` (50MB) contradicts the project CLAUDE.md security rule: "Max body size - reject payloads >10MB". This is set as `maxPayload` on the WebSocketServer, meaning clients can send 50MB WS frames.

**Decision needed:** Align to 10MB per security spec, or update docs if 50MB is intentional.

### M5. `closeAll()` calls `unregister()` while iterating `this.tunnels`

**File:** `packages/server/src/tunnel-manager.ts:226-229`

```ts
for (const [subdomain, tunnel] of this.tunnels) {
  tunnel.socket.close();
  this.unregister(subdomain); // deletes from this.tunnels during iteration
}
```

Deleting from a Map while iterating it with `for...of` is safe in JS (spec guarantees it), but `unregister()` also sets grace timers which are immediately cleaned up on the next line. Consider collecting subdomains first or just clearing the map after the loop.

---

## Low Priority

### L1. `ws` externalized in esbuild bundle

**File:** `scripts/build-client.ts:22`

`ws` is listed as external, meaning users must `npm install ws` separately. This is correct for the CLI npm package, but ensure the package.json `dependencies` includes `ws` (confirmed: it does).

### L2. Application-level ping/pong messages still in protocol types

**File:** `packages/shared/src/protocol.ts:45-53`

`PingMessage` and `PongMessage` types exist but the server uses native WS ping/pong. The client switch has a `case "pong"` no-op. These types could be removed if unused, or kept for future application-level heartbeat.

---

## Edge Cases Found by Scout

1. **WS close during `sendRequest`**: Between `tunnels.get()` returning a valid tunnel and `socket.send()`, the socket can close. No readyState guard. (Covered in H1)

2. **TCP relay outlives WS**: TCP socket `data`/`close` events fire after WS disconnects, causing bare `wsSocket.send()` to throw. (Covered in H2)

3. **Double reconnect**: Client `close` event can fire multiple times during reconnect attempts, stacking loops. (Covered in M3)

4. **Auth timeout race**: If auth message arrives at exactly the timeout boundary, both the auth handler and timeout handler could execute. Mitigated by `if (state.authenticated) return` guard in `handleAuth` and `clearTimeout(state.authTimer)`.

5. **Grace period reconnect with different connectionId**: On reconnect, `register()` re-uses orphaned pending requests but the new connection has a new `connectionId`. The pending requests' responses will arrive on the new connectionId. `handleResponseByConnectionId` iterates all tunnels for that connectionId, so this works correctly.

---

## Positive Observations

- Clean separation: protocol types in shared, handlers in server, client is an EventEmitter
- `sendMsg` helper in ws-handler correctly guards readyState
- Auth timeout with proper cleanup
- Native WS ping/pong instead of application-level — reduces overhead
- Rate limiting per-connection with configurable limit
- Reconnect grace period preserves pending requests — good UX
- `noServer` mode for WS — proper pattern for path-based routing
- `maxPayload` set on WebSocketServer — prevents unbounded memory
- TCP relay has connection limits, rate limits, idle timeouts
- Clean shutdown path with `closeAll()`

---

## Recommended Actions (Priority Order)

1. **[H1-H3]** Add readyState guards to all `ws.send()` / `wsSocket.send()` calls — extract a shared `safeSend(ws, msg)` utility into shared or server utils
2. **[H4]** Add minimal runtime validation in `parseMessage()` — at least check `typeof parsed.type === 'string'`
3. **[M1]** Hoist `customAlphabet` to module scope
4. **[M3]** Add reconnect guard flag in TunnelClient
5. **[M4]** Decide on MAX_BODY_SIZE: 10MB (per security spec) or 50MB (current), update whichever is wrong

---

## Metrics

- Type Coverage: High (strict mode, all interfaces typed, `as` casts limited to JSON parse)
- Test Coverage: 19/19 passing
- Linting: Clean on source
- Build: Clean

---

## Unresolved Questions

1. Is 50MB `MAX_BODY_SIZE` intentional or should it be 10MB per security spec?
2. Should `PingMessage`/`PongMessage` types be removed from protocol since native WS ping/pong is used?
3. Should a shared `safeSend(ws, data)` utility live in `@tunelo/shared` or be server-only?
