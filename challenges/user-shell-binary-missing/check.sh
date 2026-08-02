#!/bin/sh
# Solved when the reportbot account can actually run a login shell command
# again (its configured shell must exist on disk and be executable).
set -u
OUT=$(su - reportbot -c 'echo REPORTBOT_OK' 2>/dev/null)
if [ "$OUT" = "REPORTBOT_OK" ]; then
  echo "reportbot can run a login shell"
  exit 0
fi
echo "reportbot still cannot run a login shell"
exit 1
