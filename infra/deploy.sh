#!/bin/bash
set -e

VPS_HOST="${VPS_HOST:-root@your-vps-ip}"
REMOTE_DIR="/opt/tunelo"

echo "=== Tunelo Deploy ==="

echo "Building..."
pnpm build

echo "Syncing to VPS..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude keys.json \
  --exclude .git \
  ./ "$VPS_HOST:$REMOTE_DIR/"

echo "Installing dependencies on VPS..."
ssh "$VPS_HOST" "cd $REMOTE_DIR && npm install --production"

echo "Restarting tunelo server..."
ssh "$VPS_HOST" "cd $REMOTE_DIR && pm2 reload tunelo-server || pm2 start infra/pm2.config.cjs"

echo "Deploy complete!"
ssh "$VPS_HOST" "pm2 status tunelo-server"
