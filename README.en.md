# Tunelo

**[Tieng Viet](./README.md)** | English

Self-hosted tunnel proxy that exposes local services via public HTTPS wildcard subdomains. Your infrastructure, your rules — no cloud dependency, no artificial limits.

```
npx tunelo http 3000
# => https://myapp.tunnel.inetdev.io.vn
```

## Why Tunelo?

ngrok is great — until you hit the free tier wall. Tunelo is a self-hosted alternative that removes those limits entirely.

### Tunelo vs ngrok

| | **Tunelo** (self-hosted) | **ngrok Free** | **ngrok Pay-as-you-go** |
|---|---|---|---|
| **Cost** | Free (your VPS) | $0 | $20+/month |
| **Endpoints** | Unlimited | 3 max | Unlimited |
| **Bandwidth** | Unlimited (VPS limit) | 1 GB/month | 5 GB included, then $0.10/GB |
| **Requests** | Unlimited | 20k/month | 100k included, then $1/100k |
| **Rate limit** | Configurable | 4k req/min | 20k req/min |
| **Custom subdomains** | Yes (wildcard `*.your-domain`) | No | Yes |
| **Self-hosted** | Yes | No | No |
| **Open source** | Yes (MIT) | No (proprietary) | No (proprietary) |
| **Data routing** | Direct (your server) | Through ngrok cloud | Through ngrok cloud |
| **Interstitial page** | None | Yes (free tier) | None |

> **Sources:** [ngrok Pricing](https://ngrok.com/pricing) | [ngrok Agent Docs](https://ngrok.com/docs/agent/)

### Why Not Other Alternatives?

| Tool | Trade-off |
|------|-----------|
| **Cloudflare Tunnel** | Free but requires Cloudflare — still cloud-dependent, vendor lock-in |
| **FRP** | Self-hosted & battle-tested (100k+ GitHub stars), but steeper learning curve, no out-of-box HTTPS |
| **localtunnel** | Unmaintained since 2024, public servers unreliable |
| **bore** | TCP-only, no HTTP/HTTPS support |

Tunelo targets the sweet spot: **ngrok-like simplicity** + **FRP-like self-hosting** + **out-of-box HTTPS** via wildcard certs.

## How It Works

```
Browser → nginx (TLS, wildcard cert) → Tunnel Server (WS) → Client CLI → localhost:PORT
```

1. Client CLI connects to tunnel server via WebSocket
2. Server assigns a public subdomain (e.g. `myapp.tunnel.inetdev.io.vn`)
3. HTTP requests to that subdomain are relayed through the WS connection to your local service

### Performance

Tunelo uses the raw [`ws`](https://github.com/websockets/ws) library (189M+ weekly npm downloads) instead of Socket.IO for maximum performance:

| Metric | ws (Tunelo) | Socket.IO | Improvement |
|--------|-------------|-----------|-------------|
| Memory per connection | ~3 KB | ~8 KB | 2.7x less |
| Latency (p99, 1K clients) | ~12 ms | ~32 ms | 2.7x faster |
| Throughput | 44K+ msg/s | 27K msg/s | 1.6x more |
| Connection handshake | <50 ms | ~186 ms | 3.7x faster |

At 5K concurrent tunnels, Tunelo uses ~15-20 MB server memory vs ~150-200 MB with Socket.IO.

> **Sources:** [ResearchGate: WebSocket Library Benchmarks (2024)](https://www.researchgate.net/publication/397311491) | [DEV Community: ws vs socket.io](https://dev.to/alex_aslam/nodejs-websockets-when-to-use-ws-vs-socketio-and-why-we-switched-di9)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install & Build

```bash
git clone <repo-url> && cd tunelo
pnpm install
pnpm build
```

### Run Server (Development)

```bash
pnpm dev:server
```

Server starts on port 3001 by default. Configure via `.env`:

```bash
cp .env.example .env
# Edit TUNNEL_PORT, API_KEYS_FILE as needed
```

### API Keys

Create a `keys.json` file (see `packages/server/keys.json.example`):

```json
{
  "keys": ["tk_your_secret_key"]
}
```

Keys are stored hashed (SHA-256) in memory — never compared in plaintext.

### Run Client

```bash
# Connect local port 3000 to a tunnel
npx tunelo http 3000 --key tk_your_secret_key --server ws://localhost:3001

# Or with a specific subdomain
npx tunelo http 3000 --subdomain myapp --key tk_your_secret_key
```

### Save Config (avoid repeating flags)

```bash
npx tunelo config --key tk_your_secret_key --server wss://tunnel.inetdev.io.vn
npx tunelo http 3000   # uses saved config
```

## CLI Usage

```
tunelo http <port>              Create HTTP tunnel to local port
  -s, --subdomain <name>        Request specific subdomain
  -k, --key <apikey>            API key
  --server <url>                Server URL (default: wss://tunnel.inetdev.io.vn)

tunelo tcp <port>               Create TCP tunnel to local port
  --remote-port <port>          Request specific remote port

tunelo config                   Set default configuration
  -k, --key <apikey>            Save default API key
  -s, --server <url>            Save default server URL
  --show                        Show current config
```

Config priority: CLI flags > env vars (`TUNELO_KEY`, `TUNELO_SERVER`) > `~/.tunelo/config.json`

## Project Structure

```
tunelo/
├── packages/
│   ├── shared/    # WS protocol types, constants, error codes
│   ├── server/    # Tunnel server (HTTP + WebSocket relay)
│   └── client/    # CLI tool (npm: @achoo254/tunelo)
├── infra/         # nginx, certbot, PM2, deploy script
├── tests/         # E2E test suite
└── docs/          # Documentation
```

## Development

```bash
pnpm dev:server    # Dev server (tsx --watch)
pnpm dev:client    # Dev client
pnpm build         # Build all packages
pnpm test          # Run tests (vitest, 19 tests, <400ms)
pnpm lint          # Lint (biome)
pnpm lint:fix      # Auto-fix lint
```

## Deploy to VPS

See `docs/deployment-guide.md` for full instructions. Quick summary:

1. Setup DNS: `A *.tunnel.inetdev.io.vn → VPS_IP`
2. Get wildcard SSL: `bash infra/certbot-setup.sh`
3. Configure nginx: `cp infra/nginx.conf /etc/nginx/sites-available/tunelo`
4. Deploy: `bash infra/deploy.sh`

## Security

- API keys validated via SHA-256 hash comparison
- WS message rate limiting (configurable, default 1000 msg/s)
- Request/response body size limit (50 MB)
- Subdomain validation via RFC 1123 regex
- Hop-by-hop header stripping
- Native WS ping/pong keepalive (30s interval)
- Auth timeout (10s) — unauthenticated connections terminated
- `readyState` guard on all WebSocket sends — no writes to closed connections
- Graceful shutdown on SIGTERM/SIGINT

## Tech Stack

- **Runtime:** Node.js 20+ (ESM, TypeScript strict)
- **Server:** `http` + `ws` WebSocketServer (no framework, no Socket.IO)
- **Client:** `commander` + `chalk` + `ws`
- **Protocol:** JSON discriminated unions over raw WebSocket
- **Testing:** vitest (19 tests — unit + E2E)
- **Lint:** Biome
- **Deploy:** nginx + PM2 + rsync

## License

MIT
