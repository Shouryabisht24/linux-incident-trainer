#!/bin/sh
# Runs at build time as root.
#
# `datasync` was installed to a nonstandard location, /opt/tools/bin, and
# that directory was added to interactive shells' PATH via a profile.d
# snippet -- so it works perfectly when the trainee (or anyone) runs the
# sync script by hand from a login shell. Cron does not source any shell
# profile and runs jobs with its own minimal, hardcoded PATH
# (/usr/bin:/bin), which doesn't include /opt/tools/bin -- so the exact same
# script fails under cron with "datasync: command not found", even though
# nothing about the script or the tool itself is broken.
set -eu

mkdir -p /opt/tools/bin /opt/scripts /var/lib/app

cat > /opt/tools/bin/datasync <<'EOF'
#!/bin/sh
mkdir -p /var/lib/app
date -Is > /var/lib/app/sync.done
EOF
chmod +x /opt/tools/bin/datasync

cat > /opt/scripts/sync-data.sh <<'EOF'
#!/bin/sh
# Relies on datasync being on PATH.
datasync
EOF
chmod +x /opt/scripts/sync-data.sh

mkdir -p /etc/profile.d
cat > /etc/profile.d/tools.sh <<'EOF'
export PATH="$PATH:/opt/tools/bin"
EOF

# No PATH= line here -- cron falls back to its own minimal default.
cat > /etc/cron.d/sync-job <<'EOF'
* * * * * trainee /opt/scripts/sync-data.sh
EOF
chmod 644 /etc/cron.d/sync-job
