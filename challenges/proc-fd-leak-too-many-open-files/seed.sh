#!/bin/sh
# Runs at build time as root.
#
# "connd" is a small connection-handling daemon that, at steady state, keeps
# 25 persistent connections open (simulated here as open fds on /dev/null --
# the exact resource doesn't matter, only that a real fd is held per
# "connection"). A "hardening" pass tightened this service's file-descriptor
# limit way down in its own config, so it can only ever open a fraction of
# its normal steady-state connections before hitting EMFILE ("Too many open
# files") and logging errors on every attempt after that -- it never
# recovers on its own, no matter how long you leave it running.
set -eu

mkdir -p /etc/connd /var/log/connd

cat > /etc/connd/connd.conf <<'EOF'
# Max simultaneous file descriptors for the connd process (applied via ulimit
# -n before exec). Lowered during a "hardening" pass -- was 256.
NOFILE_LIMIT=20
EOF

cat > /tmp/connd.c <<'EOF'
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const int target = 25; /* normal steady-state connection count */
    int count = 0;

    /* Fast ramp-up: try to reach the target immediately, not gradually --
     * a real client load spike looks like this, not a slow trickle. */
    while (count < target) {
        int fd = open("/dev/null", O_RDONLY);
        if (fd >= 0) {
            count++;
        } else {
            fprintf(stderr, "ERROR: cannot open connection %d/%d: %s\n",
                    count + 1, target, strerror(errno));
            fflush(stderr);
            break;
        }
    }

    /* Steady state: keep retrying forever in case capacity frees up. */
    for (;;) {
        if (count < target) {
            int fd = open("/dev/null", O_RDONLY);
            if (fd >= 0) {
                count++;
            } else {
                fprintf(stderr, "ERROR: cannot open connection %d/%d: %s\n",
                        count + 1, target, strerror(errno));
                fflush(stderr);
            }
        }
        sleep(2);
    }
    return 0;
}
EOF
gcc -O2 -o /usr/local/bin/connd /tmp/connd.c
rm -f /tmp/connd.c

cat > /usr/local/bin/svc-ctl <<'EOF'
#!/bin/sh
# Minimal control script for the connd service (no systemd in this image).
set -eu
case "${1:-}" in
  start)
    . /etc/connd/connd.conf
    setsid sh -c "ulimit -n \"$NOFILE_LIMIT\"; exec /usr/local/bin/connd" \
      >>/var/log/connd/connd.log 2>&1 </dev/null &
    ;;
  stop)
    pkill -f /usr/local/bin/connd 2>/dev/null || true
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  *)
    echo "usage: svc-ctl {start|stop|restart}" >&2
    exit 2
    ;;
esac
EOF
chmod +x /usr/local/bin/svc-ctl
