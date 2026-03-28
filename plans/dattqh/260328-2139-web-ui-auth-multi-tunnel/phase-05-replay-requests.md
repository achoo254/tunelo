---
phase: 05
title: Replay Requests
priority: medium
status: completed
effort: ~4h
depends_on: phase-04
---

# Phase 05 — Replay Requests

## Overview

Replay captured requests from the Web UI Inspector. Click "Replay" on any request → re-send it to local service → show new response. Essential for webhook debugging.

## Key Insights

- Builds on Phase 04 (Web UI Inspector + RequestStore)
- Replay = take stored request, send it to local proxy again
- Show both original and replayed response side by side
- No server involvement — entirely client-side operation

## Requirements

### Functional
- "Replay" button on each request in Inspector UI
- Replay sends exact same request (method, path, headers, body) to local service
- Response shown inline or in new entry marked as "replayed"
- Option to modify request before replay (edit headers/body)
- API: `POST /api/requests/:id/replay` + `POST /api/replay` (custom request)

### Non-Functional
- Replay does NOT go through tunnel server — direct to localhost
- Replayed requests marked distinctly in UI (badge/icon)
- Rate limit replays (max 10/sec) to prevent accidental spam

## Architecture

```
Inspector UI
  ↓ click "Replay" on request #42
  ↓
POST /api/requests/42/replay
  ↓
Inspector Server reads stored request from RequestStore
  ↓
Forward to localhost:PORT (same as local-proxy.ts)
  ↓
Capture response
  ↓
Store as new entry (type: "replay", originalId: "42")
  ↓
SSE push to UI → show result
```

## Related Code Files

### Modify
- `packages/client/src/request-store.ts` — add `type` field (normal/replay), `originalId`
- `packages/client/src/inspector-server.ts` — add replay route
- `packages/client/src/inspector-ui.ts` — replay button, replay badge, edit-and-replay modal

### Reuse
- `packages/client/src/local-proxy.ts` — `proxyRequest()` already does the forwarding

## Implementation Steps

1. Update `InspectorEntry` type — add `entryType: "normal" | "replay"`, `originalId?: string`
2. Add replay API route in inspector-server:
   - `POST /api/requests/:id/replay` — replay exact request
   - `POST /api/replay` — replay with modified body `{ method, path, headers, body }`
3. Replay handler: read stored request → call `proxyRequest()` → store result → SSE push
4. Add rate limiter for replay endpoint (max 10/sec)
5. Update UI: add "Replay" button on each request row
6. Update UI: add replay badge/icon on replayed entries
7. Update UI: "Edit & Replay" modal — edit headers/body before sending
8. Update UI: link replayed entry to original (clickable originalId)

## Todo List

- [ ] Update InspectorEntry type with replay fields
- [ ] Add POST /api/requests/:id/replay route
- [ ] Add POST /api/replay route (custom request)
- [ ] Implement replay handler using proxyRequest()
- [ ] Add rate limiting on replay endpoints
- [ ] UI: Replay button on request rows
- [ ] UI: Replay badge/icon styling
- [ ] UI: Edit & Replay modal
- [ ] Test: replay produces correct request
- [ ] Test: rate limiting works

## Success Criteria

- Click "Replay" → request re-sent to localhost → new response shown
- Replayed entries visually distinct from normal entries
- Edit & Replay allows modifying request before sending
- Rate limit prevents spam (max 10/sec)
- Replay works even after tunnel disconnects (direct to localhost)
