#!/bin/sh
# Solved when batch-report-job is clearly winning the CPU-time split against
# telemetry-agent again. Measures each process's real consumed CPU time
# (utime+stime, in clock ticks) over a short window and compares the *ratio*
# between them -- not an absolute count -- so this doesn't depend on host
# CPU speed. Both nice 0 (broken): roughly a 50/50 split. telemetry-agent
# properly deprioritized (fixed): batch-report-job should get nearly all of it.
set -u
BATCH_PIDFILE=/var/run/batch-report-job.pid
TELEMETRY_PIDFILE=/var/run/telemetry-agent.pid
WINDOW_SECONDS=2
MIN_SHARE_PCT=80 # batch-report-job's share of (batch+telemetry) ticks, out of 100

if [ ! -f "$BATCH_PIDFILE" ]; then
  echo "batch-report-job is not running (no pidfile)"
  exit 1
fi
BATCH_PID=$(cat "$BATCH_PIDFILE")
if [ ! -d "/proc/$BATCH_PID" ]; then
  echo "batch-report-job is not running (pidfile PID $BATCH_PID is gone)"
  exit 1
fi
BSTATE=$(awk '{print $3}' "/proc/$BATCH_PID/stat" 2>/dev/null)
if [ "$BSTATE" = "Z" ]; then
  echo "batch-report-job is not running (pidfile PID $BATCH_PID is a zombie)"
  exit 1
fi

read_ticks() {
  awk '{print $14 + $15}' "/proc/$1/stat" 2>/dev/null
}

TELEMETRY_PID=""
if [ -f "$TELEMETRY_PIDFILE" ]; then
  cand=$(cat "$TELEMETRY_PIDFILE")
  if [ -d "/proc/$cand" ]; then
    tstate=$(awk '{print $3}' "/proc/$cand/stat" 2>/dev/null)
    [ "$tstate" != "Z" ] && TELEMETRY_PID="$cand"
  fi
fi

T0B=$(read_ticks "$BATCH_PID")
T0T=0
[ -n "$TELEMETRY_PID" ] && T0T=$(read_ticks "$TELEMETRY_PID")

sleep "$WINDOW_SECONDS"

if [ ! -d "/proc/$BATCH_PID" ]; then
  echo "batch-report-job exited during the check"
  exit 1
fi
T1B=$(read_ticks "$BATCH_PID")
T1T=0
if [ -n "$TELEMETRY_PID" ] && [ -d "/proc/$TELEMETRY_PID" ]; then
  T1T=$(read_ticks "$TELEMETRY_PID")
fi

DELTA_B=$((T1B - T0B))
DELTA_T=$((T1T - T0T))
TOTAL=$((DELTA_B + DELTA_T))

if [ "$TOTAL" -le 0 ]; then
  # Neither process burned meaningful CPU in the window (unlikely for a busy
  # loop) -- treat as inconclusive/failed rather than divide by zero.
  echo "no measurable CPU activity from batch-report-job or telemetry-agent"
  exit 1
fi

SHARE_PCT=$((DELTA_B * 100 / TOTAL))
if [ "$SHARE_PCT" -ge "$MIN_SHARE_PCT" ]; then
  echo "batch-report-job got ${SHARE_PCT}% of the batch+telemetry CPU time (>= ${MIN_SHARE_PCT}%) -- healthy"
  exit 0
fi
echo "batch-report-job only got ${SHARE_PCT}% of the batch+telemetry CPU time (need >= ${MIN_SHARE_PCT}%) -- still starved by telemetry-agent"
exit 1
