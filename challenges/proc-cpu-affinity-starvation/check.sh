#!/bin/sh
# Solved when render-worker is actually getting healthy CPU throughput again,
# not just "running". Measures real consumed CPU time (utime+stime, in
# clock ticks -- a fixed-size unit of scheduled CPU time, not raw loop
# iterations, so this is independent of host CPU speed) over a short window.
# Starved (wedged onto a core a competing process fully owns) it barely
# accumulates ticks; healthy, it should be close to saturating a full core.
set -u
PIDFILE=/var/run/render-worker/render-worker.pid
WINDOW_SECONDS=2
# Contended (wedged on a core a competing process fully owns): ~50% of a
# core, ~100 ticks over this window. Healthy (its own free core): ~100% of a
# core, ~200 ticks. Threshold sits squarely between the two, measured
# empirically against this exact scenario.
MIN_TICKS=150

if [ ! -f "$PIDFILE" ]; then
  echo "render-worker is not running (no pidfile)"
  exit 1
fi

PID=$(cat "$PIDFILE")
if [ ! -d "/proc/$PID" ]; then
  echo "render-worker is not running (pidfile PID $PID is gone)"
  exit 1
fi
STATE=$(awk '{print $3}' "/proc/$PID/stat" 2>/dev/null)
if [ "$STATE" = "Z" ]; then
  echo "render-worker is not running (pidfile PID $PID is a zombie)"
  exit 1
fi

read_ticks() {
  awk '{print $14 + $15}' "/proc/$1/stat" 2>/dev/null
}

T0=$(read_ticks "$PID")
sleep "$WINDOW_SECONDS"
if [ ! -d "/proc/$PID" ]; then
  echo "render-worker exited during the check"
  exit 1
fi
T1=$(read_ticks "$PID")

if [ -z "$T0" ] || [ -z "$T1" ]; then
  echo "could not read CPU time for render-worker (pid $PID)"
  exit 1
fi

DELTA=$((T1 - T0))
if [ "$DELTA" -ge "$MIN_TICKS" ]; then
  echo "render-worker consumed $DELTA CPU ticks over ${WINDOW_SECONDS}s -- healthy throughput"
  exit 0
fi
echo "render-worker only consumed $DELTA CPU ticks over ${WINDOW_SECONDS}s (need >= $MIN_TICKS) -- still starved"
exit 1
