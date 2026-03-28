#!/bin/bash
# Setup Let's Encrypt wildcard cert for *.tunnel.inetdev.io.vn
# Requires DNS-01 challenge
set -e

DOMAIN="tunnel.inetdev.io.vn"

echo "=== Tunelo SSL Certificate Setup ==="
echo "Domain: $DOMAIN + *.$DOMAIN"
echo ""

# Option A: Manual DNS challenge (interactive)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns-01 \
  -d "$DOMAIN" \
  -d "*.$DOMAIN"

# Option B: Cloudflare DNS plugin (automated) — uncomment if using Cloudflare
# sudo apt install -y python3-certbot-dns-cloudflare
# sudo certbot certonly \
#   --dns-cloudflare \
#   --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
#   -d "$DOMAIN" \
#   -d "*.$DOMAIN"

# Auto-reload nginx after cert renewal
echo 'deploy-hook = systemctl reload nginx' | \
  sudo tee -a "/etc/letsencrypt/renewal/$DOMAIN.conf"

echo "SSL setup complete. Verify: sudo systemctl list-timers | grep certbot"
