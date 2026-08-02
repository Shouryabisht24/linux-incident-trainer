#!/bin/sh
# Runs at build time as root. Sets up a report-generation scenario:
# - "reportgen" is the unprivileged, no-sudo account a nightly cron job runs
#   as, dropping report files into /var/lib/reports/.
# - "dashboard" is a SEPARATE unprivileged, no-sudo account that reads those
#   files. It's correctly provisioned as a member of "reportreaders", the
#   shared group meant to gate read access to the reports directory.
# - /var/lib/reports is set up correctly: owned reportgen:reportreaders,
#   setgid, so every file reportgen creates there automatically gets group
#   "reportreaders" -- that plumbing is NOT the break.
# - The break: the generation script itself sets `umask 077` before writing
#   its output file -- someone's idea of "hardening" the script -- which
#   strips ALL group and other permission bits from every file it creates,
#   regardless of what group the file ends up owned by. The file ends up
#   mode 0600: only "reportgen" itself can read it, no matter how correctly
#   the directory or group membership is set up. Root ignores this and could
#   always read the file -- the real, unprivileged "dashboard" process
#   cannot, which is what check.sh actually exercises.
set -eu

groupadd reportreaders
useradd -r -s /usr/sbin/nologin reportgen
useradd -r -s /usr/sbin/nologin -G reportreaders dashboard

mkdir -p /var/lib/reports
chown reportgen:reportreaders /var/lib/reports
chmod 2775 /var/lib/reports

cat > /usr/local/bin/generate-report.sh <<'EOF'
#!/bin/sh
# Nightly report generator, run as "reportgen" via cron.
umask 077
OUT="/var/lib/reports/report-$(date +%s)-$$.txt"
{
  echo "Nightly report generated at $(date -Iseconds)"
  echo "REPORT_MARKER_OK"
} > "$OUT"
EOF
chmod +x /usr/local/bin/generate-report.sh

cat > /etc/cron.d/reportgen <<'EOF'
# Runs the nightly report generator as the unprivileged reportgen account.
0 2 * * * reportgen /usr/local/bin/generate-report.sh
EOF
chmod 0644 /etc/cron.d/reportgen
