# Tunelo

Tiếng Việt | **[English](./README.en.md)**

Self-hosted tunnel proxy. Expose local services via public HTTPS with wildcard subdomains. Your infrastructure, your rules — no cloud vendor lock-in, no artificial limits.

```bash
npx tunelo http 3000
# => https://myapp.tunnel.inetdev.io.vn
```

## Why Tunelo?

ngrok is powerful until you hit free tier limits. Tunelo is the self-hosted alternative — no rate limits, unlimited tunnels, open source.

| Feature | **Tunelo** | **ngrok Free** |
|---------|----------|---|
| Cost | Free (your VPS) | $0 |
| Endpoints | Unlimited | 3 max |
| Requests/month | Unlimited | 20k |
| Custom subdomains | Yes | No |
| Self-hosted | Yes | No |
| Open source | Yes (MIT) | No |
| Data routing | Direct (your VPS) | Via ngrok cloud |

## Architecture

```
Browser → nginx (TLS) → Tunnel Server (Express + MongoDB)
                           ↓
                      API (auth, keys, usage)
                           ↓
                      WebSocket Relay
                           ↓
Client CLI → localhost:PORT
```

## Tech Stack (v0.3)

- **Runtime:** Node.js 20+, TypeScript strict, ESM
- **Server:** Express.js + raw WebSocket relay
- **Database:** MongoDB + Mongoose (.lean() for performance)
- **Auth:** TOTP 2FA (Google Authenticator), JWT tokens (24h access, 7d refresh)
- **Encryption:** bcrypt passwords, SHA-256 API keys
- **Portals:** Admin Dashboard SPA + Client Portal SPA (both React + Vite)
- **Testing:** vitest + E2E
- **Lint:** Biome
- **Deploy:** nginx + PM2 + MongoDB

## Getting Started

### Install dependencies
```bash
git clone <repo> && cd tunelo
pnpm install && pnpm build
```

### Development
```bash
pnpm dev:server    # Server with tsx --watch
pnpm dev:client    # Client CLI
pnpm test          # Run tests
pnpm lint:fix      # Auto-fix linting
```

## Monorepo Structure

```
tunelo/
├── packages/
│   ├── shared/           # Shared types, constants, error codes
│   ├── server/           # Tunnel server (Express + WS relay + MongoDB)
│   ├── client/           # CLI tool + portal SPA
│   ├── dashboard/        # Admin Dashboard SPA (React + Vite)
├── infra/                # nginx, certbot, PM2 configs
├── docs/                 # Documentation
└── plans/                # Implementation plans
```

## Key Features (v0.3)

✅ **User Management:** Sign up, login with TOTP 2FA, manage API keys
✅ **Admin Dashboard:** See all users, tunnels, usage metrics, suspend accounts
✅ **Client Portal:** Embedded React SPA at localhost:4040, self-service key management
✅ **MongoDB:** Persistent user/key/usage storage
✅ **JWT Auth:** httpOnly cookies + CSRF protection, 24h access + 7d refresh tokens
✅ **Usage Tracking:** Per-key request counts, bandwidth, daily snapshots
✅ **Rate Limiting:** Redis-backed (swappable interface)

## Deployment

See `docs/deployment-guide.md` for full setup. Quick summary:

1. DNS: `*.tunnel.inetdev.io.vn → VPS_IP`
2. Cert: Wildcard SSL via Let's Encrypt
3. MongoDB: Running on localhost or remote
4. Env vars: `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAILS`, API keys
5. Build & deploy via PM2

## Environment Variables

```bash
# Core
MONGO_URI=mongodb://localhost/tunelo
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Admin whitelist (comma-separated emails)
ADMIN_EMAILS=admin@example.com,dev@example.com

# Server
PORT=3001
NODE_ENV=production

# Tunnel config
TUNNEL_DOMAIN=tunnel.inetdev.io.vn
TUNNEL_PORT=3001
```

## API Examples

### Sign up
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
```

### Generate TOTP secret
```bash
curl -X POST http://localhost:3001/api/auth/totp-setup \
  -H "Authorization: Bearer {accessToken}"
```

### Create API key
```bash
curl -X POST http://localhost:3001/api/keys \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{"label":"My Device"}'
```

## Security

- TOTP 2FA mandatory for all users
- API keys stored as SHA-256 hashes
- Passwords hashed with bcrypt
- Hop-by-hop headers stripped from relay
- httpOnly cookies + CSRF tokens
- Rate limiting: 100 msg/s per WS connection
- Max body: 10 MB
- Request timeout: 30s

## Roadmap

- **v0.2:** WebSocket pass-through, binary streaming, standalone binary
- **v0.3 (current):** MongoDB, user mgmt, TOTP 2FA, dual portals
- **v0.4:** Custom domains, TCP raw tunnels, request replay
- **v0.5:** Multi-server scaling, Redis, load balancing

## License

MIT
