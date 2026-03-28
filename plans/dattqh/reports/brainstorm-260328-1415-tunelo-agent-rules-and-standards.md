# Brainstorm: Tunelo Agent Rules & Coding Standards
**Date:** 2026-03-28 | **Status:** Agreed

---

## Problem Statement

Tunelo is 100% developed by Claude Code Agent. Need comprehensive rules, coding standards, and security guidelines so the agent can:
- Understand codebase structure and conventions
- Write consistent, secure, maintainable code
- Handle tunnel proxy security concerns properly
- Self-validate code quality without human review

---

## Agreed Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Package manager | pnpm | Fast, strict, workspace support |
| Linting | Biome | All-in-one lint+format, 10-20x faster than ESLint+Prettier |
| Testing | vitest | Native TS, fast, monorepo-friendly |
| Logging | pino | JSON structured logs, minimal overhead |
| Error handling | Structured errors + codes | Custom error classes, error codes (TUNELO_xxx), consistent JSON responses |
| Security level | MVP sufficient | API key auth, basic validation, no obvious vulns. Harden later |

---

## Deliverables

### 1. CLAUDE.md (Project-level agent instructions)
Location: `./CLAUDE.md`

Content:
- Project overview (what Tunelo is, architecture summary)
- Monorepo structure map (packages/server, client, shared)
- Development commands (dev, build, test, lint)
- Coding conventions reference (point to docs/)
- Security rules specific to tunnel proxy
- What NOT to do (common pitfalls)

### 2. docs/ directory

| File | Purpose |
|------|---------|
| `project-overview-pdr.md` | What Tunelo is, goals, constraints, architecture |
| `code-standards.md` | TypeScript conventions, error handling, logging, naming |
| `system-architecture.md` | WebSocket relay architecture, component interactions, data flow |
| `design-guidelines.md` | CLI UX patterns, terminal output format |
| `deployment-guide.md` | VPS setup, nginx, certbot, PM2 |
| `project-roadmap.md` | MVP phases, future features |

---

## Code Standards Detail

### TypeScript Conventions
- Strict mode (`strict: true` in tsconfig)
- No `any` — use `unknown` + type guards
- Prefer `interface` over `type` for object shapes
- Use discriminated unions for WS protocol messages
- Explicit return types on exported functions
- No default exports — use named exports only

### File Naming
- kebab-case for all files: `tunnel-manager.ts`, `request-relay.ts`
- Max 200 lines per file — split if exceeds
- Descriptive names: agent should understand purpose from filename

### Error Handling Pattern
```typescript
// Custom error class
class TuneloError extends Error {
  constructor(
    public code: string,      // TUNELO_AUTH_001
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'TuneloError';
  }
}

// Error codes
TUNELO_AUTH_001: "Invalid API key"
TUNELO_AUTH_002: "API key required"
TUNELO_TUNNEL_001: "Subdomain already in use"
TUNELO_TUNNEL_002: "No tunnel found for subdomain"
TUNELO_TUNNEL_003: "Tunnel connection lost"
TUNELO_RELAY_001: "Request timeout"
TUNELO_RELAY_002: "Response too large"
TUNELO_SERVER_001: "Server startup failed"
```

### Logging Pattern
```typescript
// pino with context
const logger = pino({ name: 'tunelo-server' });
logger.info({ subdomain, clientIp }, 'tunnel registered');
logger.error({ code: err.code, subdomain }, 'relay failed');
// NO: logger.info('tunnel registered for ' + subdomain) — not structured
```

### Testing Pattern
```typescript
// vitest, co-located tests
// packages/server/src/__tests__/tunnel-manager.test.ts
describe('TunnelManager', () => {
  it('should register tunnel with subdomain', () => { ... });
  it('should reject duplicate subdomain', () => { ... });
  it('should cleanup on disconnect', () => { ... });
});
```

---

## Security Rules (MVP)

### Tunnel Proxy Specific Threats

| Threat | Mitigation |
|--------|-----------|
| **Unauthorized tunnel creation** | API key validation on WS connect |
| **Subdomain squatting** | First-come-first-served, key ownership check |
| **Header injection** | Sanitize headers before relay, strip hop-by-hop headers |
| **Request smuggling** | Validate Content-Length, reject ambiguous requests |
| **DoS via large payloads** | Max body size 10MB, reject oversized |
| **WS flood** | Max messages/sec per connection (100 msg/s) |
| **Subdomain enumeration** | Random subdomain if not specified (nanoid) |
| **Internal network access** | Client only proxies to specified localhost port |

### Security Coding Rules for Agent

1. **Never trust client input** — validate subdomain format, headers, body size
2. **Sanitize WS messages** — parse JSON safely, validate schema before processing
3. **Strip dangerous headers** — remove `X-Forwarded-*` from tunnel responses (server sets these)
4. **No eval/exec** — never use `eval()`, `Function()`, `child_process.exec()` with user input
5. **API keys** — store hashed (SHA-256), never log plaintext keys
6. **Rate limit WS messages** — drop connection if exceeding 100 msg/s
7. **Timeout everything** — HTTP relay timeout 30s, WS ping/pong 30s
8. **Subdomain validation** — regex: `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$` (RFC 1123)

### Headers to Strip (Hop-by-Hop)
```
Connection, Keep-Alive, Proxy-Authenticate, Proxy-Authorization,
TE, Trailers, Transfer-Encoding, Upgrade
```

---

## CLAUDE.md Structure

```markdown
# CLAUDE.md

## Project Overview
Tunelo — self-hosted ngrok alternative. WebSocket relay tunnel proxy.

## Architecture
[1-paragraph summary + link to docs/system-architecture.md]

## Monorepo Structure
packages/server — Tunnel server (Node.js, deployed to VPS)
packages/client — CLI tool (npm package)
packages/shared — Shared types & protocol

## Commands
pnpm install          — Install all deps
pnpm dev:server       — Dev server (tsx watch)
pnpm dev:client       — Dev client
pnpm build            — Build all packages
pnpm test             — Run all tests (vitest)
pnpm lint             — Lint + format check (biome)
pnpm lint:fix         — Auto-fix lint issues

## Coding Rules
- Read docs/code-standards.md before writing code
- TypeScript strict mode, no `any`
- Named exports only, no default exports
- Max 200 lines per file
- kebab-case filenames
- Structured errors with TUNELO_xxx codes
- pino for logging (JSON structured)
- vitest for tests (__tests__/ directories)

## Security Rules
[Summary + link to docs/code-standards.md#security]

## What NOT to Do
- Never use `any` type
- Never log API keys or sensitive data
- Never use eval() or exec() with user input
- Never skip input validation on WS messages
- Never commit .env files
- Never store plaintext API keys
```

---

## Implementation Considerations

### Agent-Friendly Patterns
1. **Self-documenting code** — descriptive variable names, JSDoc on complex functions
2. **Small files** — agent context window works better with focused files
3. **Explicit imports** — no barrel files (index.ts re-exports), import directly
4. **Co-located tests** — `__tests__/` next to source, not separate test/ tree
5. **Type-first** — define types in shared package first, import everywhere

### Biome Config
```json
{
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "semicolons": "always", "quoteStyle": "single" } },
  "organizeImports": { "enabled": true }
}
```

### pnpm Workspace
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

### tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## Success Metrics

- [ ] Agent can read CLAUDE.md and understand full project context
- [ ] Agent follows coding standards without reminders
- [ ] All code passes `pnpm lint` without manual fixes
- [ ] Security rules prevent common tunnel proxy vulnerabilities
- [ ] Error handling is consistent across all packages
- [ ] Tests follow established patterns

---

## Unresolved Questions

1. **ESM vs CJS?** — Recommend ESM (`"type": "module"` in package.json) since Node 20+ supports it natively. But some deps (chalk v5) are ESM-only while others may need CJS. Decision: **ESM** with fallback guidance.
2. **Monorepo build tool?** — `tsc` only or add `tsup` for bundling client CLI? Recommend: `tsc` for dev, `tsup` only when building npm package for distribution.
3. **Config file format for API keys?** — JSON file (`keys.json`) or env var? Recommend: env var for single key, JSON file for multi-key. Start with env var.
