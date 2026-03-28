# Phase 6: Integration Testing

## Overview
- **Priority:** P2
- **Status:** completed
- **Effort:** 3h
- **Depends on:** Phase 3, Phase 4
- **Description:** E2E tests validating full tunnel flow, auth, reconnection, and basic load testing.

## Key Insights
- vitest for test runner — already in dev deps
- E2E tests start real server + client, make HTTP requests through tunnel
- Use `localhost` for all tests — no nginx/TLS dependency
- Test against real HTTP server (Express or http.createServer) as local service
- Load test with autocannon to validate concurrency target

## Requirements

### Functional
- E2E: full request/response cycle through tunnel
- Auth: valid key accepted, invalid key rejected
- Multiple HTTP methods (GET, POST, PUT, DELETE)
- Headers and body preservation
- Reconnection: server restart → client reconnects → tunnel resumes
- Error handling: tunnel not found, timeout, body too large

### Non-functional
- Tests run in <30s total
- No external dependencies (network, VPS)
- Reproducible on CI

## Related Code Files

### Files to Create
- `packages/server/src/__tests__/tunnel-manager.test.ts` — unit tests for TunnelManager
- `packages/server/src/__tests__/auth.test.ts` — unit tests for auth
- `packages/server/src/__tests__/request-relay.test.ts` — unit tests for subdomain extraction
- `tests/e2e/tunnel-flow.test.ts` — full E2E tunnel test
- `tests/e2e/auth-flow.test.ts` — auth validation E2E
- `tests/e2e/reconnection.test.ts` — reconnection E2E
- `tests/e2e/helpers.ts` — shared test utilities (start server, start client, local HTTP server)
- `tests/load/load-test.ts` — autocannon load test script

### Files to Modify
- `package.json` — add test scripts
- `vitest.config.ts` — configure test paths

## Implementation Steps

### 1. Test helpers (tests/e2e/helpers.ts)

```typescript
// Start tunnel server on random port, return { server, port, cleanup }
export async function startTunnelServer(options?: {
  port?: number;
  keys?: string[];
}): Promise<{ port: number; cleanup: () => Promise<void> }>

// Start local HTTP server that echoes requests
export async function startLocalServer(port?: number): Promise<{
  port: number;
  requests: Array<{ method: string; path: string; body: string }>;
  cleanup: () => Promise<void>;
}>

// Create tunnel client connected to server
export async function connectClient(options: {
  serverPort: number;
  localPort: number;
  key: string;
  subdomain?: string;
}): Promise<{ client: TunnelClient; cleanup: () => void }>

// Make HTTP request through tunnel
export async function requestThroughTunnel(
  serverPort: number,
  subdomain: string,
  path: string,
  options?: RequestInit
): Promise<{ status: number; headers: Headers; body: string }>
```

### 2. Unit tests — tunnel-manager.test.ts

```typescript
describe('TunnelManager', () => {
  test('register and lookup tunnel')
  test('unregister removes tunnel')
  test('reject duplicate subdomain')
  test('sendRequest returns response when client responds')
  test('sendRequest times out after configured ms')
  test('unregister rejects all pending requests')
  test('getStats returns correct count')
  test('closeAll disconnects everything')
})
```

### 3. Unit tests — auth.test.ts

```typescript
describe('Auth', () => {
  test('loadApiKeys reads keys from file')
  test('validateApiKey returns true for valid key')
  test('validateApiKey returns false for invalid key')
  test('handles missing keys file gracefully')
})
```

### 4. Unit tests — request-relay.test.ts

```typescript
describe('extractSubdomain', () => {
  test('extracts from standard host header')
  test('extracts with port in host')
  test('returns null for bare domain')
  test('returns null for non-matching domain')
})
```

### 5. E2E — tunnel-flow.test.ts

```typescript
describe('Tunnel Flow E2E', () => {
  // Setup: start tunnel server + local server + client
  // Teardown: cleanup all

  test('GET request relayed and response returned', async () => {
    // Make GET to http://localhost:{serverPort}/api/test
    // with Host: myapp.tunnel.inetdev.io.vn
    // Verify response matches local server output
  })

  test('POST with JSON body preserved', async () => {
    // POST with JSON body through tunnel
    // Verify body arrives at local server intact
  })

  test('PUT and DELETE methods work')

  test('custom headers preserved through tunnel')

  test('404 from local service relayed correctly')

  test('large response body handled', async () => {
    // Local server returns 1MB response
    // Verify complete body arrives through tunnel
  })

  test('multiple concurrent requests', async () => {
    // Fire 10 requests simultaneously
    // All should complete with correct responses
  })

  test('tunnel not found returns 502', async () => {
    // Request to unregistered subdomain
    // Expect 502
  })
})
```

### 6. E2E — auth-flow.test.ts

```typescript
describe('Auth Flow E2E', () => {
  test('valid API key connects successfully')
  test('invalid API key rejected with error')
  test('duplicate subdomain rejected')
  test('random subdomain assigned when not specified')
  test('invalid subdomain format rejected')
})
```

### 7. E2E — reconnection.test.ts

```typescript
describe('Reconnection E2E', () => {
  test('client reconnects after server restart', async () => {
    // 1. Connect client
    // 2. Stop server
    // 3. Verify client enters reconnecting state
    // 4. Restart server
    // 5. Verify client reconnects within 5s
    // 6. Verify tunnel works again
  })

  test('client reconnects after WS drop', async () => {
    // Simulate WS connection drop
    // Verify reconnect with backoff
  })
})
```

### 8. Load test — tests/load/load-test.ts

```typescript
import autocannon from 'autocannon';

// Start server + client + local server
// Run autocannon against tunnel:
// - 100 concurrent connections
// - 10s duration
// - Target: >100 req/s, <100ms p99 latency
// Print results

const result = await autocannon({
  url: `http://localhost:${serverPort}`,
  connections: 100,
  duration: 10,
  headers: {
    Host: `loadtest.tunnel.inetdev.io.vn`,
  },
});

console.log('Requests/sec:', result.requests.average);
console.log('Latency p99:', result.latency.p99, 'ms');
assert(result.requests.average > 100, 'Should handle >100 req/s');
assert(result.latency.p99 < 100, 'p99 latency should be <100ms');
```

### 9. Configure vitest

Root `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: ['tests/load/**'],  // Load tests run separately
    testTimeout: 30_000,
  },
});
```

### 10. Package.json scripts

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run tests/e2e/",
    "test:unit": "vitest run packages/",
    "test:load": "tsx tests/load/load-test.ts"
  }
}
```

## Todo List
- [x] Create test helpers (start server, client, local server)
- [x] Write unit tests for TunnelManager
- [x] Write unit tests for auth
- [x] Write unit tests for subdomain extraction
- [x] Write E2E tunnel flow tests (GET, POST, PUT, DELETE, headers, body)
- [x] Write E2E auth flow tests
- [x] Write E2E reconnection tests
- [x] Write load test script with autocannon
- [x] Configure vitest
- [x] Add test scripts to root package.json
- [x] Run all tests — verify passing
- [x] Document test results
- [x] Post-review fixes: nanoid customAlphabet for valid subdomains (H1)

## Success Criteria
- All unit tests pass
- All E2E tests pass
- Reconnection test: client reconnects within 5s
- Load test: >100 req/s with p99 <100ms on local machine
- Total test suite runs in <30s

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Port conflicts in parallel tests | Use random available ports (port 0) |
| Flaky reconnection tests | Use generous timeouts, retry once |
| Load test varies by machine | Set conservative thresholds, document baseline |
| E2E tests slow CI | Keep test count focused, parallelize where possible |

## Next Steps
- After tests pass: deploy to VPS (Phase 5)
- Add CI/CD pipeline (GitHub Actions) in v0.2
- Add WebSocket pass-through tests when implemented
