---
phase: 04
title: Web UI Request Inspector
priority: medium
status: completed
effort: ~8h
depends_on: phase-03
---

# Phase 04 — Web UI Request Inspector

## Overview

Local web dashboard (port 4040) showing real-time request/response traffic through tunnels. Similar to ngrok's inspect UI.

## Key Insights

- Runs on **client side** only — no server changes needed
- Store requests in memory (ring buffer, max 500 entries)
- Static HTML + vanilla JS — no React/framework (KISS)
- Real-time updates via SSE (Server-Sent Events)
- JSON API for programmatic access
- Auto-opens browser on start (optional `--no-inspect`)

## Requirements

### Functional
- HTTP server on `localhost:4040` (configurable via `--inspect-port`)
- Dashboard shows: active tunnels, request list, request detail
- Request list: method, path, status, duration, timestamp, subdomain
- Request detail: full headers, body (pretty-printed JSON/HTML), response
- Filter by: subdomain, status code, method, search text
- Real-time updates without page refresh (SSE)
- `--no-inspect` flag to disable inspector

### Non-Functional
- Max 500 requests in memory (ring buffer, oldest evicted)
- Body stored up to 1MB per request/response (truncate larger)
- Inspector must not affect tunnel performance
- Works without internet (no CDN dependencies)

## Architecture

```
Browser (localhost:4040)
  ├── GET /                    → Dashboard HTML
  ├── GET /api/tunnels         → Active tunnel list
  ├── GET /api/requests        → Request list (paginated)
  ├── GET /api/requests/:id    → Request detail
  ├── GET /api/events          → SSE stream (real-time updates)
  └── DELETE /api/requests     → Clear request history

RequestStore (ring buffer)
  ├── add(entry)              → Store + emit SSE event
  ├── list(filter, page)      → Filtered paginated list
  ├── get(id)                 → Full request detail
  └── clear()                 → Reset buffer
```

## Related Code Files

### Create
- `packages/client/src/inspector-server.ts` — HTTP server + SSE + JSON API
- `packages/client/src/request-store.ts` — Ring buffer storage with filter/search
- `packages/client/src/inspector-ui.ts` — Inline HTML/CSS/JS as template literal (single file, no build)

### Modify
- `packages/client/src/cli.ts` — add `--inspect-port`, `--no-inspect` options
- `packages/client/src/tunnel-client.ts` — emit request/response data to RequestStore
- `packages/client/src/local-proxy.ts` — capture response body for inspector

## Implementation Steps

### Step 1: Request Store (request-store.ts)
1. Ring buffer class with configurable max size (default 500)
2. `InspectorEntry` type: id, timestamp, subdomain, method, path, requestHeaders, requestBody, status, responseHeaders, responseBody, durationMs
3. `add(entry)` — push to buffer, evict oldest if full, notify listeners
4. `list(filter?)` — return filtered entries (by subdomain, status, method, text search)
5. `get(id)` — return single entry with full body
6. `clear()` — reset buffer
7. `onAdd(callback)` — listener for SSE notifications

### Step 2: Inspector Server (inspector-server.ts)
1. `http.createServer` on port 4040
2. Routes:
   - `GET /` → serve inline HTML dashboard
   - `GET /api/tunnels` → JSON active tunnel info
   - `GET /api/requests?subdomain=X&status=2xx&q=search` → filtered list (no body, keep small)
   - `GET /api/requests/:id` → full entry with body
   - `GET /api/events` → SSE stream, push new entries
   - `DELETE /api/requests` → clear history
3. CORS headers for local dev
4. Error handling for all routes

### Step 3: Dashboard UI (inspector-ui.ts)
1. Single HTML string with embedded CSS + JS
2. Layout: sidebar (tunnel list) + main (request table + detail panel)
3. Request table: clickable rows, auto-scroll, color-coded status
4. Detail panel: tabs (Headers, Body, Response, Timing)
5. Body viewer: auto-detect JSON (pretty-print), HTML, plain text
6. Filter bar: subdomain dropdown, status filter, search input
7. SSE connection for real-time updates
8. Responsive design (works on mobile for quick checks)
9. Dark/light theme (prefers-color-scheme)

### Step 4: Integration
1. Update `tunnel-client.ts` — after proxying request, store entry in RequestStore
2. Update `local-proxy.ts` — return response body to caller (already does via TunnelResponse)
3. Update `cli.ts` — start inspector server after tunnel connects
4. Show inspector URL in display: `Inspector: http://localhost:4040`
5. Auto-open browser (optional, use `open` package or skip for simplicity)

## Todo List

- [ ] Create request-store.ts with ring buffer
- [ ] Create inspector-server.ts with HTTP routes
- [ ] Create inspector-ui.ts with dashboard HTML
- [ ] Implement SSE real-time updates
- [ ] Implement filter/search API
- [ ] Integrate with tunnel-client (capture requests)
- [ ] Add --inspect-port and --no-inspect CLI options
- [ ] Show inspector URL in display output
- [ ] Test: ring buffer eviction
- [ ] Test: API routes
- [ ] Test: SSE connection
- [ ] Manual: verify UI in browser

## Success Criteria

- `tunelo http 8011` → opens inspector at `http://localhost:4040`
- Dashboard shows real-time request traffic
- Click request → see full headers + body
- Filter by subdomain, status, search text works
- 500+ requests → oldest evicted, no memory leak
- `--no-inspect` → no inspector server started
- UI is usable and fast (no framework bloat)

## Risk Assessment

- **Port conflict:** 4040 might be in use → show warning, suggest `--inspect-port`
- **Memory:** 500 entries × 1MB body = max ~500MB → body truncation at 1MB is critical
- **Performance:** Inspector capture must be async, not block relay pipeline
- **Security:** Inspector only binds to localhost (127.0.0.1), not 0.0.0.0
