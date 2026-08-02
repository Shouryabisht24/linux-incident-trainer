#!/bin/sh
# Runs at build time as root.
#
# Break: tally-processed.sh does a plain, unlocked read-modify-write of a
# shared counter file. It's scheduled every minute, and it does just enough
# "work" (a sleep, standing in for real processing time) that it can still
# be running when cron's next-minute invocation starts. With no locking,
# two overlapping copies both read the same stale counter value, both sleep,
# and both write back "old value + 1" -- the second write clobbers the
# first, so the total silently ends up lower than the number of times the
# job actually ran. Nothing here ever errors; the corruption is completely
# silent, which is the whole point of the challenge.
set -eu

mkdir -p /var/lib/app /opt/scripts
echo 0 > /var/lib/app/total-processed
# The job runs as "trainee" per the cron.d entry below, so its shared state
# needs to actually be writable by that unprivileged user -- not just root.
chown trainee:trainee /var/lib/app /var/lib/app/total-processed

cat > /opt/scripts/tally-processed.sh <<'EOF'
#!/bin/sh
# Adds one to the shared processed-count total. Standing in for a job that
# reads a batch of newly-ingested records and folds their count into a
# running total -- the sleep stands in for that real work taking a
# noticeable amount of time.
set -eu
STATE=/var/lib/app/total-processed
[ -f "$STATE" ] || echo 0 > "$STATE"
count=$(cat "$STATE")
sleep 0.5
count=$((count + 1))
echo "$count" > "$STATE"
EOF
chmod +x /opt/scripts/tally-processed.sh

cat > /etc/cron.d/tally-processed <<'EOF'
* * * * * trainee /opt/scripts/tally-processed.sh >> /var/log/tally-processed.log 2>&1
EOF
chmod 644 /etc/cron.d/tally-processed
touch /var/log/tally-processed.log
chown trainee:trainee /var/log/tally-processed.log
