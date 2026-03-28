# Phase 2: Shared Protocol & Types

## Overview
- **Priority:** P1
- **Status:** completed
- **Effort:** 1.5h
- **Depends on:** Phase 1
- **Description:** Define WS message types, constants, and shared utilities used by both server and client.

## Key Insights
- JSON-based WS protocol — simple, debuggable, sufficient for MVP
- Body as string (base64 for binary) — chunked streaming deferred to v0.2
- Strict TypeScript discriminated unions for message types ensure type safety
- Max body size 10MB default — prevents memory issues

## Requirements

### Functional
- Message types for full request/response lifecycle
- Auth handshake message types
- Error message types with codes
- Constants for ports, paths, limits, regex patterns

### Non-functional
- All types exported from single barrel file
- Zero runtime dependencies in shared package

## Related Code Files

### Files to Create
- `packages/shared/src/protocol.ts` — all WS message type definitions
- `packages/shared/src/constants.ts` — shared constants
- `packages/shared/src/index.ts` — barrel re-export

## Implementation Steps

### 1. Define protocol.ts

```typescript
// --- Message Types (discriminated union on "type" field) ---

export interface TunnelRequest {
  type: 'request';
  id: string;            // unique request ID (nanoid)
  method: string;        // HTTP method
  path: string;          // full path including query string
  headers: Record<string, string | string[]>;
  body: string | null;   // base64-encoded for binary, string for text, null for no body
}

export interface TunnelResponse {
  type: 'response';
  id: string;            // matches request ID
  status: number;        // HTTP status code
  headers: Record<string, string | string[]>;
  body: string | null;
}

export interface AuthMessage {
  type: 'auth';
  key: string;
  subdomain: string;     // requested subdomain (empty = random)
}

export interface AuthResult {
  type: 'auth-result';
  success: boolean;
  subdomain: string;     // assigned subdomain
  url: string;           // full tunnel URL
  error?: string;
}

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
  requestId?: string;    // if error relates to specific request
}

export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

export interface PongMessage {
  type: 'pong';
  timestamp: number;
}

// Union type for all messages
export type ServerToClientMessage = TunnelRequest | AuthResult | ErrorMessage | PingMessage;
export type ClientToServerMessage = TunnelResponse | AuthMessage | ErrorMessage | PongMessage;
export type TunnelMessage = ServerToClientMessage | ClientToServerMessage;

// Error codes
export enum ErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  SUBDOMAIN_TAKEN = 'SUBDOMAIN_TAKEN',
  SUBDOMAIN_INVALID = 'SUBDOMAIN_INVALID',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  TUNNEL_NOT_FOUND = 'TUNNEL_NOT_FOUND',
  BODY_TOO_LARGE = 'BODY_TOO_LARGE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

### 2. Define constants.ts

```typescript
export const DEFAULTS = {
  SERVER_PORT: 3001,
  WS_PATH: '/tunnel',
  HEALTH_PATH: '/health',
  MAX_BODY_SIZE: 10 * 1024 * 1024,  // 10MB
  REQUEST_TIMEOUT_MS: 30_000,        // 30s
  PING_INTERVAL_MS: 30_000,          // 30s keepalive
  RECONNECT_BASE_MS: 1_000,          // 1s initial backoff
  RECONNECT_MAX_MS: 30_000,          // 30s max backoff
  MAX_SUBDOMAIN_LENGTH: 63,
} as const;

export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const TUNNEL_DOMAIN = 'tunnel.inetdev.io.vn';

export function buildTunnelUrl(subdomain: string): string {
  return `https://${subdomain}.${TUNNEL_DOMAIN}`;
}

export function generateRequestId(): string {
  // Will use nanoid in server/client; this is a fallback
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
```

### 3. Update index.ts barrel export

```typescript
export * from './protocol.js';
export * from './constants.js';
```

### 4. Build and verify
```bash
cd packages/shared && npm run build
# Verify dist/ contains compiled JS + type declarations
```

## Todo List
- [x] Create protocol.ts with all message type interfaces
- [x] Create discriminated union types (ServerToClient, ClientToServer)
- [x] Create ErrorCode enum
- [x] Create constants.ts with defaults, regex, helpers
- [x] Update index.ts barrel export
- [x] Build shared package — verify compilation
- [x] Verify server/client can import types

## Success Criteria
- `npm run build -w @tunelo/shared` succeeds
- Type imports work from server and client packages
- All message types are properly discriminated on `type` field
- Constants are `as const` for type narrowing

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Protocol changes break both packages | Keep shared as source of truth, version carefully |
| base64 body encoding adds overhead | Acceptable for MVP; add binary frames in v0.2 |
| Missing message type for edge case | Keep union extensible, add types as needed |
