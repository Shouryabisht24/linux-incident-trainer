#!/bin/sh
# Solved when webapp.service is genuinely ordered After=/Requires=
# data-init.service -- not merely "active right now". After the box has been
# up a while, a plain restart succeeds regardless of whether the ordering was
# ever fixed (data-init already finished long ago), so a naive is-active check
# would be trivially spoofable. We first verify the static dependency is
# really there, then replay a fresh-boot race -- stop both units, wipe the
# ready marker, start webapp the way boot would -- to prove the ordering is
# real, not just a lucky restart.
set -u

AFTER=$(systemctl show webapp.service -p After --value 2>/dev/null)
case "$AFTER" in
  *data-init.service*) ;;
  *) echo "webapp.service has no After=data-init.service"; exit 1 ;;
esac

REQUIRES=$(systemctl show webapp.service -p Requires --value 2>/dev/null)
case "$REQUIRES" in
  *data-init.service*) ;;
  *) echo "webapp.service has no Requires=data-init.service"; exit 1 ;;
esac

systemctl stop webapp.service data-init.service >/dev/null 2>&1
rm -f /var/lib/app/ready
systemctl start webapp.service >/dev/null 2>&1

i=0
while [ "$i" -lt 10 ]; do
  STATE=$(systemctl is-active webapp.service 2>/dev/null)
  [ "$STATE" = "active" ] && break
  [ "$STATE" = "failed" ] && break
  i=$((i + 1))
  sleep 1
done

STATE=$(systemctl is-active webapp.service 2>/dev/null)
if [ "$STATE" = "active" ] && [ -f /var/lib/app/ready ]; then
  echo "webapp.service correctly waited for data-init.service"
  exit 0
fi
echo "webapp.service is '$STATE' after a simulated fresh start (expected active, with data-init having completed first)"
exit 1
