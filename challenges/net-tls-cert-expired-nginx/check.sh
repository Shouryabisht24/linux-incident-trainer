#!/bin/sh
# Solved when the certificate nginx is actually serving on 8443 is currently
# valid (not expired). Fetches the live server certificate rather than
# reading a file off disk, so this only passes if nginx has actually picked
# up the new certificate (e.g. via reload), not just that a valid cert exists
# somewhere on the filesystem.
set -u
CERT=$(echo | timeout 5 openssl s_client -connect localhost:8443 -servername app.internal 2>/dev/null)
if [ -z "$CERT" ]; then
  echo "could not retrieve a certificate from localhost:8443"
  exit 1
fi
if echo "$CERT" | openssl x509 -noout -checkend 0 >/dev/null 2>&1; then
  echo "the certificate nginx is serving on 8443 is currently valid"
  exit 0
fi
echo "the certificate nginx is serving on 8443 is expired (or invalid)"
exit 1
