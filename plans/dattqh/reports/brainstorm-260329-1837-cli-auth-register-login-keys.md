# Brainstorm: CLI Auth - Register, Login, Keys Management

**Date:** 2026-03-29
**Status:** Approved — proceeding to implementation (no plan needed)

## Problem Statement

Tunelo CLI hiện chỉ có 4 commands: `http`, `tcp`, `config`, `help`. User phải vào Dashboard web để register/login/tạo key rồi copy sang CLI. Cần thêm auth flow trực tiếp trong CLI.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth interface | CLI commands | User không cần mở browser |
| TOTP policy | Mandatory admin, optional user | Giảm friction cho user thường |
| Token storage | API key (auto-created on login) | Đơn giản, không cần refresh logic |
| Email verification | Không | Không cần SMTP server |
| Keys mgmt auth | API key-based (Option B) | Key self-manage, đơn giản nhất |

## New CLI Commands

```
tunelo register              # Đăng ký tài khoản
tunelo login                 # Đăng nhập → auto-create & save API key
tunelo logout                # Xóa key khỏi config
tunelo keys list             # Liệt kê API keys
tunelo keys create [--label] # Tạo key mới
tunelo keys revoke <keyId>   # Thu hồi key
```

## Implementation Changes

### Server
- `POST /api/auth/signup`: TOTP optional cho non-admin
- `POST /api/auth/login-cli` (new): Returns API key instead of cookie
- `GET/POST/DELETE /api/keys/by-key`: API key auth (Bearer header) for key management

### Client CLI
- New commands: `register`, `login`, `logout`, `keys` with subcommands
- Password input: readline with hidden echo
- Auto-save key to `~/.tunelo/config.json`

### Security
- Login-cli rate limited: 10/15min per IP
- Key label auto: `cli-<hostname>-<YYMMDD>`
- API key shown once, hashed immediately on server
