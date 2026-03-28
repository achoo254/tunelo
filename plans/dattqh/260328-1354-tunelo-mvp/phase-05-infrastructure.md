# Phase 5: Infrastructure

## Overview
- **Priority:** P2
- **Status:** completed
- **Effort:** 2.5h
- **Depends on:** Phase 3
- **Description:** nginx config, TLS (Let's Encrypt wildcard), DNS, PM2 process management, deployment script.

## Key Insights
- nginx does TLS termination + wildcard subdomain routing — Node.js stays simple
- DNS-01 challenge required for wildcard cert (HTTP-01 can't do wildcards)
- PM2 handles restart, log rotation, cluster mode if needed
- Deploy via rsync — simple, no CI/CD overhead for MVP

## Requirements

### Functional
- nginx serves `*.tunnel.inetdev.io.vn` with valid TLS
- All subdomain requests proxy to tunnel server (port 3001)
- WebSocket upgrade headers passed through
- PM2 manages tunnel server process
- Deployment script syncs code + restarts

### Non-functional
- TLS cert auto-renewal (certbot timer)
- Zero-downtime restart
- Log rotation

## Related Code Files

### Files to Create
- `infra/nginx.conf` — nginx site config for wildcard subdomain
- `infra/certbot-setup.sh` — Let's Encrypt wildcard cert setup
- `infra/pm2.config.js` — PM2 ecosystem config
- `infra/deploy.sh` — deployment script

## Implementation Steps

### 1. nginx.conf

```nginx
# /etc/nginx/sites-available/tunelo

# Redirect bare domain to docs/landing (optional)
server {
    listen 80;
    server_name tunnel.inetdev.io.vn *.tunnel.inetdev.io.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tunnel.inetdev.io.vn *.tunnel.inetdev.io.vn;

    ssl_certificate /etc/letsencrypt/live/tunnel.inetdev.io.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tunnel.inetdev.io.vn/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy to tunnel server
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # WebSocket upgrade support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Pass original headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_read_timeout 86400s;   # 24h for WS connections
        proxy_send_timeout 86400s;

        # Buffering off for streaming
        proxy_buffering off;
    }
}
```

Key points:
- `proxy_read_timeout 86400s` keeps WS connections alive for 24h
- `proxy_buffering off` enables streaming responses
- Host header preserved for subdomain extraction in server

### 2. certbot-setup.sh

```bash
#!/bin/bash
# Setup Let's Encrypt wildcard cert for *.tunnel.inetdev.io.vn
# Requires DNS-01 challenge — manual or Cloudflare plugin

set -e

DOMAIN="tunnel.inetdev.io.vn"

# Option A: Manual DNS challenge (interactive)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns-01 \
  -d "$DOMAIN" \
  -d "*.$DOMAIN"

# Option B: Cloudflare DNS plugin (automated)
# sudo apt install python3-certbot-dns-cloudflare
# Create /etc/letsencrypt/cloudflare.ini with:
#   dns_cloudflare_api_token = YOUR_TOKEN
# sudo chmod 600 /etc/letsencrypt/cloudflare.ini
# sudo certbot certonly \
#   --dns-cloudflare \
#   --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
#   -d "$DOMAIN" \
#   -d "*.$DOMAIN"

# Auto-renewal (certbot installs timer by default)
# Verify: sudo systemctl list-timers | grep certbot

# Reload nginx after renewal
echo 'deploy-hook = systemctl reload nginx' | \
  sudo tee -a /etc/letsencrypt/renewal/$DOMAIN.conf
```

### 3. DNS Setup (documentation)

Required DNS records:
```
A     tunnel.inetdev.io.vn       → <VPS_IP>
A     *.tunnel.inetdev.io.vn     → <VPS_IP>
```

Or if using Cloudflare:
- A record for `tunnel` → VPS IP (DNS only, not proxied)
- A record for `*.tunnel` → VPS IP (DNS only, not proxied)

**Important:** Cloudflare proxy must be OFF (DNS only/gray cloud) — we handle TLS ourselves.

### 4. pm2.config.js

```javascript
module.exports = {
  apps: [{
    name: 'tunelo-server',
    script: 'packages/server/dist/server.js',
    cwd: '/opt/tunelo',
    instances: 1,              // Single instance (in-memory state)
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      TUNNEL_PORT: 3001,
      API_KEYS_FILE: '/opt/tunelo/keys.json',
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/tunelo/error.log',
    out_file: '/var/log/tunelo/out.log',
    merge_logs: true,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    // Auto-restart
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
```

### 5. deploy.sh

```bash
#!/bin/bash
set -e

VPS_HOST="${VPS_HOST:-root@your-vps-ip}"
REMOTE_DIR="/opt/tunelo"

echo "Building..."
npm run build

echo "Syncing to VPS..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude keys.json \
  ./ "$VPS_HOST:$REMOTE_DIR/"

echo "Installing dependencies on VPS..."
ssh "$VPS_HOST" "cd $REMOTE_DIR && npm install --production"

echo "Restarting tunelo server..."
ssh "$VPS_HOST" "cd $REMOTE_DIR && pm2 reload tunelo-server || pm2 start infra/pm2.config.js"

echo "Deploy complete!"
ssh "$VPS_HOST" "pm2 status tunelo-server"
```

### 6. VPS Initial Setup Checklist

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install PM2
sudo npm install -g pm2

# 3. Install nginx + certbot
sudo apt install -y nginx certbot

# 4. Create app directory
sudo mkdir -p /opt/tunelo /var/log/tunelo

# 5. Setup SSL cert (run certbot-setup.sh)

# 6. Copy nginx config
sudo cp infra/nginx.conf /etc/nginx/sites-available/tunelo
sudo ln -s /etc/nginx/sites-available/tunelo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. Create keys.json
echo '{ "keys": ["tk_your_first_key"] }' > /opt/tunelo/keys.json
chmod 600 /opt/tunelo/keys.json

# 8. First deploy (run deploy.sh)

# 9. PM2 startup
pm2 startup
pm2 save
```

## Todo List
- [x] Create infra/nginx.conf with wildcard subdomain + WS upgrade
- [x] Create infra/certbot-setup.sh for wildcard SSL
- [x] Create infra/pm2.config.js
- [x] Create infra/deploy.sh
- [x] Setup DNS records (A + wildcard A)
- [x] Run certbot, get wildcard cert
- [x] Enable nginx config, test with curl
- [x] Deploy server, verify PM2 manages it
- [x] Test full chain: browser → nginx → server

## Success Criteria
- `https://tunnel.inetdev.io.vn/health` returns 200 with valid TLS
- `https://test.tunnel.inetdev.io.vn` reaches tunnel server
- WS connections through nginx stay alive for extended periods
- PM2 auto-restarts server on crash
- `deploy.sh` updates server with zero downtime

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| DNS propagation delay | Setup DNS early, use low TTL (300s) |
| Certbot DNS-01 challenge fails | Have manual fallback, document Cloudflare plugin |
| nginx misconfiguration drops WS | Test with wscat through nginx explicitly |
| PM2 restart loses active tunnels | Clients auto-reconnect; acceptable for MVP |
| VPS goes down | PM2 startup ensures restart on boot |

## Security Considerations
- SSL/TLS enforced (HTTP → HTTPS redirect)
- keys.json file permissions 600
- nginx rate limiting can be added later
- PM2 runs as non-root user (recommended)
- Firewall: only 80, 443 open; 3001 blocked externally
