# Tunelo

Tiếng Việt | **[English](./README.en.md)**

Tunnel proxy tự triển khai (self-hosted) giúp expose dịch vụ local qua HTTPS wildcard subdomain công khai. Hạ tầng của bạn, luật của bạn — không phụ thuộc cloud, không giới hạn nhân tạo.

```
npx tunelo http 3000
# => https://myapp.tunnel.inetdev.io.vn
```

## Tại sao chọn Tunelo?

ngrok rất tốt — cho đến khi bạn chạm giới hạn free tier. Tunelo là giải pháp self-hosted thay thế, loại bỏ hoàn toàn những giới hạn đó.

### So sánh Tunelo vs ngrok

| | **Tunelo** (self-hosted) | **ngrok Free** | **ngrok Pay-as-you-go** |
|---|---|---|---|
| **Chi phí** | Miễn phí (VPS của bạn) | $0 | $20+/tháng |
| **Endpoints** | Không giới hạn | Tối đa 3 | Không giới hạn |
| **Băng thông** | Không giới hạn (tuỳ VPS) | 1 GB/tháng | 5 GB, sau đó $0.10/GB |
| **Requests** | Không giới hạn | 20k/tháng | 100k, sau đó $1/100k |
| **Rate limit** | Tuỳ chỉnh | 4k req/phút | 20k req/phút |
| **Custom subdomain** | Có (wildcard `*.domain-của-bạn`) | Không | Có |
| **Self-hosted** | Có | Không | Không |
| **Mã nguồn mở** | Có (MIT) | Không (proprietary) | Không (proprietary) |
| **Định tuyến dữ liệu** | Trực tiếp (server của bạn) | Qua ngrok cloud | Qua ngrok cloud |
| **Trang xen giữa** | Không | Có (free tier) | Không |

> **Nguồn:** [ngrok Pricing](https://ngrok.com/pricing) | [ngrok Agent Docs](https://ngrok.com/docs/agent/)

### Tại sao không chọn các giải pháp khác?

| Công cụ | Đánh đổi |
|---------|----------|
| **Cloudflare Tunnel** | Miễn phí nhưng bắt buộc dùng Cloudflare — vẫn phụ thuộc cloud, vendor lock-in |
| **FRP** | Self-hosted & đã chứng minh (100k+ GitHub stars), nhưng cấu hình phức tạp hơn, không có HTTPS sẵn |
| **localtunnel** | Ngừng bảo trì từ 2024, server công cộng không ổn định |
| **bore** | Chỉ hỗ trợ TCP, không có HTTP/HTTPS |

Tunelo nhắm vào điểm cân bằng: **đơn giản như ngrok** + **self-hosted như FRP** + **HTTPS sẵn dùng** qua wildcard cert.

## Cách hoạt động

```
Browser → nginx (TLS, wildcard cert) → Tunnel Server (WS) → Client CLI → localhost:PORT
```

1. Client CLI kết nối đến tunnel server qua WebSocket
2. Server gán một subdomain công khai (ví dụ `myapp.tunnel.inetdev.io.vn`)
3. HTTP request đến subdomain đó được relay qua kết nối WS về dịch vụ local của bạn

### Hiệu năng

Tunelo sử dụng thư viện [`ws`](https://github.com/websockets/ws) thuần (189M+ lượt tải/tuần trên npm) thay vì Socket.IO để đạt hiệu năng tối đa:

| Chỉ số | ws (Tunelo) | Socket.IO | Cải thiện |
|--------|-------------|-----------|-----------|
| Bộ nhớ mỗi kết nối | ~3 KB | ~8 KB | Ít hơn 2.7 lần |
| Độ trễ (p99, 1K clients) | ~12 ms | ~32 ms | Nhanh hơn 2.7 lần |
| Thông lượng | 44K+ msg/s | 27K msg/s | Nhiều hơn 1.6 lần |
| Thời gian kết nối | <50 ms | ~186 ms | Nhanh hơn 3.7 lần |

Với 5K tunnel đồng thời, Tunelo sử dụng ~15-20 MB bộ nhớ server so với ~150-200 MB nếu dùng Socket.IO.

> **Nguồn:** [ResearchGate: WebSocket Library Benchmarks (2024)](https://www.researchgate.net/publication/397311491) | [DEV Community: ws vs socket.io](https://dev.to/alex_aslam/nodejs-websockets-when-to-use-ws-vs-socketio-and-why-we-switched-di9)

## Bắt đầu nhanh

### Yêu cầu

- Node.js 20+
- pnpm 9+

### Cài đặt & Build

```bash
git clone <repo-url> && cd tunelo
pnpm install
pnpm build
```

### Chạy Server (Development)

```bash
pnpm dev:server
```

Server chạy trên port 3001 mặc định. Cấu hình qua `.env`:

```bash
cp .env.example .env
# Chỉnh TUNNEL_PORT, API_KEYS_FILE theo nhu cầu
```

### API Keys

Tạo file `keys.json` (xem `packages/server/keys.json.example`):

```json
{
  "keys": ["tk_your_secret_key"]
}
```

Key được lưu dưới dạng hash SHA-256 trong bộ nhớ — không bao giờ so sánh plaintext.

### Chạy Client

```bash
# Kết nối local port 3000 đến tunnel
npx tunelo http 3000 --key tk_your_secret_key --server ws://localhost:3001

# Hoặc với subdomain cụ thể
npx tunelo http 3000 --subdomain myapp --key tk_your_secret_key
```

### Lưu cấu hình (tránh lặp lại flags)

```bash
npx tunelo config --key tk_your_secret_key --server wss://tunnel.inetdev.io.vn
npx tunelo http 3000   # dùng cấu hình đã lưu
```

## Sử dụng CLI

```
tunelo http <port>              Tạo HTTP tunnel đến local port
  -s, --subdomain <name>        Yêu cầu subdomain cụ thể
  -k, --key <apikey>            API key
  --server <url>                URL server (mặc định: wss://tunnel.inetdev.io.vn)

tunelo tcp <port>               Tạo TCP tunnel đến local port
  --remote-port <port>          Yêu cầu remote port cụ thể

tunelo config                   Cấu hình mặc định
  -k, --key <apikey>            Lưu API key mặc định
  -s, --server <url>            Lưu URL server mặc định
  --show                        Xem cấu hình hiện tại
```

Thứ tự ưu tiên: CLI flags > biến môi trường (`TUNELO_KEY`, `TUNELO_SERVER`) > `~/.tunelo/config.json`

## Cấu trúc dự án

```
tunelo/
├── packages/
│   ├── shared/    # WS protocol types, constants, error codes
│   ├── server/    # Tunnel server (HTTP + WebSocket relay)
│   └── client/    # CLI tool (npm: @achoo254/tunelo)
├── infra/         # nginx, certbot, PM2, deploy script
├── tests/         # E2E test suite
└── docs/          # Tài liệu
```

## Phát triển

```bash
pnpm dev:server    # Dev server (tsx --watch)
pnpm dev:client    # Dev client
pnpm build         # Build tất cả packages
pnpm test          # Chạy tests (vitest, 19 tests, <400ms)
pnpm lint          # Lint (biome)
pnpm lint:fix      # Auto-fix lint
```

## Triển khai lên VPS

Xem `docs/deployment-guide.md` để biết chi tiết. Tóm tắt:

1. Cấu hình DNS: `A *.tunnel.inetdev.io.vn → VPS_IP`
2. Lấy wildcard SSL: `bash infra/certbot-setup.sh`
3. Cấu hình nginx: `cp infra/nginx.conf /etc/nginx/sites-available/tunelo`
4. Triển khai: `bash infra/deploy.sh`

## Bảo mật

- API key xác thực qua so sánh hash SHA-256
- Giới hạn tốc độ WS message (tuỳ chỉnh, mặc định 1000 msg/s)
- Giới hạn kích thước body request/response (50 MB)
- Xác thực subdomain theo RFC 1123 regex
- Loại bỏ hop-by-hop headers
- Native WS ping/pong keepalive (30s interval)
- Timeout xác thực (10s) — kết nối chưa xác thực bị ngắt
- Kiểm tra `readyState` trước mọi WebSocket send — không ghi vào kết nối đã đóng
- Tắt graceful khi nhận SIGTERM/SIGINT

## Tech Stack

- **Runtime:** Node.js 20+ (ESM, TypeScript strict)
- **Server:** `http` + `ws` WebSocketServer (không framework, không Socket.IO)
- **Client:** `commander` + `chalk` + `ws`
- **Protocol:** JSON discriminated unions trên raw WebSocket
- **Testing:** vitest (19 tests — unit + E2E)
- **Lint:** Biome
- **Deploy:** nginx + PM2 + rsync

## Giấy phép

MIT
