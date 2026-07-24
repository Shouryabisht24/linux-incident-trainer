#!/bin/sh
# Solved when the real web service is actually reachable on 8080.
set -u
if curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://localhost:8080/; then
  echo "localhost:8080 is served by the real app"
  exit 0
fi
echo "localhost:8080 is not reachable"
exit 1
