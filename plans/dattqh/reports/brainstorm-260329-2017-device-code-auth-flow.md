# Brainstorm: Device Code Auth Flow cho CLI

**Date:** 2026-03-29
**Status:** Approved

## Problem

CLI hiện tại yêu cầu user nhập email/password trực tiếp trong terminal. UX kém, không hỗ trợ 2FA tốt, không professional.

## Quyết định

| Item | Chọn |
|---|---|
| Auth flow | Device Code Flow (giống gh auth login) |
| Scope | Cả register + login mở browser |
| Web UI | Portal (packages/client/portal) |
| Timeout | 5 phút, poll mỗi 3s |
| Old CLI auth | Xóa luôn, không fallback |

## Thiết kế

### Flow

1. CLI gọi `POST /api/auth/device` → nhận `deviceCode` + `userCode` + `verificationUrl`
2. CLI mở browser tới `verificationUrl` (portal)
3. User signup/login trên portal → xác nhận `userCode`
4. Portal gọi `POST /api/auth/device/approve` (cần cookie auth)
5. CLI poll `POST /api/auth/device/poll` → nhận API key khi approved
6. CLI lưu key vào `~/.config/tunelo/config.json`

### Server API mới (3 endpoints)

- `POST /api/auth/device` — tạo device + user code
- `POST /api/auth/device/poll` — CLI poll status
- `POST /api/auth/device/approve` — Portal approve (cookie auth required)

### Storage

- MongoDB collection `deviceCodes` với TTL index 5 phút
- Schema: `{ deviceCode, userCode, expiresAt, status, userId?, apiKey? }`
- deviceCode: 32 char random, userCode: XXXX-XXXX format

### CLI changes

- Xóa: `cli-auth-commands.ts`
- Thêm: `cli-device-auth.ts` (open browser + poll logic)
- Package: `open` cho cross-platform browser open

### Portal changes

- Route `/auth/device` — hiện userCode, yêu cầu auth, approve
- Success page sau approve

## Ưu điểm

- UX professional, proven pattern (GitHub/Stripe CLI)
- API key không hiển thị trên browser
- Ít API mới, logic đơn giản (KISS)

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Không có browser (SSH) | Hiện URL để copy-paste |
| Poll spam | Rate limit 1 req/2s per deviceCode |
| Code brute force | 8 chars + 5 min expire + max 5 attempts |

## Next Steps

Tạo implementation plan chi tiết.
