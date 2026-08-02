#!/bin/sh
# Break: the nightly invoice export job is defined in root's crontab (via
# /etc/cron.d with an explicit "root" user field) instead of the dedicated
# "invoicer" service account it's meant to run as. The script itself has no
# bug -- it works fine and produces output either way -- but because cron
# runs it as root, the output file it writes ends up root-owned. The real
# downstream consumer (a companion process that also runs as "invoicer")
# refuses to act on any export file it doesn't itself own, as a defensive
# measure against processing a file some other principal could have planted
# -- so it rejects the root-owned file every time, even though "the job ran
# fine" from cron's point of view.
set -eu

mkdir -p /var/lib/invoicer/exports
chown invoicer:invoicer /var/lib/invoicer/exports
chmod 750 /var/lib/invoicer/exports

mkdir -p /opt/scripts

cat > /opt/scripts/export-invoices.sh <<'EOF'
#!/bin/sh
# Exports the latest invoice snapshot. Whatever user runs this ends up
# owning the resulting file -- that's the whole story here.
set -eu
mkdir -p /var/lib/invoicer/exports
date -Is > /var/lib/invoicer/exports/last-export.txt
EOF
chmod +x /opt/scripts/export-invoices.sh

cat > /opt/scripts/process-export.sh <<'EOF'
#!/bin/sh
# Runs as the "invoicer" service account. Refuses to touch an export file
# it doesn't own -- a deliberate safety check, not a permissions accident:
# a file owned by some other principal (even root) could have been placed
# there by anything, and this pipeline only trusts its own output.
set -eu
FILE=/var/lib/invoicer/exports/last-export.txt
if [ ! -f "$FILE" ]; then
  echo "no export file found at $FILE"
  exit 1
fi
OWNER=$(stat -c %U "$FILE")
ME=$(id -un)
if [ "$OWNER" != "$ME" ]; then
  echo "refusing to process $FILE: owned by $OWNER, not $ME"
  exit 1
fi
echo "processed export from $(cat "$FILE")"
EOF
chmod +x /opt/scripts/process-export.sh

# The job is wired up in root's crontab -- wrong owner for what the job
# actually needs to be able to do downstream.
cat > /etc/cron.d/export-invoices <<'EOF'
* * * * * root /opt/scripts/export-invoices.sh >> /var/log/export-invoices.log 2>&1
EOF
chmod 644 /etc/cron.d/export-invoices
touch /var/log/export-invoices.log
