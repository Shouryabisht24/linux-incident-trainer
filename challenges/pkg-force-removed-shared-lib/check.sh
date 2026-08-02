#!/bin/sh
# Solved when: (1) clientapp actually runs, (2) apt/dpkg's own dependency
# bookkeeping is consistent again, and (3) libfoo1 is genuinely reinstalled
# via the package system -- not just its .so file copied back by hand,
# which would pass (1) but leave (2)/(3) broken.
set -u

out=$(clientapp 2>&1)
rc=$?
if [ $rc -ne 0 ] || ! echo "$out" | grep -q "RESULT=42"; then
  echo "clientapp still fails to run: $out"
  exit 1
fi

if ! apt-get check >/tmp/pkg-check-deps.out 2>&1; then
  echo "apt-get check still reports broken dependencies:"
  cat /tmp/pkg-check-deps.out
  rm -f /tmp/pkg-check-deps.out
  exit 1
fi
rm -f /tmp/pkg-check-deps.out

status=$(dpkg-query -W -f='${Status}' libfoo1 2>/dev/null)
if [ "$status" != "install ok installed" ]; then
  echo "libfoo1 dpkg status is '$status', expected 'install ok installed'"
  exit 1
fi

echo "clientapp runs, apt-get check is clean, and libfoo1 is properly reinstalled"
exit 0
