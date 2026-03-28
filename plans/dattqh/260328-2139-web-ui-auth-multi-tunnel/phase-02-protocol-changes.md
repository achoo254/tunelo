---
phase: 02
title: Protocol Changes for Multi-Tunnel
priority: high
status: completed
effort: ~3h
depends_on: phase-01
---

# Phase 02 — Protocol Changes for Multi-Tunnel

## Overview

Update the WS protocol to support multiple subdomains per connection. Currently 1 socket = 1 subdomain. New protocol: 1 socket = N subdomains.

## Key Insights

- Current `AuthMessage` registers 1 subdomain per connection
- Need new message type for registering additional tunnels after initial auth
- `TunnelRequest`/`TunnelResponse` already have `id` — need to add `subdomain` for routing
- Backward-compatible: single-tunnel clients still work (subdomain inferred)

## Requirements

### Functional
- Client can register multiple subdomains on single WS connection
- Each subdomain maps to a different local port
- Server routes requests to correct subdomain
- Client routes responses from correct local port

### Non-Functional
- Backward compatible — existing single-tunnel clients still work
- No performance regression for single-tunnel use case

## Architecture

```
Client WS Connection
  ├── subdomain "api"  → localhost:3001
  ├── subdomain "web"  → localhost:3000
  └── subdomain "docs" → localhost:4000

Server routes by Host header → subdomain → same WS socket
Client routes by subdomain in TunnelRequest → correct local port
```

## Related Code Files

### Modify
- `packages/shared/src/protocol.ts` — add subdomain to TunnelRequest, new RegisterTunnel message
- `packages/server/src/tunnel-manager.ts` — support multiple subdomains per socket
- `packages/server/src/ws-handler.ts` — handle register-tunnel event
- `packages/server/src/request-relay.ts` — no change (already routes by subdomain)

## Implementation Steps

1. Add `subdomain` field to `TunnelRequest` interface (server fills it from Host header)
2. Add `RegisterTunnelMessage` type: `{ type: "register-tunnel", subdomain, auth?, localPort }`
3. Add `RegisterTunnelResult` type: `{ type: "register-tunnel-result", success, subdomain, url, error? }`
4. Update `ServerToClientEvents` — add `register-tunnel-result` event
5. Update `ClientToServerEvents` — add `register-tunnel` event
6. Update tunnel-manager — change internal structure:
   - `tunnels` Map keyed by subdomain → stores socket ref + metadata
   - Multiple subdomain entries can point to same socket
   - `unregisterBySocket(socketId)` — remove all subdomains for a socket
7. Update ws-handler — handle `register-tunnel` event (after auth)
8. Update request-relay — include `subdomain` in TunnelRequest payload

## Todo List

- [ ] Protocol: add subdomain to TunnelRequest
- [ ] Protocol: add RegisterTunnel message types
- [ ] Protocol: update event maps
- [ ] Server: refactor tunnel-manager for multi-subdomain per socket
- [ ] Server: handle register-tunnel event in ws-handler
- [ ] Server: include subdomain in relay request payload
- [ ] Test: multi-subdomain registration
- [ ] Test: correct routing by subdomain

## Success Criteria

- Server accepts multiple register-tunnel messages on same socket
- Each subdomain correctly routes to the socket
- Disconnect cleans up all subdomains for that socket
- Existing single-subdomain flow still works unchanged

## Risk Assessment

- **Breaking change risk:** Low — new fields are additive, old clients ignore them
- **Race condition:** Multiple register-tunnel messages simultaneously — use sequential processing
- **Grace period:** Must work with multi-subdomain (orphan all subdomains for a socket)
