#!/bin/sh
# Run by the backend (as root) to verify the challenge is solved.
# Exit 0 = solved, non-zero = not solved yet.

if ! pgrep -x nginx >/dev/null 2>&1; then
  echo "nginx is not running"
  exit 1
fi

if ! curl -sf -o /dev/null http://localhost:80/; then
  echo "nginx is running but not returning a successful (2xx) response on port 80"
  exit 1
fi

echo "nginx is running and serving a successful response on port 80"
exit 0
