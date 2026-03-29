#!/bin/bash
set -e

VPS_HOST="${VPS_HOST:-root@your-vps-ip}"
REMOTE_DIR="/opt/tunelo"

echo "=== Tunelo Deploy ==="

echo "Building bundle..."
pnpm build:server

echo "Syncing to VPS..."
rsync -avz --delete \
  dist/server.mjs \
  dist/server.mjs.map \
  "$VPS_HOST:$REMOTE_DIR/"

echo "Restarting tunelo server..."
ssh "$VPS_HOST" "cd $REMOTE_DIR && pm2 reload tunelo || pm2 start server.mjs --name tunelo"

echo "Deploy complete!"
ssh "$VPS_HOST" "pm2 status tunelo"
