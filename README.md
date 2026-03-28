# Tunelo

**Tiếng Việt** | [English](./README.en.md)

Tunnel proxy tự host. Mở cổng dịch vụ local ra internet qua HTTPS với wildcard subdomain. Hạ tầng của bạn, luật chơi của bạn — không phụ thuộc cloud vendor, không giới hạn nhân tạo.

```bash
npx tunelo http 3000
# => https://myapp.tunnel.inetdev.io.vn
```

## Tại sao chọn Tunelo?

ngrok rất mạnh cho đến khi bạn chạm giới hạn gói miễn phí. Tunelo là giải pháp tự host thay thế — không giới hạn tốc độ, không giới hạn số tunnel, mã nguồn mở.

| Tính năng | **Tunelo** | **ngrok Free** |
|-----------|----------|---|
| Chi phí | Miễn phí (VPS của bạn) | $0 |
| Số endpoint | Không giới hạn | Tối đa 3 |
| Request/tháng | Không giới hạn | 20k |
| Subdomain tùy chỉnh | Có | Không |
| Tự host | Có | Không |
| Mã nguồn mở | Có (MIT) | Không |
| Định tuyến dữ liệu | Trực tiếp (VPS của bạn) | Qua cloud ngrok |

## Kiến trúc

```
Browser → nginx (TLS) → Tunnel Server (Express + MongoDB)
                           ↓
                      API (xác thực, key, thống kê)
                           ↓
                      WebSocket Relay
                           ↓
Client CLI → localhost:PORT
```

## Tech Stack (v0.3)

- **Runtime:** Node.js 20+, TypeScript strict, ESM
- **Server:** Express.js + raw WebSocket relay
- **Database:** MongoDB + Mongoose (.lean() để tối ưu hiệu năng)
- **Xác thực:** TOTP 2FA (Google Authenticator), JWT token (24h access, 7d refresh)
- **Mã hóa:** bcrypt cho mật khẩu, SHA-256 cho API key
- **Giao diện:** Admin Dashboard SPA + Client Portal SPA (cả hai dùng React + Vite)
- **Test:** vitest + E2E
- **Lint:** Biome
- **Triển khai:** nginx + PM2 + MongoDB

## Bắt đầu

### Cài đặt
```bash
git clone <repo> && cd tunelo
pnpm install && pnpm build
```

### Phát triển
```bash
pnpm dev:server    # Server với tsx --watch
pnpm dev:client    # Client CLI
pnpm test          # Chạy test
pnpm lint:fix      # Tự động sửa lỗi lint
```

## Cấu trúc Monorepo

```
tunelo/
├── packages/
│   ├── shared/           # Type, hằng số, mã lỗi dùng chung
│   ├── server/           # Tunnel server (Express + WS relay + MongoDB)
│   ├── client/           # CLI tool + portal SPA
│   ├── dashboard/        # Admin Dashboard SPA (React + Vite)
├── infra/                # Cấu hình nginx, certbot, PM2
├── docs/                 # Tài liệu
└── plans/                # Kế hoạch triển khai
```

## Tính năng chính (v0.3)

✅ **Quản lý người dùng:** Đăng ký, đăng nhập với TOTP 2FA, quản lý API key
✅ **Admin Dashboard:** Xem tất cả người dùng, tunnel, thống kê sử dụng, tạm khóa tài khoản
✅ **Client Portal:** React SPA nhúng tại localhost:4040, tự quản lý key
✅ **MongoDB:** Lưu trữ bền vững người dùng/key/thống kê sử dụng
✅ **JWT Auth:** httpOnly cookie + CSRF protection, token access 24h + refresh 7 ngày
✅ **Theo dõi sử dụng:** Đếm request, bandwidth theo từng key, snapshot hàng ngày
✅ **Giới hạn tốc độ:** Dùng Redis (interface có thể thay thế)

## Triển khai

Xem `docs/deployment-guide.md` để biết chi tiết. Tóm tắt nhanh:

1. DNS: `*.tunnel.inetdev.io.vn → VPS_IP`
2. Chứng chỉ: Wildcard SSL qua Let's Encrypt
3. MongoDB: Chạy trên localhost hoặc remote
4. Biến môi trường: `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAILS`, API key
5. Build và triển khai qua PM2

## Biến môi trường

```bash
# Cốt lõi
MONGO_URI=mongodb://localhost/tunelo
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Danh sách admin (phân tách bằng dấu phẩy)
ADMIN_EMAILS=admin@example.com,dev@example.com

# Server
PORT=3001
NODE_ENV=production

# Cấu hình tunnel
TUNNEL_DOMAIN=tunnel.inetdev.io.vn
TUNNEL_PORT=3001
```

## Ví dụ API

### Đăng ký
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
```

### Tạo TOTP secret
```bash
curl -X POST http://localhost:3001/api/auth/totp-setup \
  -H "Authorization: Bearer {accessToken}"
```

### Tạo API key
```bash
curl -X POST http://localhost:3001/api/keys \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{"label":"My Device"}'
```

## Bảo mật

- TOTP 2FA bắt buộc cho tất cả người dùng
- API key lưu dạng SHA-256 hash
- Mật khẩu hash bằng bcrypt
- Loại bỏ hop-by-hop header khi relay
- httpOnly cookie + CSRF token
- Giới hạn tốc độ: 100 msg/s mỗi kết nối WS
- Kích thước body tối đa: 10 MB
- Timeout request: 30 giây

## Lộ trình phát triển

- **v0.2:** WebSocket pass-through, binary streaming, standalone binary
- **v0.3 (hiện tại):** MongoDB, quản lý người dùng, TOTP 2FA, hai portal
- **v0.4:** Custom domain, TCP raw tunnel, request replay
- **v0.5:** Mở rộng multi-server, Redis, load balancing

## Giấy phép

MIT
