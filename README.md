# Tunelo

Self-hosted [ngrok](https://ngrok.com) alternative. Expose local services via public HTTPS wildcard subdomains (`*.tunnel.inetdev.io.vn`).

## How It Works

```
Browser → nginx (TLS, wildcard cert) → Tunnel Server (WS) → Client CLI → localhost:PORT
```

1. Client CLI connects to tunnel server via WebSocket
2. Server assigns a public subdomain (e.g. `myapp.tunnel.inetdev.io.vn`)
3. HTTP requests to that subdomain are relayed through the WS connection to your local service

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
│   └── client/    # CLI tool
├── infra/         # nginx, certbot, PM2, deploy script
├── tests/         # E2E test suite
└── docs/          # Documentation
```

## Development

```bash
pnpm dev:server    # Dev server (tsx --watch)
pnpm dev:client    # Dev client
pnpm build         # Build all packages
pnpm test          # Run tests (vitest)
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
- WS message rate limiting (100 msg/s)
- Request/response body size limit (10MB)
- Subdomain validation via regex
- Hop-by-hop header stripping
- Graceful shutdown on SIGTERM/SIGINT

## Tech Stack

- **Runtime:** Node.js 20+ (ESM, TypeScript strict)
- **Server:** `http` + `ws` (no framework)
- **Client:** `commander` + `chalk` + `ws`
- **Testing:** vitest (19 tests, <400ms)
- **Lint:** Biome
- **Deploy:** nginx + PM2 + rsync

## License

MIT
