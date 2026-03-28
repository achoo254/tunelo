# Code Review: Tunelo v0.2 Feature Expansion

**Date:** 2026-03-28
**Reviewer:** code-reviewer agent
**Scope:** 6 phases — Basic Auth, Multi-Tunnel, Multiple Tunnels Client, Web Inspector, Replay, TCP Tunnel

## Scope

- **Files reviewed:** 20 source files across shared/server/client packages
- **LOC (new/modified):** ~1,600 lines
- **Build:** PASS (all 3 packages compile)
- **Tests:** 19/19 PASS (4 test files)
- **Lint:** 90 errors — all in `dist/` (generated output), 0 in source files

## Overall Assessment

Solid implementation across all 6 phases. Code is well-structured, follows project conventions (kebab-case, named exports, pino logging, structured errors). Security fundamentals are sound — timing-safe auth comparison, rate limiting, input validation. Several medium-priority issues found mostly around edge cases, resource cleanup, and missing validation.

---

## Critical Issues

### C1. Inspector server has no body size limit on custom replay (inspector-server.ts:168)

The `collectBody()` helper collects request body without size limit. An attacker on the local network could send a massive POST to `/api/replay` and exhaust memory.

```typescript
// Current — no limit
function collectBody(req, cb) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => cb(Buffer.concat(chunks).toString("utf-8")));
}
```

**Fix:** Add a size check (e.g., 1MB) and destroy the request if exceeded.

### C2. TCP relay listens on 0.0.0.0 — exposes ports to all interfaces (tcp-relay.ts:120)

```typescript
server.listen(remotePort, "0.0.0.0", () => { ... });
```

TCP tunnels bind to all interfaces. If the VPS has multiple interfaces, this exposes tunnel ports beyond what nginx controls. Unlike HTTP tunnels (which go through nginx TLS), TCP tunnels are raw and unencrypted.

**Recommendation:** Document this as intentional (TCP tunnels need public binding) or make the bind address configurable. At minimum, ensure firewall rules are documented in deployment guide.

### C3. No authentication on TCP tunnel registration (tcp-ws-handler.ts:23)

Any authenticated WS client can register TCP tunnels without additional authorization checks. There's no per-key limit on TCP tunnel count, no validation of requested remote port range beyond the port manager's range check.

**Recommendation:** Add a configuration flag to enable/disable TCP tunnels per API key, and enforce per-key TCP tunnel limits.

---

## High Priority

### H1. Dead code / shadowed function in tcp-relay.ts (lines 64 vs 159)

There are two `resetIdle` definitions:
- Line 64: Arrow function inside the `createServer` callback (correct, has closure over `tcpSocket`)
- Line 159: Function declaration at module scope (incorrect — creates a no-op timer)

The hoisted function at line 159 is dead code but could cause confusion. The inner arrow function correctly shadows it.

**Fix:** Remove the dead function at line 159-161.

### H2. `MAX_BODY_SIZE` increased to 50MB from documented 10MB (constants.ts:7)

```typescript
MAX_BODY_SIZE: 50 * 1024 * 1024,
```

The code standards document says "Max body size: 10 MB". The constant is 50MB. This is a 5x increase that affects memory per concurrent request. With 5,000 concurrent tunnels, worst case = 250GB memory.

**Recommendation:** Revert to 10MB or update docs to reflect the intentional change.

### H3. WS rate limit increased from 100 to 1000 msg/s (constants.ts:14)

```typescript
WS_RATE_LIMIT: 1000,
```

Documented limit is 100 msg/s. This 10x increase could allow flood attacks on a shared server.

**Recommendation:** Same as H2 — align constant with docs or update docs.

### H4. TCP data broadcast to all relays (tcp-ws-handler.ts:71-74)

```typescript
socket.on("tcp-data", (msg) => {
  const data = Buffer.from(msg.data, "base64");
  for (const relay of relays.values()) {
    relay.writeToConnection(msg.connectionId, data);
  }
});
```

When a client has multiple TCP tunnels, data is forwarded to ALL relays, not just the one owning the connectionId. Each relay's `writeToConnection` silently ignores unknown connectionIds, so this is functionally correct but wasteful (O(n) per message where n = number of TCP tunnels per client).

**Fix:** Maintain a `connectionId -> relay` mapping, or break after the first match.

### H5. Reconnect clears subdomainPortMap but re-registers tunnels (tunnel-client.ts:202)

On reconnect, `subdomainPortMap` is cleared (line 202), then `connect()` re-registers tunnels. But the `auth-result` handler re-adds the primary subdomain. If the auto-generated subdomain changes on reconnect (which it will since it's random), old subdomain mappings become orphaned on the server during grace period.

**Impact:** After reconnect, requests to the old subdomain during grace period will route to the reconnected socket but the client no longer maps that subdomain to a port, falling back to the default port (which may be wrong for multi-tunnel).

---

## Medium Priority

### M1. No `biome.json` config — dist/ included in lint (build config)

The `pnpm lint` command runs `biome check .` with no config file. All 90 lint errors are in `dist/` output. Add a `biome.json` with:

```json
{
  "files": {
    "ignore": ["**/dist/**", "**/node_modules/**"]
  }
}
```

### M2. Request relay doesn't strip hop-by-hop headers from incoming request (request-relay.ts:88-89)

The `headers` are passed through raw to the tunnel request:

```typescript
headers: req.headers as Record<string, string | string[]>,
```

Only the client-side `local-proxy.ts` strips hop-by-hop headers. The server should also sanitize before sending through WS.

### M3. `auth.ts` accepts all connections when no keys loaded (auth.ts:39-40)

```typescript
if (apiKeyHashes.size === 0) return true;
```

This "dev mode" behavior is dangerous in production. If the keys file fails to load (file deleted, permissions error), the server silently accepts all connections.

**Recommendation:** Add a startup flag `--require-auth` or env var to make key loading mandatory.

### M4. Inspector SSE listener leak potential (inspector-server.ts:50-54)

The `store.onAdd` listener is registered once but never cleaned up when the server closes. If `startInspectorServer` is called multiple times (unlikely but possible), listeners accumulate.

### M5. `TcpProxy` doesn't clean up WS event listeners on close (tcp-proxy.ts:103-108)

The `close()` method destroys local sockets but doesn't remove the `tcp-connection-open`, `tcp-data`, `tcp-connection-close` handlers from the WS socket. If the WS socket is reused (e.g., reconnect scenario), duplicate handlers could attach.

### M6. `closeAll()` in tunnel-manager iterates and mutates during loop (tunnel-manager.ts:224-228)

```typescript
for (const [subdomain, tunnel] of this.tunnels) {
  tunnel.socket.disconnect(true);
  this.unregister(subdomain);  // Modifies this.tunnels
}
```

`unregister()` calls `this.tunnels.delete(subdomain)` — mutating the Map while iterating. This is safe in V8's current Map implementation but is technically undefined behavior per spec.

**Fix:** Collect keys first, then iterate.

### M7. Custom replay doesn't route to correct port for multi-tunnel (inspector-integration.ts:69-80)

Custom replay always uses `defaultPort` regardless of which subdomain the user intended. The edit modal has no subdomain selector.

### M8. Port validation allows port 0 implicitly (tunnel-config-parser.ts:39)

```typescript
if (Number.isNaN(port) || port < 1 || port > 65535)
```

This is correct (rejects 0), but `Number("0")` = 0 which is rejected. Good.
However, `Number("0.5")` = 0.5 which passes validation. Add `!Number.isInteger(port)` check.

---

## Low Priority

### L1. Version hardcoded in two places (cli.ts:14, cli-tcp-command.ts:41)

Both files have `.version("0.1.0")` / `showBanner("0.1.0")`. Should read from `package.json`.

### L2. `isRefused` ternary is redundant (local-proxy.ts:81-82)

```typescript
status: isRefused ? 502 : 502,
```

Both branches return 502. Simplify to just `status: 502`.

### L3. Inspector HTML is a single 165-line string (inspector-ui.ts)

This is acceptable for an embedded dashboard but makes it hard to maintain. Consider extracting CSS and JS if the UI grows.

### L4. `rateLimitInterval` in ws-handler.ts leaks if socket never authenticates and times out

The `clearInterval(rateLimitInterval)` is only in the `disconnect` handler. If the auth timer fires first and disconnects the socket, the disconnect event does fire (Socket.IO fires disconnect on programmatic disconnect), so this is fine. No issue.

---

## Edge Cases Found

1. **Grace period + auth change:** If client disconnects, a new client reconnects with the same subdomain but different auth credentials, the orphaned requests from the old session are recovered. The old pending HTTP requests may now respond through a tunnel with different auth settings.

2. **TCP tunnel port exhaustion:** If all 1000 ports (10000-10999) are allocated, new TCP registrations fail silently with an error message. No backpressure or queue — reasonable for MVP.

3. **Multi-tunnel reconnect subdomain mismatch:** As noted in H5, auto-generated subdomains change on reconnect, breaking multi-tunnel routing during grace periods.

4. **Inspector store unbounded growth within ring buffer size:** Each entry can hold up to 1MB request body + 1MB response body. With 500 entries max, worst case memory = ~1GB. Acceptable for a dev tool but worth documenting.

5. **TCP idle timer reset race:** In `tcp-relay.ts`, `clearTimeout` + `resetIdle()` is not atomic. Under extreme load, a race between the close handler and data handler could leak a timer. Very unlikely in practice.

---

## Positive Observations

1. **Timing-safe auth comparison** — `tunnel-auth-checker.ts` correctly uses `timingSafeEqual` with SHA-256 hashing. Proper constant-time comparison prevents timing attacks.

2. **Clean separation of concerns** — Each new feature is in its own file with clear boundaries. TCP relay, port manager, WS handler are well-isolated.

3. **Ring buffer with eviction** — `RequestStore` properly evicts oldest entries, preventing unbounded growth.

4. **Rate limiting at multiple layers** — WS messages, TCP connections, replay API all have rate limiters.

5. **Grace period for reconnect** — Orphaned request handling is a thoughtful UX improvement that prevents request loss during brief disconnects.

6. **Inspector UI is self-contained** — No external dependencies, SSE for real-time updates, proper CORS headers. Clean implementation.

7. **Multi-tunnel protocol** — Clean extension of the auth flow. `register-tunnel` on existing WS is a good design.

---

## Recommended Actions (Priority Order)

1. **[C1]** Add body size limit to inspector's `collectBody()`
2. **[C3]** Add per-key TCP tunnel authorization / limits
3. **[H1]** Remove dead `resetIdle` function in tcp-relay.ts:159-161
4. **[H2/H3]** Align `MAX_BODY_SIZE` and `WS_RATE_LIMIT` with documentation (or update docs)
5. **[H4]** Fix TCP data broadcast — route to correct relay only
6. **[M1]** Add `biome.json` to exclude `dist/` from linting
7. **[M2]** Strip hop-by-hop headers server-side before WS relay
8. **[M3]** Add mandatory auth mode for production
9. **[M6]** Fix concurrent modification in `closeAll()`
10. **[L2]** Fix redundant ternary in local-proxy.ts

## Metrics

| Metric | Value |
|--------|-------|
| Build | PASS |
| Tests | 19/19 PASS |
| Source lint errors | 0 |
| Dist lint errors | 90 (config issue) |
| Files >200 lines | 1 (inspector-ui.ts at 169 — HTML template, acceptable) |
| `any` usage | 0 in source |
| Test coverage | Not measured (no coverage flag) |

## Unresolved Questions

1. Is the `MAX_BODY_SIZE` increase to 50MB intentional? If so, docs need updating.
2. Is the `WS_RATE_LIMIT` increase to 1000 msg/s intentional? Same concern.
3. Should TCP tunnels require separate authorization beyond initial WS auth?
4. Is binding TCP relay to `0.0.0.0` the intended production config, or should it be configurable?
5. Are there plans for test coverage of the 6 new features? Current tests only cover auth + relay basics.
