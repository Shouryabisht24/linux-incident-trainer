#!/bin/sh
# Solved when the service is reachable on localhost/127.0.0.1, the address
# clients and health checks actually use.
set -u
if curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://127.0.0.1:8080/; then
  echo "127.0.0.1:8080 is reachable"
  exit 0
fi
echo "127.0.0.1:8080 is not reachable"
exit 1
