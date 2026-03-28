# Deployment Guide

## Prerequisites

- VPS: Ubuntu 22.04+, 2-4 vCPU, 4-8GB RAM
- Domain: `*.tunnel.inetdev.io.vn` with DNS access
- Node.js 20+ installed on VPS
- pnpm installed on VPS

## DNS Setup

Add wildcard A record:
```
*.tunnel.inetdev.io.vn  →  <VPS_IP>
tunnel.inetdev.io.vn    →  <VPS_IP>
```

## SSL Certificate (Let's Encrypt)

Wildcard certs require DNS-01 challenge:

```bash
# Install certbot
sudo apt install certbot

# Request wildcard cert (manual DNS verification)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d tunnel.inetdev.io.vn \
  -d "*.tunnel.inetdev.io.vn"

# Follow prompts to add TXT record:
# _acme-challenge.tunnel.inetdev.io.vn → <provided-value>

# Auto-renewal cron (runs twice daily)
# Certbot installs this automatically
```

Cert location: `/etc/letsencrypt/live/tunnel.inetdev.io.vn/`

## nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name ~^(?<subdomain>.+)\.tunnel\.inetdev\.io\.vn$;

    ssl_certificate /etc/letsencrypt/live/tunnel.inetdev.io.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tunnel.inetdev.io.vn/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Subdomain $subdomain;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name *.tunnel.inetdev.io.vn tunnel.inetdev.io.vn;
    return 301 https://$host$request_uri;
}

# Tunnel server WS endpoint (control plane)
server {
    listen 443 ssl;
    server_name tunnel.inetdev.io.vn;

    ssl_certificate /etc/letsencrypt/live/tunnel.inetdev.io.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tunnel.inetdev.io.vn/privkey.pem;

    location /tunnel {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    location /health {
        proxy_pass http://127.0.0.1:3001/health;
    }
}
```

## PM2 Setup

```bash
# Install PM2 globally
sudo npm install -g pm2

# Build and deploy
cd /opt/tunelo
pnpm install --frozen-lockfile
pnpm build

# Start using config file
pm2 start infra/pm2.config.cjs

# Save for auto-start on reboot
pm2 save
pm2 startup
```

PM2 config (`infra/pm2.config.cjs`):
```javascript
module.exports = {
  apps: [{
    name: 'tunelo-server',
    script: 'packages/server/dist/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      TUNELO_API_KEYS: '<sha256-hash-1>,<sha256-hash-2>'
    }
  }]
};
```

**Note:** API key hashes must be SHA-256 hashes of the plaintext keys. Generate with:
```bash
echo -n "your-secret-key" | sha256sum
```

## Deploy Steps (MVP)

```bash
# On VPS as deploy user
git clone <repo> /opt/tunelo
cd /opt/tunelo

# Install dependencies (pnpm workspace)
pnpm install --frozen-lockfile

# Build all packages (TypeScript compilation)
pnpm build

# Generate API key hashes
echo -n "your-secret-key" | sha256sum

# Edit PM2 config with actual API key hashes
vim infra/pm2.config.cjs

# Start tunnel server
pm2 start infra/pm2.config.cjs

# Verify it's running
pm2 status
curl http://localhost:3001/health  # Should return 200 OK
```

**Verify Deployment:**
```bash
# Check server logs
pm2 logs tunelo-server

# Test tunnel endpoint from local machine
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
  https://tunnel.inetdev.io.vn/tunnel

# Should upgrade connection successfully
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `TUNELO_API_KEYS` | Yes | Comma-separated SHA-256 key hashes |
| `TUNELO_DOMAIN` | No | Base domain (default: tunnel.inetdev.io.vn) |
| `NODE_ENV` | No | production / development |
