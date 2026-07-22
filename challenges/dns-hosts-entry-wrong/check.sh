#!/bin/sh
# Solved when api.internal resolves such that the service is reachable.
set -u
if curl -sf --connect-timeout 3 -o /dev/null http://api.internal:8080/; then
  echo "api.internal:8080 is reachable"
  exit 0
fi
echo "api.internal:8080 is not reachable (name resolution?)"
exit 1
