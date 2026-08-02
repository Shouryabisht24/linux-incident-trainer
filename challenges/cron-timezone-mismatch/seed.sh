#!/bin/sh
# Runs at build time as root.
#
# Break: cron schedules jobs against the *system's* local timezone, not
# UTC -- there is no CRON_TZ= in this cron.d entry, so "0 2 * * *" means
# "02:00 in whatever /etc/localtime currently says", full stop. This box
# got provisioned with its local timezone set to America/Los_Angeles
# instead of the fleet standard (UTC), so the exact same "0 2 * * *" entry
# that means 02:00 UTC on every other box in the fleet actually means
# 02:00 Pacific here -- 8 or 9 hours later in UTC terms (depending on DST),
# hours away from when the downstream reconciliation pipeline expects this
# box's report to land. Nothing about the cron syntax or the script itself
# is wrong; the box's own idea of "what time it is" is.
set -eu

ln -sf /usr/share/zoneinfo/America/Los_Angeles /etc/localtime
echo "America/Los_Angeles" > /etc/timezone

mkdir -p /opt/scripts /var/lib/app
# The report job runs as "trainee" per the cron.d entry below, so its output
# directory needs to actually be writable by that unprivileged user.
chown trainee:trainee /var/lib/app

cat > /opt/scripts/nightly-report.sh <<'EOF'
#!/bin/sh
# Writes the nightly report the fleet-wide reconciliation pipeline expects
# at 02:00 UTC. The report itself has no bug -- when this runs is the whole
# problem.
set -eu
mkdir -p /var/lib/app
date -u -Is > /var/lib/app/last-report
EOF
chmod +x /opt/scripts/nightly-report.sh

# Intended to run at 02:00 UTC, same instant as every other box in the
# fleet -- but cron has no idea "UTC" was the intent, it just reads
# /etc/localtime, which right now says America/Los_Angeles.
cat > /etc/cron.d/nightly-report <<'EOF'
# Intended: 02:00 UTC, in line with the rest of the fleet's nightly window.
0 2 * * * trainee /opt/scripts/nightly-report.sh >> /var/log/nightly-report.log 2>&1
EOF
chmod 644 /etc/cron.d/nightly-report
touch /var/log/nightly-report.log
chown trainee:trainee /var/log/nightly-report.log
