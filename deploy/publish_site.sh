#!/usr/bin/env bash
# Puts the Hatchline website on this server, served by the Caddy that already fronts the render gateway.
#
#   sudo bash /tmp/website/deploy/publish_site.sh hatchline.my
#
# What it does (and nothing else):
#   1. checks it is root, that Caddy is installed, and that the gateway's Caddyfile loads /etc/caddy/sites/*.caddy (re-run install_gateway.sh from this version if it does not)
#   2. warns, without stopping, if the domain does not point at this server yet (Let's Encrypt cannot give a certificate until it does)
#   3. copies the folder /tmp/website to /var/www/hatchline (the old copy is kept as /var/www/hatchline.previous)
#   4. writes /etc/caddy/sites/hatchline-site.caddy: https for the domain, www sent to the bare domain, the new page at the front door, the old page and its sections at /index.html
#   5. checks the Caddy files are valid, then reloads Caddy (the gateway keeps answering: it is a reload, not a restart)
# It never touches the gateway, its database or its keys.
set -euo pipefail

DOMAIN="${1:-}"
SRC="${2:-/tmp/website}"
WEB=/var/www/hatchline
CONF=/etc/caddy/sites/hatchline-site.caddy

[ "$(id -u)" -eq 0 ] || { echo "Run this as root (sudo bash $0 hatchline.my)."; exit 1; }
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "Give the domain: sudo bash $0 hatchline.my"; exit 1; }
[ -f "$SRC/index-new.html" ] && [ -f "$SRC/index.html" ] || { echo "$SRC does not look like the website folder (index.html and index-new.html are missing). Copy it first: scp -4 -r website root@<server>:/tmp/"; exit 1; }
command -v caddy >/dev/null 2>&1 || { echo "Caddy is not installed: run the gateway installer first (render-service/deploy/install_gateway.sh)."; exit 2; }
[ -f /etc/caddy/Caddyfile ] || { echo "There is no /etc/caddy/Caddyfile: run the gateway installer first."; exit 3; }
if ! grep -q "import /etc/caddy/sites" /etc/caddy/Caddyfile; then
  # the gateway's Caddyfile is the only thing in it: keep a copy, then add one line that loads the site files, so the site and a later gateway update never overwrite each other
  grep -q "Hatchline render gateway" /etc/caddy/Caddyfile || { echo "The Caddyfile is not the one the gateway installer wrote: I will not edit it. Send me its contents."; exit 3; }
  cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M)"
  mkdir -p /etc/caddy/sites
  printf '
# other sites on this server live in their own files here
import /etc/caddy/sites/*.caddy
' >> /etc/caddy/Caddyfile
  echo "added the line that loads /etc/caddy/sites/*.caddy (a copy of the old Caddyfile is kept beside it)"
fi
mkdir -p /etc/caddy/sites

echo "== 1. the domain =="
SERVER_IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
for h in "$DOMAIN" "www.$DOMAIN"; do
  got="$(getent ahostsv4 "$h" 2>/dev/null | awk 'NR==1{print $1}' || true)"
  if [ -n "$SERVER_IP" ] && [ "$got" = "$SERVER_IP" ]; then echo "ok: $h points at this server ($SERVER_IP)"
  else echo "WARNING: $h points at '${got:-nothing}', this server is '${SERVER_IP:-unknown}'. Make an A record for it at your domain provider; until it resolves here the certificate cannot be issued."; fi
done

echo "== 2. the files =="
mkdir -p "$WEB"
if [ -n "$(ls -A "$WEB" 2>/dev/null)" ]; then rm -rf "$WEB.previous"; cp -a "$WEB" "$WEB.previous"; fi
rm -rf "${WEB:?}"/*
cp -a "$SRC"/. "$WEB"/
rm -rf "$WEB/deploy" "$WEB/README.md" "$WEB/.git" "$WEB/.gitignore"
chmod -R a+rX "$WEB"
echo "copied to $WEB ($(du -sh "$WEB" | cut -f1))"

echo "== 3. Caddy =="
cat > "$CONF" <<CADDY
# The Hatchline website (written by website/deploy/publish_site.sh)
www.$DOMAIN {
    redir https://$DOMAIN{uri} permanent
}
$DOMAIN {
    encode zstd gzip
    root * $WEB
    @front path /
    rewrite @front /index-new.html
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=86400"
    file_server
}
CADDY
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl reload caddy
sleep 2
systemctl is-active caddy >/dev/null && echo "Caddy reloaded and running" || { echo "Caddy is not running: journalctl -u caddy -n 50"; exit 4; }

echo
echo "Done. Check:  curl -I https://$DOMAIN/    (200 once the certificate is issued, a minute or two after the DNS record is right)"
echo "The render gateway is unchanged:  curl https://$(hostname -f 2>/dev/null || echo this-server)/health"
echo "To go back to the previous copy of the site:  rm -rf $WEB && mv $WEB.previous $WEB   (nothing to reload)"
