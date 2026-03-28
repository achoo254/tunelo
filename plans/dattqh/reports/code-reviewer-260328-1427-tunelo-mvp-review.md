# Code Review: Tunelo MVP Implementation

## Scope
- **Files:** 12 source files across 3 packages (shared, server, client)
- **LOC:** 849 total (all files under 200-line limit)
- **Tests:** 2 unit test files + 2 E2E test files (19 tests, 1 failing)
- **Build:** Passes cleanly (tsc compiles all 3 packages)
- **Lint:** Biome format issues in JSON files (spaces vs tabs) -- minor

## Overall Assessment

Solid MVP architecture. Clean separation: shared protocol types, server relay, client CLI. Code is readable, well-structured, and follows most project conventions. Several security gaps need addressing before production.

---

## Critical Issues

### C1. API Keys Stored and Compared in Plaintext
**File:** `packages/server/src/auth.ts`
**Standard violated:** `docs/code-standards.md` line 209-210: "Server stores SHA-256 hashes, never plaintext"

Auth module loads keys from JSON and compares with `Set.has()` -- no hashing. Plaintext keys in memory and on disk.

**Fix:** Hash keys on load, hash incoming key before comparison:
```typescript
import { createHash } from 'node:crypto';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function loadApiKeys(filePath: string): Set<string> {
  const data = JSON.parse(readFileSync(filePath, 'utf-8')) as { keys: string[] };
  apiKeys = new Set(data.keys.map(hashKey));
  // ...
}

export function validateApiKey(key: string): boolean {
  if (apiKeys.size === 0) return true;
  return apiKeys.has(hashKey(key));
}
```

### C2. No WS Message Rate Limiting
**Standard violated:** `docs/code-standards.md` line 202: "WS message rate: 100 msg/s -- Prevent flood"

`ws-handler.ts` processes every incoming message with no rate limiting. A malicious client can flood the server with messages, exhausting CPU.

**Fix:** Add per-connection message counter with sliding window:
```typescript
let msgCount = 0;
const rateResetInterval = setInterval(() => { msgCount = 0; }, 1000);

ws.on('message', (data) => {
  msgCount++;
  if (msgCount > 100) {
    ws.close(1008, 'Rate limit exceeded');
    return;
  }
  // ... existing handler
});
```

### C3. No Max Response Body Size on Client Proxy
**File:** `packages/client/src/local-proxy.ts`

Server enforces `MAX_BODY_SIZE` on incoming requests, but client proxy collects entire response from localhost without any limit. A local service returning a huge response could exhaust client memory and crash the WS connection.

**Fix:** Add size check in `proxyRequest` response collection, matching `DEFAULTS.MAX_BODY_SIZE`.

---

## High Priority

### H1. `nanoid(8)` Generates Invalid Subdomains (~15% failure rate)
**Files:** `packages/server/src/ws-handler.ts:102`, `tests/e2e/test-helpers.ts:101`

`nanoid(8).toLowerCase()` produces characters like `_` and can start/end with `-`, failing `SUBDOMAIN_REGEX`. This is the **root cause of the failing E2E test** (`random subdomain assigned when not specified`).

**Fix:** Use `nanoid` with custom alphabet:
```typescript
import { customAlphabet } from 'nanoid';
const generateSubdomain = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
```

### H2. No `TuneloError` Class Used Anywhere
**Standard violated:** `docs/code-standards.md` lines 36-58

Code standards mandate `TuneloError` class with error codes, but it doesn't exist in `@tunelo/shared` and is never used. All errors use plain `Error` or inline strings. Error codes from `ErrorCode` enum don't follow the `TUNELO_xxx` naming convention from CLAUDE.md.

**Fix:** Create `TuneloError` class in shared package; refactor server/client to throw/catch it.

### H3. Missing `X-Forwarded-*` Headers
**Standard violated:** `docs/code-standards.md` lines 193-196

Relay handler (`request-relay.ts`) does not set `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` headers before forwarding to client. Backend services behind tunnel won't know the original client IP or protocol.

**Fix:** Add forwarded headers in `createRelayHandler` before sending to tunnel:
```typescript
tunnelReq.headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';
tunnelReq.headers['x-forwarded-proto'] = 'https';
tunnelReq.headers['x-forwarded-host'] = req.headers.host ?? '';
```

### H4. No Max Tunnels Per API Key Enforcement
**Standard violated:** `docs/code-standards.md` line 207: "Max tunnels per key: 10"

`TunnelManager` has no concept of key-to-tunnel-count mapping. A single key can open unlimited tunnels.

**Fix:** Track tunnel count per key in `TunnelManager.register()`, reject when >= 10.

### H5. Unhandled Error in `handleRequest` (Client)
**File:** `packages/client/src/tunnel-client.ts:95-105`

`handleRequest` is `async` but caller doesn't `await` or catch. If `proxyRequest` throws, the rejection is unhandled. Also, if `this.ws` is null by the time response is ready, `send` will throw.

**Fix:**
```typescript
private handleRequest(request: TunnelRequest): void {
  proxyRequest(request, this.options.localPort, this.options.localHost)
    .then((response) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(response));
      }
    })
    .catch((err) => this.emit('error', err));
  // emit request event in .then() after send
}
```

---

## Medium Priority

### M1. `shared/src/index.ts` Is a Barrel File
**Standard violated:** CLAUDE.md: "Never use barrel files (`index.ts` re-exports) -- import directly"

`packages/shared/src/index.ts` re-exports from `protocol.js` and `constants.js`. All imports use `@tunelo/shared` which resolves to this barrel.

**Recommendation:** Since shared is a proper npm package, this is acceptable for external API. However, note the convention violation. Could configure package.json `exports` map to avoid barrel.

### M2. `extractSubdomain` Doesn't Handle Port in Host
**File:** `packages/server/src/request-relay.ts:9-13`

Regex `^([^.]+)\.${domainEscaped}` won't match `myapp.tunnel.inetdev.io.vn:3001` because port isn't stripped. But the test `request-relay.test.ts:9-11` expects it to work with port.

**Wait** -- actually `[^.]` does match `:3001` since it matches everything except `.`. Let me re-check: the regex would match `myapp` from `myapp.tunnel.inetdev.io.vn:3001` because `tunnel.inetdev.io.vn:3001` doesn't match `tunnel\.inetdev\.io\.vn` (`:3001` suffix fails the match).

**Fix:** Strip port before matching: `const hostWithoutPort = host.replace(/:\d+$/, '');`

Actually, looking again at the test -- it passes. The regex matches because the domain part `tunnel.inetdev.io.vn` appears in `tunnel.inetdev.io.vn:3001` as a substring (no `$` anchor). This works by accident, not by design. Adding a `$` anchor or port-stripped host would be more correct.

### M3. `watchFile` Is Polling-Based
**File:** `packages/server/src/auth.ts:20-24`

`fs.watchFile` uses polling (5s interval). For production, `fs.watch` (inotify-based) is more efficient, though less portable.

**Recommendation:** Low-priority for MVP. Consider switching to `chokidar` or `fs.watch` later.

### M4. Config File Stores API Key in Plaintext
**File:** `packages/client/src/config.ts`

API key stored plaintext in `~/.tunelo/config.json`. Code standards say "Client stores key in `~/.tunelo/config.json` (user's machine, acceptable)" so this is by design, but worth noting for security-conscious users. Consider file permissions (0600).

### M5. `closeAll()` Iteration Bug
**File:** `packages/server/src/tunnel-manager.ts:94-99`

Iterating over `this.tunnels` while `unregister` deletes from it. `Map.delete()` during `for...of` is safe in JS, but `unregister` also calls `tunnel.pendingRequests.clear()`. The real issue: `ws.close()` triggers the `ws.on('close')` handler which calls `unregister` again (double unregister).

**Fix:** Collect subdomains first, then iterate:
```typescript
closeAll(): void {
  const subdomains = [...this.tunnels.keys()];
  for (const subdomain of subdomains) {
    const tunnel = this.tunnels.get(subdomain);
    if (tunnel) {
      this.unregister(subdomain);
      tunnel.ws.close();  // close AFTER unregister to avoid double-call
    }
  }
}
```

---

## Low Priority

### L1. Biome Format Issues in JSON Files
tsconfig.json and package.json files use spaces instead of tabs. Run `pnpm lint:fix`.

### L2. `ErrorCode` Enum vs `TUNELO_xxx` String Codes
`ErrorCode` enum uses `AUTH_FAILED`, `SUBDOMAIN_TAKEN` etc. but CLAUDE.md error table uses `TUNELO_AUTH_001` format. These should be reconciled.

### L3. Duplicate Status Code in `local-proxy.ts:58`
```typescript
status: isRefused ? 502 : 502,  // Both branches return 502
```
The ternary is pointless. Likely intended different status for non-refused errors (e.g., 500).

### L4. `reconnect()` Creates Nested Promise Chains
`tunnel-client.ts:107-120`: reconnect calls `connect()` which creates new WS and new event handlers. Each reconnect adds new `close` handlers that could trigger additional reconnects. Should clean up previous handlers.

---

## Positive Observations

1. **Clean monorepo structure** -- shared types ensure protocol consistency between server/client
2. **All files under 200 lines** -- good modularization discipline
3. **No `any` types** -- strict TypeScript enforced throughout
4. **No `console.log` in server** -- pino used consistently
5. **Named exports only** -- convention followed
6. **kebab-case filenames** -- consistent throughout
7. **Hop-by-hop header stripping** -- correctly implemented in local-proxy
8. **Body size enforcement** -- server-side MAX_BODY_SIZE check works
9. **Graceful shutdown** -- SIGTERM/SIGINT handling with forced exit timeout
10. **Auth timeout** -- 10s timeout prevents unauthenticated connections from lingering
11. **Base64 body encoding** -- correct approach for binary-safe WS relay

---

## Test Status

| Suite | Tests | Status |
|-------|-------|--------|
| Unit: auth | 4 | PASS |
| Unit: request-relay | 5 | PASS |
| E2E: tunnel-flow | 5 | PASS |
| E2E: auth-flow | 4/5 | 1 FAIL |

**Failing:** `random subdomain assigned when not specified` -- root cause is `nanoid(8)` generating regex-invalid subdomains (see H1).

## Metrics

- **Type Coverage:** High (no `any` found, strict mode enabled)
- **Test Coverage:** Partial -- no tests for ws-handler, tunnel-manager, tunnel-client, local-proxy, display, config
- **Linting Issues:** Format-only (JSON indentation tabs vs spaces)

## Recommended Actions (Priority Order)

1. **Fix `nanoid` subdomain generation** (H1) -- fixes failing test, quick win
2. **Hash API keys** (C1) -- security requirement per code standards
3. **Add WS rate limiting** (C2) -- critical for production security
4. **Add response body size limit** (C3) -- memory safety
5. **Create `TuneloError` class** (H2) -- align with documented error handling pattern
6. **Add `X-Forwarded-*` headers** (H3) -- required for correct proxying
7. **Add per-key tunnel limit** (H4) -- abuse prevention
8. **Fix `handleRequest` error handling** (H5) -- prevents unhandled rejections
9. **Fix `closeAll()` double-unregister** (M5) -- prevents shutdown race condition
10. **Add missing test coverage** -- ws-handler, tunnel-manager, client modules

## Unresolved Questions

1. Should `nanoid` be replaced entirely with a custom subdomain generator, or is `customAlphabet` sufficient?
2. Should the keys.json file store pre-hashed keys (server never sees plaintext) or should server hash on load?
3. Is the "accept all connections when no keys loaded" (dev mode) behavior intentional for production, or should it require explicit `--dev` flag?
4. Should reconnect logic preserve the same subdomain, or is getting a new random one acceptable?
