---
title: "Device Code Auth Flow"
description: "Replace CLI prompt-based register/login with browser-based Device Code Flow"
status: complete
priority: P1
effort: 12h
branch: feat/device-code-auth
tags: [auth, cli, portal, device-code]
created: 2026-03-29
completed: 2026-03-29
---

# Device Code Auth Flow

Replace CLI prompt-based register/login with browser-based Device Code Flow (like `gh auth login`). CLI opens browser, user authenticates on Portal web UI, CLI receives API key via polling.

## Architecture

```
CLI                          Server                        Portal (Browser)
 |                             |                              |
 |--- POST /api/auth/device -->|                              |
 |<-- { deviceCode, userCode,  |                              |
 |     verificationUrl }       |                              |
 |                             |                              |
 | open(verificationUrl)       |                              |
 |                             |  User signup/login on portal  |
 |                             |<-- POST /api/auth/device/     |
 |                             |    approve { userCode }       |
 |                             |                              |
 |--- POST /api/auth/device/  |                              |
 |    poll { deviceCode } ---->|                              |
 |<-- { status: "approved",   |                              |
 |     key, userId, email }   |                              |
 |                             |                              |
 | Save key to config.json     |                              |
```

## Key Decisions

- Device Code Flow (proven: GitHub CLI, Stripe CLI, AWS SSO)
- Both register + login open browser (CLI = launcher only)
- Portal (packages/client/portal) handles web UI
- 5 min timeout, 3s poll interval
- Old CLI auth commands removed entirely (no fallback)
- MongoDB `deviceCodes` collection with TTL index

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Server: Device Code API + MongoDB model | 5h | complete | [phase-01](phase-01-server-device-code-api.md) |
| 2 | Portal: Device auth page | 3h | complete | [phase-02](phase-02-portal-device-auth-page.md) |
| 3 | CLI: Device auth commands + cleanup | 4h | complete | [phase-03](phase-03-cli-device-auth.md) |

## Dependencies

- Phase 2 depends on Phase 1 (server API must exist)
- Phase 3 depends on Phase 1 (poll endpoint must exist)
- Phase 2 & 3 can run in parallel after Phase 1

## Risk Summary

| Risk | Mitigation |
|------|------------|
| No browser (SSH) | Show URL for manual copy-paste |
| Poll spam | Rate limit 1 req/2s per deviceCode |
| Code brute force | 8 chars + 5 min expire + max 5 attempts |
| Portal not running | Portal served from tunnel server, not localhost |
