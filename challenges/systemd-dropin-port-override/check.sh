#!/bin/sh
set -u
if curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://localhost:8080/; then
  echo "webapp is answering on its documented port 8080"
  exit 0
fi
echo "nothing answered on port 8080"
exit 1
