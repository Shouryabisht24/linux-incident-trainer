#!/bin/sh
# Runs at build time as root. Sets up a compliance/audit scenario:
# - "auditor" is an unprivileged user (no sudo) who must be able to read a
#   root-owned, root-only-readable audit log for quarterly reviews.
# - The sanctioned way to let them do that without giving them broad root
#   access is a small setuid-root helper binary: it runs with an effective
#   UID of root (the kernel promotes euid at exec() time because of the
#   setuid bit -- no code in the helper needs to call setuid() itself) so it
#   can open the protected file regardless of the caller's own permissions.
#
# The break: a "hardening" pass ran `chmod -s` (or similar) across
# /usr/local/bin and stripped the setuid bit from the helper. It's still
# owned by root and still executable, so nothing *looks* wrong at a glance
# (`ls -l` still shows root ownership and an x bit) -- but without the setuid
# bit it now runs as plain "auditor" and can't open a root:root 600 file.
#
# NOTE: setuid is NOT honored on interpreted scripts (the kernel deliberately
# ignores the setuid bit on anything starting with a #! shebang, to close a
# classic TOCTOU race) -- so the helper has to be a real compiled binary.
set -eu

useradd -m -s /bin/bash auditor

mkdir -p /var/log/secure
cat > /var/log/secure/access.log <<'EOF'
2026-07-01T02:14:00Z admin login from 10.0.0.5 AUDIT_MARKER_OK
2026-07-01T02:15:03Z admin ran: systemctl restart billing
EOF
chown root:root /var/log/secure/access.log
chmod 600 /var/log/secure/access.log

cat > /tmp/read-audit-log.c <<'EOF'
#include <stdio.h>

int main(void) {
    FILE *f = fopen("/var/log/secure/access.log", "r");
    if (!f) {
        perror("read-audit-log: open");
        return 1;
    }
    char buf[512];
    while (fgets(buf, sizeof(buf), f)) {
        fputs(buf, stdout);
    }
    fclose(f);
    return 0;
}
EOF
gcc -O2 -o /usr/local/bin/read-audit-log /tmp/read-audit-log.c
rm -f /tmp/read-audit-log.c
chown root:root /usr/local/bin/read-audit-log

# The break: helper is root-owned and executable, but NOT setuid, so it runs
# as "auditor" (the caller) instead of root and can't open the protected log.
chmod 0755 /usr/local/bin/read-audit-log
