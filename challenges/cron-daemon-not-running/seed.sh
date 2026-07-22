#!/bin/sh
# Break: there's a valid crontab, but the cron daemon itself is not started
# (the container comes up without it), so nothing scheduled ever fires.
set -eu
# A perfectly valid job so the trainee sees the schedule is fine; the daemon is the problem.
cat > /etc/cron.d/heartbeat <<'EOF'
* * * * * root date >> /var/log/heartbeat.log 2>&1
EOF
chmod 644 /etc/cron.d/heartbeat
