---
phase: 01
title: Basic Auth on Tunnels
priority: high
status: completed
effort: ~2h
---

# Phase 01 — Basic Auth on Tunnels

## Overview

Allow tunnel owner to protect their tunnel with HTTP Basic Auth. Unauthenticated requests get 401 before reaching the client.

## Key Insights

- Basic Auth is handled entirely on the **server side** (request-relay.ts)
- Credentials sent during auth handshake, stored per-tunnel in memory
- No database needed — credentials live as long as tunnel connection
- Base64 decode `Authorization` header, compare with stored credentials

## Requirements

### Functional
- CLI: `tunelo http 8011 --auth user:pass`
- Server validates `Authorization` header on every incoming HTTP request
- Missing/invalid auth → 401 with `WWW-Authenticate: Basic realm="tunelo"` header
- Health endpoint `/health` is exempt from auth
- Auth credentials sent to server during tunnel registration

### Non-Functional
- Credentials never logged in plaintext
- Credentials stored hashed in memory (SHA-256)

## Architecture

```
Browser → nginx → Server (request-relay.ts)
                    ↓
              Check Authorization header
              against tunnel's stored credentials
                    ↓
              Match? → relay to client
              No match? → 401 Unauthorized
```

## Related Code Files

### Modify
- `packages/shared/src/protocol.ts` — add `auth?: string` to AuthMessage
- `packages/shared/src/constants.ts` — add error code
- `packages/server/src/tunnel-manager.ts` — store auth credentials per tunnel
- `packages/server/src/request-relay.ts` — check Authorization header
- `packages/server/src/ws-handler.ts` — pass auth to tunnel-manager.register()
- `packages/client/src/cli.ts` — add `--auth` option
- `packages/client/src/tunnel-client.ts` — send auth in auth message
- `packages/client/src/display.ts` — show auth status

## Implementation Steps

1. Add `auth?: string` field to `AuthMessage` in protocol.ts
2. Add `TUNELO_AUTH_003` error code for unauthorized access
3. Update `TunnelConnection` interface — add `authHash?: string` field
4. Update `tunnel-manager.register()` — accept optional auth string, hash+store
5. Add `checkAuth(subdomain, authHeader)` method to tunnel-manager
6. Update `request-relay.ts` — before relay, check auth if tunnel has credentials
7. Update `ws-handler.ts` — pass `msg.auth` to register()
8. Update CLI — add `--auth <user:pass>` option
9. Update tunnel-client — include auth in auth message
10. Update display — show "Auth: enabled" in connected output

## Todo List

- [ ] Protocol: add auth field to AuthMessage
- [ ] Server: store hashed auth credentials per tunnel
- [ ] Server: validate Authorization header in request-relay
- [ ] Server: return 401 with WWW-Authenticate header
- [ ] Client: add --auth CLI option
- [ ] Client: send auth in handshake
- [ ] Client: display auth status
- [ ] Test: unit test for auth validation

## Success Criteria

- `tunelo http 8011 --auth admin:secret` → tunnel protected
- Browser shows login prompt when accessing tunnel URL
- Correct credentials → request relayed normally
- Wrong/no credentials → 401 Unauthorized
- Auth credentials never appear in logs

## Security Considerations

- Hash credentials with SHA-256 before storing in memory
- Never log auth credentials in plaintext
- Use constant-time comparison to prevent timing attacks
- `WWW-Authenticate: Basic realm="tunelo"` response header
