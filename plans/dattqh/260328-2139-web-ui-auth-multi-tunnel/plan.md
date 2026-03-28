---
status: completed
created: 2026-03-28
completed: 2026-03-28
slug: web-ui-auth-multi-tunnel
phases: 6
---

# Tunelo v0.2 — Feature Expansion Plan

## Overview

6 phases to evolve Tunelo from internal tool to ngrok-competitive product:
1. **Basic Auth** — protect tunnel with username:password
2. **Protocol Changes** — multi-tunnel support in WS protocol
3. **Multiple Tunnels** — multiple ports/subdomains per client
4. **Web UI Inspector** — local dashboard to inspect requests (port 4040)
5. **Replay Requests** — re-send captured requests for debugging
6. **TCP Tunnel** — expose any TCP port (database, SSH, etc.)

## Phase Summary

| Phase | Description | Effort | Depends | Status |
|-------|-------------|--------|---------|--------|
| 01 | Basic Auth on tunnels | ~2h | — | completed |
| 02 | Protocol changes for multi-tunnel | ~3h | 01 | completed |
| 03 | Multiple tunnels support (client) | ~4h | 02 | completed |
| 04 | Web UI Request Inspector | ~8h | 03 | completed |
| 05 | Replay Requests | ~4h | 04 | completed |
| 06 | TCP Tunnel | ~12h | 03 | completed |

**Total estimated effort: ~33h**

## Dependency Graph

```
Phase 01 (Basic Auth)
  └→ Phase 02 (Protocol)
       └→ Phase 03 (Multi-tunnel)
            ├→ Phase 04 (Web UI)
            │    └→ Phase 05 (Replay)
            └→ Phase 06 (TCP Tunnel) [parallel with 04-05]
```

Phase 06 (TCP) can run in parallel with Phase 04-05 (Web UI + Replay).

## Feature Comparison vs ngrok

After all 6 phases, Tunelo matches ngrok Personal ($8/mo) + extras:

| Feature | ngrok Free | ngrok Paid | Tunelo v0.2 |
|---------|-----------|-----------|-------------|
| Custom subdomain | ❌ | ✅ | ✅ |
| Multiple tunnels | ❌ | ✅ | ✅ |
| Basic Auth | ❌ | ✅ | ✅ |
| Request Inspector | ✅ | ✅ | ✅ |
| Replay Requests | ✅ | ✅ | ✅ |
| TCP Tunnel | ✅ | ✅ | ✅ |
| Unlimited bandwidth | ❌ | ❌ | ✅ |
| Unlimited connections | ❌ | ❌ | ✅ |
| Self-hosted | ❌ | ❌ | ✅ |

## Phase Files

- [Phase 01 — Basic Auth](./phase-01-basic-auth.md)
- [Phase 02 — Protocol Changes](./phase-02-protocol-changes.md)
- [Phase 03 — Multiple Tunnels](./phase-03-multiple-tunnels.md)
- [Phase 04 — Web UI Inspector](./phase-04-web-ui-inspector.md)
- [Phase 05 — Replay Requests](./phase-05-replay-requests.md)
- [Phase 06 — TCP Tunnel](./phase-06-tcp-tunnel.md)
