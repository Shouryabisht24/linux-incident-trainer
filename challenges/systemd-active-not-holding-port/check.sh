#!/bin/sh
# Solved when the real app is actually reachable on 8080 -- not merely when
# `systemctl is-active webapp` says active, since that's exactly the
# misleading signal this challenge is about.
set -u
if curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://localhost:8080/; then
  echo "the real webapp is serving on 8080"
  exit 0
fi
echo "port 8080 is not actually served by the real app"
exit 1
