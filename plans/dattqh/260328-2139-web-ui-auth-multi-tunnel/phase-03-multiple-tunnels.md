---
phase: 03
title: Multiple Tunnels Support (Client)
priority: medium
status: completed
effort: ~4h
depends_on: phase-02
---

# Phase 03 — Multiple Tunnels Support (Client)

## Overview

Client-side implementation for multiple tunnels. User can expose multiple local ports with different subdomains in a single command.

## Key Insights

- Server protocol ready from Phase 02
- Client needs: CLI syntax, port→subdomain mapping, routing logic
- Two CLI approaches: inline args vs config file
- Start with inline args (YAGNI), add config file later if needed

## Requirements

### Functional
- CLI: `tunelo http 3000:api 8011:web 4000:docs`
- Format: `<port>:<subdomain>` or just `<port>` (auto-generate subdomain)
- Each port gets its own subdomain and public URL
- Display shows all active tunnels
- `--auth` applies to all tunnels (or per-tunnel `<port>:<subdomain>:<auth>`)

### Non-Functional
- First tunnel registered via initial auth (backward compatible)
- Additional tunnels via register-tunnel message
- Graceful handling if one subdomain is taken

## Architecture

```
CLI Input: tunelo http 3000:api 8011:web

TunnelClient
  ├── connect() → auth with first tunnel (3000:api)
  ├── registerTunnel() → register second tunnel (8011:web)
  └── handleRequest(req) → route by req.subdomain
        ├── "api" → localhost:3000
        └── "web" → localhost:8011
```

## Related Code Files

### Modify
- `packages/client/src/cli.ts` — parse multi-port syntax
- `packages/client/src/tunnel-client.ts` — register multiple tunnels, route by subdomain
- `packages/client/src/local-proxy.ts` — accept dynamic port per request
- `packages/client/src/display.ts` — show multiple tunnel URLs

### Create
- `packages/client/src/tunnel-config-parser.ts` — parse `port:subdomain` syntax

## Implementation Steps

1. Create `tunnel-config-parser.ts`:
   - Parse `3000:api` → `{ port: 3000, subdomain: "api" }`
   - Parse `8011` → `{ port: 8011, subdomain: undefined }` (auto-generate)
   - Validate port range and subdomain format
2. Update CLI command to accept variadic `<port...>` instead of `<port>`
3. Update `TunnelClientOptions`:
   - Replace `localPort: number` + `subdomain?: string` with `tunnels: TunnelMapping[]`
   - Keep backward compat: single port still works
4. Update `TunnelClient.connect()`:
   - Auth with first tunnel's subdomain
   - After auth success, emit `register-tunnel` for remaining tunnels
   - Store subdomain→port mapping
5. Update `TunnelClient.handleRequest()`:
   - Read `request.subdomain` to determine target port
   - Pass correct port to `proxyRequest()`
6. Update `local-proxy.ts` — already accepts `localPort` param, no change needed
7. Update `Display.showConnected()` — show all tunnel URLs in table format
8. Update `Display.logRequest()` — prefix subdomain in log line

## Todo List

- [ ] Create tunnel-config-parser.ts with port:subdomain parsing
- [ ] Update CLI to accept multiple port args
- [ ] Update TunnelClientOptions for multi-tunnel
- [ ] Implement register-tunnel in tunnel-client after initial auth
- [ ] Route incoming requests by subdomain to correct local port
- [ ] Update display for multiple tunnel URLs
- [ ] Update request log to show subdomain prefix
- [ ] Test: multiple tunnel registration
- [ ] Test: correct routing by subdomain
- [ ] Test: parser edge cases

## Success Criteria

- `tunelo http 3000:api 8011:web` opens 2 tunnels
- Each URL correctly proxies to its local port
- Display shows all URLs clearly
- One taken subdomain doesn't block others
- Single-port command still works: `tunelo http 8011`

## Risk Assessment

- **Subdomain conflict:** One taken → show error for that subdomain, continue others
- **Reconnect:** Must re-register all tunnels on reconnect
- **Grace period:** Server must orphan all subdomains for same socket
