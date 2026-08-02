#!/bin/sh
# Solved when auditlog-agent 2.0-1 is BOTH installed AND the resolved
# candidate -- checking only dpkg's installed version would pass on a hacky
# `dpkg -i`/explicit-version install that leaves the underlying pin
# conflict (and thus future upgrades) still broken.
set -u
policy=$(apt-cache policy auditlog-agent 2>/dev/null)
candidate=$(echo "$policy" | awk '/Candidate:/ {print $2}')
installed=$(dpkg-query -W -f='${Version}' auditlog-agent 2>/dev/null)

if [ "$candidate" = "2.0-1" ] && [ "$installed" = "2.0-1" ]; then
  echo "auditlog-agent 2.0-1 is installed and is the resolved candidate"
  exit 0
fi
echo "candidate=$candidate installed=$installed (want 2.0-1 for both)"
exit 1
