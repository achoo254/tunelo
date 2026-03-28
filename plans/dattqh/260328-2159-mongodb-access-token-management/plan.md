---
title: "MongoDB Access Token Management"
description: "Multi-tenant SaaS with self-service key management, MongoDB-backed auth replacing keys.json"
status: pending
priority: P1
effort: 40h
branch: feat/mongodb-access-management
tags: [auth, backend, database, multi-tenant]
created: 2026-03-28
---

# MongoDB Access Token Management

## Overview

Replace static `keys.json` auth with MongoDB-backed multi-tenant access management. Users self-signup, create orgs, manage API keys. Admin REST API + customer portal.

**Approach:** MongoDB direct query (no cache) → upgrade to in-memory cache later.
**Brainstorm:** [brainstorm report](../reports/brainstorm-260328-2159-mongodb-access-token-management.md)

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | MongoDB setup + KeyStore abstraction | Pending | 8h | [phase-01](./phase-01-mongodb-setup-and-key-store.md) |
| 2 | User auth (signup/login/JWT) + Admin API | Pending | 12h | [phase-02](./phase-02-user-auth-and-admin-api.md) |
| 3 | Customer API + Org limits enforcement | Pending | 10h | [phase-03](./phase-03-customer-api-and-org-limits.md) |
| 4 | Dashboard UI + Usage tracking | Pending | 10h | [phase-04](./phase-04-dashboard-and-usage-tracking.md) |

## Dependencies

- MongoDB standalone instance accessible from server
- `MONGO_URI` env var for connection string
- No replica set required (Phase 1 uses direct queries)
- `jsonwebtoken` + `bcrypt` packages for Phase 2

## Key Decisions

- **No cache Phase 1** — auth is 1x per WS connection, ~3ms MongoDB query acceptable
- **KeyStore interface** — abstract to swap JSON file (dev) / MongoDB (prod)
- **Self-service from day 1** — users signup, create org, manage keys
- **Free tier only** — schema extensible for billing later, NOT implemented now
- **Admin token in env** — simple admin auth, no admin user system

## Validation Summary

**Validated:** 2026-03-28
**Questions asked:** 6

### Confirmed Decisions
- **DB Driver:** Mongoose with `lean()` for query performance — schema validation + lightweight results
- **Email verification:** Skip entirely for now — add later when needed
- **HTTP Framework:** Express.js — team familiarity, ecosystem maturity
- **Dashboard UI:** React SPA in `packages/dashboard/` — full-featured portal
- **Client compatibility:** Keep existing key format — server hashes + looks up, no breaking change for CLI clients
- **Abuse prevention:** Rate limit IP only (5 signup/IP/hour) — CAPTCHA deferred

### Action Items
- [ ] Phase 1: Use Mongoose with `.lean()` on all read queries (not raw native driver)
- [ ] Phase 2: Remove email verification flow — signup creates active user immediately
- [ ] Phase 2: Remove `POST /api/auth/verify-email` endpoint
- [ ] Phase 2: No Nodemailer/Resend dependency needed
- [ ] Phase 3: Accept any key format (no `tk_` prefix enforcement on validation) — new keys generated with `tk_` but old keys without prefix still work
- [ ] Phase 4: React SPA with Vite in `packages/dashboard/`
