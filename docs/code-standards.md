# Code Standards

## TypeScript Configuration

- **Target:** ES2022
- **Module:** NodeNext (ESM)
- **Strict mode:** enabled (`strict: true`, `noUncheckedIndexedAccess: true`)
- **No `any`** — use `unknown` + type guards for dynamic data
- **Explicit return types** on all exported functions
- **Named exports only** — no `export default`

## File Organization

- **Max 200 lines** per file — split into focused modules if exceeds
- **kebab-case** filenames: `tunnel-manager.ts`, `ws-handler.ts`
- **Co-located tests:** `src/__tests__/tunnel-manager.test.ts`
- **No barrel files** — import directly from source, not `index.ts` re-exports
- **Descriptive names** — filename should explain purpose without reading content

## Package Structure

Each package follows:
```
packages/{name}/
├── src/
│   ├── __tests__/
│   │   └── {module}.test.ts
│   ├── {module}.ts
│   └── ...
├── package.json
└── tsconfig.json
```

## Error Handling

### TuneloError Class

All errors must use the structured `TuneloError` class from `@tunelo/shared`:

```typescript
import { TuneloError } from '@tunelo/shared';

// Throw with code + message + HTTP status
throw new TuneloError('TUNELO_AUTH_001', 'Invalid API key', 401);

// Catch and handle
try {
  await relayRequest(req);
} catch (err) {
  if (err instanceof TuneloError) {
    logger.error({ code: err.code, details: err.details }, err.message);
    return sendError(res, err);
  }
  // Unknown error — wrap it
  logger.error({ err }, 'unexpected error');
  throw new TuneloError('TUNELO_SERVER_001', 'Internal server error', 500, err);
}
```

### Error Code Convention

Format: `TUNELO_{DOMAIN}_{NUMBER}`

| Domain | Prefix | Range |
|--------|--------|-------|
| Authentication | `TUNELO_AUTH_` | 001-099 |
| Tunnel management | `TUNELO_TUNNEL_` | 001-099 |
| Request relay | `TUNELO_RELAY_` | 001-099 |
| Server | `TUNELO_SERVER_` | 001-099 |
| Client | `TUNELO_CLIENT_` | 001-099 |

### Error Response Format

All HTTP error responses use consistent JSON:

```json
{
  "error": {
    "code": "TUNELO_TUNNEL_002",
    "message": "No tunnel found for subdomain"
  }
}
```

## Logging

### pino Logger

```typescript
import pino from 'pino';

// Create logger with service name
export const logger = pino({ name: 'tunelo-server' });

// Structured logging — always object first, message second
logger.info({ subdomain, clientIp }, 'tunnel registered');
logger.warn({ subdomain, msgPerSec: count }, 'rate limit approaching');
logger.error({ code: err.code, subdomain }, 'relay failed');
```

### Rules
- **Always structured** — pass context object as first arg
- **Never string concat** — `logger.info({ x }, 'msg')` not `logger.info('msg ' + x)`
- **Never log secrets** — API keys, tokens, passwords
- **Log levels:** `error` (failures), `warn` (degraded), `info` (state changes), `debug` (dev only)

## Testing

### vitest Patterns

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('TunnelManager', () => {
  let manager: TunnelManager;

  beforeEach(() => {
    manager = new TunnelManager();
  });

  it('should register tunnel with subdomain', () => {
    const ws = createMockWs();
    manager.register('myapp', ws, 'key_123');
    expect(manager.lookup('myapp')).toBeDefined();
  });

  it('should reject duplicate subdomain', () => {
    const ws = createMockWs();
    manager.register('myapp', ws, 'key_123');
    expect(() => manager.register('myapp', ws, 'key_456'))
      .toThrow(TuneloError);
  });
});
```

### Rules
- Test file naming: `{module}.test.ts` in `__tests__/` dir
- One describe per module/class
- Test happy path + error cases + edge cases
- No mocking of internal modules — mock only external I/O (network, fs)
- Use `vitest` built-in mocks, not separate mock libraries

## Linting & Formatting

### Biome

Single config at root `biome.json`:
- Indent: 2 spaces
- Semicolons: always
- Quotes: single
- Organize imports: enabled
- Recommended rules: enabled

Run before every commit:
```bash
pnpm lint        # check only
pnpm lint:fix    # auto-fix
```

## Security

### Input Validation

All external input must be validated at system boundaries:

```typescript
// Subdomain validation
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function validateSubdomain(subdomain: string): boolean {
  return SUBDOMAIN_REGEX.test(subdomain);
}

// WS message validation — always try-catch JSON.parse
function parseWsMessage(data: unknown): TunnelMessage {
  if (typeof data !== 'string') {
    throw new TuneloError('TUNELO_RELAY_001', 'Invalid message format');
  }
  const parsed: unknown = JSON.parse(data);
  // Type guard validation...
  return validated;
}
```

### Headers

Strip hop-by-hop headers before relay:
```
Connection, Keep-Alive, Proxy-Authenticate, Proxy-Authorization,
TE, Trailers, Transfer-Encoding, Upgrade
```

Server sets its own forwarding headers:
```
X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host
```

### Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max body size | 10 MB | Prevent memory exhaustion |
| WS message rate | 100 msg/s | Prevent flood |
| HTTP relay timeout | 30 s | Prevent hung connections |
| WS ping interval | 30 s | Detect dead connections |
| Subdomain length | 1-63 chars | RFC 1123 |
| Max tunnels per key | 10 | Prevent abuse (MVP) |

### API Key Storage

- Server stores SHA-256 hashes, never plaintext
- Keys loaded from `TUNELO_API_KEYS` env var (comma-separated hashes)
- Client stores key in `~/.tunelo/config.json` (user's machine, acceptable)
