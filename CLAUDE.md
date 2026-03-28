# CLAUDE.md

## Project Overview

**Tunelo** — self-hosted ngrok alternative. WebSocket relay tunnel proxy that exposes local services via public HTTPS wildcard subdomains (`*.tunnel.inetdev.io.vn`).

- **Tech:** Node.js / TypeScript (ESM, strict mode)
- **Architecture:** WebSocket Relay — nginx (TLS) → Node.js server → WS → client CLI → localhost
- **Target:** 5-10k concurrent tunnels on single VPS

## Monorepo Structure

```
tunelo/
├── packages/
│   ├── server/    # Tunnel server (deployed to VPS)
│   ├── client/    # CLI tool (npm package: tunelo)
│   └── shared/    # Shared types & WS protocol
├── infra/         # nginx, certbot, PM2 configs
├── docs/          # Project documentation
└── plans/         # Implementation plans
```

## Commands

```bash
pnpm install              # Install all deps
pnpm dev:server           # Dev server (tsx --watch)
pnpm dev:client           # Dev client
pnpm build                # Build all packages (tsc)
pnpm test                 # Run all tests (vitest)
pnpm lint                 # Lint + format check (biome check)
pnpm lint:fix             # Auto-fix (biome check --fix)
```

## Coding Rules

Read `docs/code-standards.md` for full details. Quick reference:

- **TypeScript strict** — `strict: true`, no `any` (use `unknown` + type guards)
- **ESM only** — `"type": "module"` in all package.json
- **Named exports only** — no `export default`
- **Max 200 lines/file** — split if exceeds
- **kebab-case filenames** — `tunnel-manager.ts`, `request-relay.ts`
- **Structured errors** — `TuneloError` class with `TUNELO_xxx` error codes
- **pino logging** — JSON structured, never string concatenation
- **vitest** — co-located `__tests__/` directories
- **Biome** — lint + format, run before commit

## Security Rules

This is a **tunnel proxy** — it relays untrusted HTTP traffic. Critical rules:

1. **Validate all WS messages** — JSON.parse in try-catch, validate schema with type guards
2. **Sanitize headers** — strip hop-by-hop headers (`Connection`, `Transfer-Encoding`, `Upgrade`, etc.)
3. **Max body size** — reject payloads >10MB
4. **Rate limit WS** — drop connections exceeding 100 msg/s
5. **Subdomain validation** — regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
6. **Timeout everything** — HTTP relay 30s, WS ping/pong 30s
7. **API keys** — store hashed (SHA-256), never log plaintext
8. **No eval/exec** — never use `eval()`, `Function()`, `child_process.exec()` with user input

## What NOT to Do

- Never use `any` type — use `unknown` + narrowing
- Never log API keys or sensitive data in plaintext
- Never use `eval()` or `exec()` with user input
- Never skip input validation on WS messages
- Never commit `.env` files or API keys
- Never store plaintext API keys on server
- Never use barrel files (`index.ts` re-exports) — import directly
- Never use `console.log` — use pino logger
- Never skip Biome lint before committing

## Error Code Reference

| Code | Meaning |
|------|---------|
| `TUNELO_AUTH_001` | Invalid API key |
| `TUNELO_AUTH_002` | API key required |
| `TUNELO_TUNNEL_001` | Subdomain already in use |
| `TUNELO_TUNNEL_002` | No tunnel found for subdomain |
| `TUNELO_TUNNEL_003` | Tunnel connection lost |
| `TUNELO_RELAY_001` | Request relay timeout |
| `TUNELO_RELAY_002` | Response too large |
| `TUNELO_SERVER_001` | Server startup failed |

## Architecture Reference

See `docs/system-architecture.md` for full details.

```
Browser → nginx (443, TLS, wildcard cert)
       → Tunnel Server (HTTP + WS)
       → WebSocket (persistent)
       → Client CLI
       → localhost:PORT
```
