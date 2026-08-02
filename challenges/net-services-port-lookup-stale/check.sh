#!/bin/sh
set -u
if curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://localhost:8080/; then
  echo "myapp reachable on port 8080"
  exit 0
fi
echo "nothing serving on port 8080"
exit 1
