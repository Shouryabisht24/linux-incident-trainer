#!/bin/sh
# Solved when a fresh message sent through the app's logger actually reaches
# /var/log/shipnotify/shipnotify.log.
set -u
MARK="MARK_$$_$(date +%s)"
/usr/local/bin/shipnotify-log "$MARK"
sleep 1

if grep -q "$MARK" /var/log/shipnotify/shipnotify.log 2>/dev/null; then
  echo "shipnotify messages are reaching /var/log/shipnotify/shipnotify.log"
  exit 0
fi

echo "shipnotify messages are still not reaching /var/log/shipnotify/shipnotify.log"
exit 1
