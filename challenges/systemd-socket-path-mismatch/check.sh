#!/bin/sh
set -u
if curl -sf --unix-socket /run/notify-relay.sock --connect-timeout 3 --max-time 5 -o /dev/null http://localhost/; then
  echo "notify-relay answered on /run/notify-relay.sock"
  exit 0
fi
echo "nothing answered on /run/notify-relay.sock"
exit 1
