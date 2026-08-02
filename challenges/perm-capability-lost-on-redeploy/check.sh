#!/bin/sh
# Solved when the UNPRIVILEGED "netmon" account can successfully run the
# helper and it actually creates the raw socket (proves the capability is
# doing its job, not just that root/trainee can run it -- root always could).
set -u
OUT=$(sudo -u netmon /usr/local/bin/icmp-probe 2>&1)
if echo "$OUT" | grep -q "PROBE_OK"; then
  echo "netmon can run icmp-probe successfully"
  exit 0
fi
echo "netmon still cannot run icmp-probe:"
echo "$OUT"
exit 1
