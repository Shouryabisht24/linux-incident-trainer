#!/bin/sh
set -u
BODY=$(curl -s --connect-timeout 3 http://localhost:8080/ 2>/dev/null)
if printf '%s' "$BODY" | grep -q "backend ok"; then
  echo "proxy reaches the backend (200 backend ok)"
  exit 0
fi
echo "proxy is not reaching the backend: '$BODY'"
exit 1
