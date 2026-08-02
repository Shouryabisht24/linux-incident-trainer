#!/bin/sh
# Runs at build time as root.
#
# "apiworker" is a small service that, at steady state, holds 40 persistent
# connections open (simulated as open fds on /dev/null -- the exact resource
# doesn't matter, only that a real fd is held per "connection", same pattern
# as proc-fd-leak-too-many-open-files but the *cause* here is deliberately
# different: the app itself is correct and has no leak whatsoever -- it opens
# exactly what it needs and holds steady. The break is a pure systemd
# resource-limit *configuration ceiling*: a "hardening pass" set
# LimitNOFILE=30 on the unit, which is simply too low for what this service
# has always legitimately needed (40 connections + stdio + a few libc/dlopen
# fds). It never recovers on its own no matter how long you leave it running,
# and systemd's Restart=always just keeps restarting a service that re-hits
# the same ceiling every time.
set -eu

cat > /tmp/apiworker.c <<'EOF'
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const int target = 40; /* real, legitimate steady-state connection count */
    int count = 0;

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
gcc -O2 -o /usr/local/bin/apiworker /tmp/apiworker.c
rm -f /tmp/apiworker.c

cat > /etc/systemd/system/apiworker.service <<'EOF'
[Unit]
Description=API worker connection pool
After=network.target

[Service]
ExecStart=/usr/local/bin/apiworker
Restart=always
RestartSec=2
# Hardening pass (recent change): tightened the fd ceiling. Was previously
# generous enough for this service's real steady-state need (40 connections
# plus stdio/libc overhead); 30 is not enough and never was going to be.
LimitNOFILE=30

[Install]
WantedBy=multi-user.target
EOF

# Enable offline (no running systemd at build time) by creating the wants symlink.
mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/apiworker.service /etc/systemd/system/multi-user.target.wants/apiworker.service
