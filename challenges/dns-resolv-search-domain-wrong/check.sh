#!/bin/sh
# Solved when the short name "db" resolves (via the search domain) to the app
# that's actually running, i.e. the real DNS records were never the problem.
set -u
if curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://db:8080/; then
  echo "http://db:8080/ resolves and is reachable"
  exit 0
fi
echo "http://db:8080/ does not resolve or is not reachable"
exit 1
