#!/bin/sh
set -u
if curl -sf --connect-timeout 3 -o /dev/null http://localhost:8080/; then
  echo "service reachable on port 8080"
  exit 0
fi
echo "nothing serving on port 8080"
exit 1
