#!/bin/sh
# Solved when, after a forced logrotate run, the orderapi service account
# (not root) can actually write a new line into the post-rotation log file.
# Runs as root, but the actual write attempt is done as the `orderapi`
# account -- root ignores DAC permissions, so only checking as the real
# unprivileged actor proves anything (decision 0007).
set -u
rm -f /var/log/orderapi/orderapi.log.1 /var/lib/logrotate/status

# Make sure there's something to rotate, regardless of how many times this
# script has already run (root can always top this up, even when the real
# orderapi account can't -- that asymmetry is the whole point of the check
# below, not a reason to fail here).
mkdir -p /var/log/orderapi
SIZE=$(stat -c %s /var/log/orderapi/orderapi.log 2>/dev/null || echo 0)
if [ "$SIZE" -eq 0 ]; then
  echo "$(date -Is) orderapi: keepalive" >> /var/log/orderapi/orderapi.log
fi

logrotate --force /etc/logrotate.d/orderapi >/tmp/logrotate-check.out 2>&1

if [ ! -f /var/log/orderapi/orderapi.log.1 ]; then
  echo "rotation itself did not happen:"
  cat /tmp/logrotate-check.out
  exit 1
fi

MARK="MARK_$$_$(date +%s)"
if su -s /bin/sh orderapi -c "echo \"$MARK\" >> /var/log/orderapi/orderapi.log" 2>/tmp/write-check.out; then
  if grep -q "$MARK" /var/log/orderapi/orderapi.log 2>/dev/null; then
    echo "orderapi can write to its new post-rotation log file"
    exit 0
  fi
fi

echo "orderapi (the real service account) still cannot write to the new log file after rotation:"
cat /tmp/write-check.out 2>/dev/null
ls -l /var/log/orderapi/orderapi.log
exit 1
