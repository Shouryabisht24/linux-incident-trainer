#!/bin/sh
# Solved when nightly-reconcile.timer is actually configured to catch up on
# missed runs (Persistent=true) AND doing so for real produces the output
# file -- not just when the unit file text has been edited. We don't wait on
# a real 02:00 wall-clock trigger: we reload systemd and (re-)enable the
# timer ourselves, exactly the action a trainee re-enabling it after
# maintenance would take, and see whether the genuinely-missed occurrence
# (backdated three days by seed.sh's forged stamp file) actually gets caught
# up.
set -u

UNIT=nightly-reconcile.timer
MARKER=/var/lib/app/last-reconcile

systemctl daemon-reload 2>/dev/null

PERSISTENT=$(systemctl show "$UNIT" -p Persistent --value 2>/dev/null)
if [ "$PERSISTENT" != "yes" ]; then
  echo "$UNIT is not Persistent (Persistent=$PERSISTENT) -- a missed run will never be caught up"
  exit 1
fi

if ! systemctl enable --now "$UNIT" >/tmp/reconcile-enable.out 2>&1; then
  echo "failed to enable/start $UNIT:"
  cat /tmp/reconcile-enable.out
  exit 1
fi

sleep 2

if [ -f "$MARKER" ]; then
  echo "$UNIT is Persistent=true and the missed run has caught up: $(cat "$MARKER")"
  exit 0
fi

echo "$UNIT is Persistent=true but no catch-up run has happened yet"
exit 1
