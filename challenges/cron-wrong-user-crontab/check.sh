#!/bin/sh
# Solved when the export job -- run exactly the way cron itself would run it,
# i.e. as whichever user the cron.d entry currently names -- produces a file
# that the real downstream consumer (running as "invoicer") will actually
# accept. We don't wait on the minute boundary: we look up the configured
# user and run the job ourselves, then run the real downstream step for real.
set -u

CRONFILE=/etc/cron.d/export-invoices
JOBUSER=$(awk '!/^#/ && NF>=7 {print $6; exit}' "$CRONFILE" 2>/dev/null)
[ -z "$JOBUSER" ] && JOBUSER=root

rm -f /var/lib/invoicer/exports/last-export.txt

if ! su -s /bin/sh -c /opt/scripts/export-invoices.sh "$JOBUSER" >/tmp/export.out 2>&1; then
  echo "export-invoices.sh failed running as $JOBUSER:"
  cat /tmp/export.out
  exit 1
fi

if ! sudo -u invoicer /opt/scripts/process-export.sh >/tmp/process.out 2>&1; then
  echo "the downstream invoicer process still refuses the export file (job ran as $JOBUSER):"
  cat /tmp/process.out
  exit 1
fi

echo "export job runs as the right account and the downstream process accepts its output"
cat /tmp/process.out
exit 0
