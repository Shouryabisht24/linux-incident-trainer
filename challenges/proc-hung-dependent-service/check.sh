#!/bin/sh
# Solved when log-collector is running AND events are actually flowing
# end-to-end -- not just "a process exists", but real forward progress:
# sample the collected-events log's size, wait roughly one event-shipper
# cycle, sample again, and require growth. This also implicitly proves
# event-shipper itself is unblocked (it can't be the source of new bytes in
# the log otherwise), without needing to parse /proc/<pid>/wchan text that
# could vary across kernel versions.
set -u
PIDFILE=/var/run/telemetry/log-collector.pid
LOGFILE=/var/log/telemetry/events.log
WINDOW_SECONDS=3

if [ ! -f "$PIDFILE" ]; then
  echo "log-collector is not running (no pidfile) -- nothing is reading the pipe"
  exit 1
fi
PID=$(cat "$PIDFILE")
if [ ! -d "/proc/$PID" ]; then
  echo "log-collector is not running (pidfile PID $PID is gone)"
  exit 1
fi
STATE=$(awk '{print $3}' "/proc/$PID/stat" 2>/dev/null)
if [ "$STATE" = "Z" ]; then
  echo "log-collector is not running (pidfile PID $PID is a zombie)"
  exit 1
fi

size_of() {
  wc -c < "$1" 2>/dev/null || echo 0
}

S0=$(size_of "$LOGFILE")
sleep "$WINDOW_SECONDS"
S1=$(size_of "$LOGFILE")

if [ "$S1" -gt "$S0" ]; then
  echo "events.log grew from $S0 to $S1 bytes over ${WINDOW_SECONDS}s -- events are flowing end-to-end"
  exit 0
fi
echo "events.log did not grow ($S0 -> $S1 bytes over ${WINDOW_SECONDS}s) -- event-shipper is still stuck, or nothing is collecting"
exit 1
