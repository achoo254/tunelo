---
title: "Tunelo — ngrok Alternative MVP"
description: "WebSocket relay tunnel proxy; self-hosted ngrok alternative with wildcard subdomains on *.tunnel.inetdev.io.vn"
status: completed
priority: P1
effort: 18h
branch: main
tags: [tunnel, backend, cli, infra, websocket, typescript]
created: 2026-03-28
completed: 2026-03-28
---

# Tunelo MVP Implementation Plan

## Architecture

WebSocket Relay tunnel proxy — pure TypeScript monorepo. nginx terminates TLS (wildcard cert), proxies to Node.js tunnel server. Client CLI connects via persistent WS, relays HTTP requests to local service.

## Phases

| # | Phase | Effort | Depends On | Status |
|---|-------|--------|------------|--------|
| 1 | [Project Setup](./phase-01-project-setup.md) | 2h | — | completed |
| 2 | [Shared Protocol](./phase-02-shared-protocol.md) | 1.5h | Phase 1 | completed |
| 3 | [Tunnel Server](./phase-03-tunnel-server.md) | 5h | Phase 2 | completed |
| 4 | [Client CLI](./phase-04-client-cli.md) | 4h | Phase 2 | completed |
| 5 | [Infrastructure](./phase-05-infrastructure.md) | 2.5h | Phase 3 | completed |
| 6 | [Integration Testing](./phase-06-integration-testing.md) | 3h | Phase 3, 4 | completed |

**Total estimated effort:** ~18h

## Key Dependencies

- Domain: `*.tunnel.inetdev.io.vn` DNS configured
- VPS: 2-4 vCPU, 4-8GB RAM with nginx + certbot
- Node.js 20+ on server and client

## Success Criteria

- Client connects, tunnel accessible via HTTPS in <3s
- HTTP relay works for GET/POST/PUT/DELETE
- WebSocket pass-through works
- Auto-reconnect within 5s
- 100 concurrent tunnels on single VPS
- <50ms tunnel overhead

## Out of Scope (v0.2+)

Standalone binary, web dashboard, user management, rate limiting, TCP tunnels, custom domains, request inspection, multi-server scaling, database.
