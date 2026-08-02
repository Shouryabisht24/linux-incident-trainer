#!/bin/sh
# Solved when metricsd-worker is actually running AND it's spooling to the
# real size-bounded tmpfs (/var/lib/metricsd-buffer) -- not just any
# writable directory. Skip zombie matches defensively (a killed process can
# leave pgrep -f matching a <defunct> zombie's stale comm field).
set -u

RUNNING=0
for pid in $(pgrep -f /usr/local/bin/metricsd-worker 2>/dev/null); do
  state=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
  if [ "$state" != "Z" ]; then
    if grep -qa 'metricsd-buffer' "/proc/$pid/cmdline" 2>/dev/null; then
      RUNNING=1
    fi
  fi
done

if [ "$RUNNING" -ne 1 ]; then
  echo "metricsd is not running with SPOOL_DIR pointed at the real size-bounded tmpfs (/var/lib/metricsd-buffer)"
  exit 1
fi

echo "metricsd is running and spooling to the size-bounded tmpfs"
exit 0
