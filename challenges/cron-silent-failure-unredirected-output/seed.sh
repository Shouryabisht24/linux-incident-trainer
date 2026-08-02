#!/bin/sh
# Break: the cron job's output is never redirected anywhere, and there's no
# MTA installed to deliver cron's own attempt at mailing it -- so when the
# job fails, its error just vanishes into nothing. There's also a real bug
# in the script (it reads from the wrong, stale filename after a rename),
# but nobody can see that error message because it's never captured.
set -eu

mkdir -p /var/lib/metrics/archive
echo "cpu=12,mem=55,disk=61" > /var/lib/metrics/metrics.current.log

mkdir -p /opt/scripts
cat > /opt/scripts/rotate-metrics.sh <<'EOF'
#!/bin/sh
# Rotates the current metrics snapshot into the archive.
set -eu
SRC=/var/lib/metrics/metrics.log
DEST=/var/lib/metrics/archive/$(date +%Y%m%d%H%M%S).log
cp "$SRC" "$DEST"
EOF
chmod +x /opt/scripts/rotate-metrics.sh

# No output redirection at all: cron will try to mail stdout/stderr, but
# there's no mail transport agent installed, so the job's real failure
# ("cp: cannot stat '/var/lib/metrics/metrics.log'") is simply discarded.
cat > /etc/cron.d/rotate-metrics <<'EOF'
*/5 * * * * trainee /opt/scripts/rotate-metrics.sh
EOF
chmod 644 /etc/cron.d/rotate-metrics
