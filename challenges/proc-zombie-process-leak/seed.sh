#!/bin/sh
# Runs at build time as root.
#
# "batch-dispatcher" forks off a short-lived worker on a fixed interval, but
# never wait()s on any of them -- a supervisor bug (the wait() call was
# dropped in a refactor). Each worker exits almost instantly, but its exit
# status is never collected, so it lingers forever as a zombie (<defunct>)
# parented to batch-dispatcher. The container's process-count limit is
# deliberately tight (see challenge.json resource_limits): every zombie still
# occupies a slot in that limit until reaped, so a dispatcher left running
# genuinely creeps the box toward "cannot create new processes", it isn't
# just a cosmetic `ps` oddity.
set -eu

cat > /usr/local/bin/batch-dispatcher <<'EOF'
#!/bin/sh
# Dispatches a trivial worker job periodically. BUG: never reaps it (no
# `wait`), so each one becomes a permanent zombie.
while true; do
  ( exit 0 ) &
  sleep 8
done
EOF
chmod +x /usr/local/bin/batch-dispatcher
