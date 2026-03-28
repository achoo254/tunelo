# Deployment Guide

## Prerequisites

- VPS: Ubuntu 22.04+, 2-4 vCPU, 4-8GB RAM
- Domain: `*.tunnel.inetdev.io.vn` with DNS access
- Node.js 20+ installed on VPS
- pnpm installed on VPS
- MongoDB 5.0+ (v0.3: can run on same VPS or remote host)
- Email service (for future notifications, optional)

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

## MongoDB Setup (v0.3+)

### Option A: Local MongoDB (Same VPS)

```bash
# Install MongoDB Community Edition
curl -fsSL https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
sudo apt update && sudo apt install -y mongodb-org

# Start and enable
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify
mongo --eval "db.version()"

# Create tunelo database + indexes
mongo << 'EOF'
use tunelo
db.users.createIndex({ "email": 1 }, { unique: true })
db.apikeys.createIndex({ "userId": 1 })
db.apikeys.createIndex({ "keyHash": 1 }, { unique: true })
db.usagelogs.createIndex({ "keyId": 1 })
db.usagelogs.createIndex({ "date": 1 })
EOF

# Set connection string in .env
echo "MONGO_URI=mongodb://localhost/tunelo" >> /opt/tunelo/.env
```

### Option B: Remote MongoDB (e.g., Atlas)

1. Create cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create database user (username + password)
3. Whitelist VPS IP in Network Access
4. Copy connection string

```bash
# .env example
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/tunelo?retryWrites=true&w=majority
```

### Database Initialization

Server will auto-create collections and indexes on startup via Mongoose schemas.

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

      // Database (v0.3+)
      MONGO_URI: 'mongodb://localhost/tunelo',

      // JWT tokens
      JWT_SECRET: 'your-secret-key-min-32-chars',
      JWT_REFRESH_SECRET: 'your-refresh-key-min-32-chars',

      // Admin email whitelist (comma-separated)
      ADMIN_EMAILS: 'admin@example.com,dev@example.com',

      // Tunnel config
      TUNNEL_DOMAIN: 'tunnel.inetdev.io.vn'
    }
  }]
};
```

**Important Environment Variables:**

| Var | Type | Example | Notes |
|-----|------|---------|-------|
| `MONGO_URI` | String | `mongodb://localhost/tunelo` | v0.3: Required for user/key storage |
| `JWT_SECRET` | String | 32+ random chars | Used to sign access tokens (24h) |
| `JWT_REFRESH_SECRET` | String | 32+ random chars | Used to sign refresh tokens (7d) |
| `ADMIN_EMAILS` | String | `admin@ex.com,dev@ex.com` | Comma-separated emails with admin access |
| `TUNNEL_DOMAIN` | String | `tunnel.inetdev.io.vn` | Used in URLs + wildcard cert validation |
| `NODE_ENV` | String | `production` | Controls logging, error details |

**Generate secure secrets:**
```bash
# Generate random 32-char string
openssl rand -base64 24
```

## Deploy Steps (v0.3)

```bash
# On VPS as deploy user
git clone <repo> /opt/tunelo
cd /opt/tunelo

# Install dependencies (pnpm workspace)
pnpm install --frozen-lockfile

# Build all packages (TypeScript + Vite)
pnpm build

# (v0.3) Generate secrets
JWT_SECRET=$(openssl rand -base64 24)
JWT_REFRESH_SECRET=$(openssl rand -base64 24)
echo "JWT_SECRET: $JWT_SECRET"
echo "JWT_REFRESH_SECRET: $JWT_REFRESH_SECRET"

# (v0.3) Set up MongoDB
# ... (see MongoDB Setup section above)

# Edit PM2 config with secrets + MongoDB URI
vim infra/pm2.config.cjs
# Set: MONGO_URI, JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_EMAILS

# Start tunnel server
pm2 start infra/pm2.config.cjs

# Verify it's running
pm2 status
curl http://localhost:3001/health  # Should return 200 OK
curl http://localhost:3001/api/admin/users \
  -H "Authorization: Bearer {admin_token}"  # Protected endpoint
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

## Environment Variables Summary

### Core (v0.1+)

| Variable | Required | Type | Default | Notes |
|----------|----------|------|---------|-------|
| `PORT` | No | Number | 3001 | Server listening port |
| `NODE_ENV` | No | String | development | production / development |

### Database & Auth (v0.3+)

| Variable | Required | Type | Example | Notes |
|----------|----------|------|---------|-------|
| `MONGO_URI` | Yes | String | `mongodb://localhost/tunelo` | Connection string (local or Atlas) |
| `JWT_SECRET` | Yes | String | (32+ random chars) | Sign access tokens (24h expiry) |
| `JWT_REFRESH_SECRET` | Yes | String | (32+ random chars) | Sign refresh tokens (7d expiry) |
| `ADMIN_EMAILS` | No | String | `admin@ex.com,dev@ex.com` | Comma-separated admin emails |
| `TUNNEL_DOMAIN` | No | String | `tunnel.inetdev.io.vn` | Base domain for tunnels |

### Optional (Future)

| Variable | Purpose |
|----------|---------|
| `REDIS_URI` | Redis connection (v0.3+, for rate limiting) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email service (future notifications) |

### .env.example Template

```bash
# Server
PORT=3001
NODE_ENV=production

# Database
MONGO_URI=mongodb://localhost/tunelo

# JWT
JWT_SECRET=your-32-char-secret-here-generate-new
JWT_REFRESH_SECRET=your-32-char-secret-here-generate-new

# Admin whitelist
ADMIN_EMAILS=admin@example.com

# Tunnel config
TUNNEL_DOMAIN=tunnel.inetdev.io.vn
```
