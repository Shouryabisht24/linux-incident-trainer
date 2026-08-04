#!/bin/sh
# Runs at build time as root.
#
# Break: notify-relay.socket's ListenStream= was changed to /tmp/notify-relay.sock
# during a migration, but every client/healthcheck on the box (and this
# service's own documentation) still expects /run/notify-relay.sock. Both
# units individually look completely fine -- the socket unit is active and
# genuinely listening, and the service unit is correctly sitting inactive,
# waiting to be triggered by a connection, which is normal for a
# socket-activated service (Accept=no) that hasn't been hit yet. The mismatch
# only becomes observable when something actually tries to connect at the
# documented path.
#
# The relay itself is compiled C, not shell (per AUTHORING.md): under
# socket activation with Accept=no, systemd hands the service the listening
# socket itself as fd 3 (SD_LISTEN_FDS_START) and the service accepts()
# connections on it directly -- a real listening socket, not something a
# shell script can do.
set -eu

cat > /tmp/notify-relay.c <<'EOF'
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>

int main(void) {
    int fd = 3; /* SD_LISTEN_FDS_START -- systemd hands us the listening socket here */
    for (;;) {
        int c = accept(fd, NULL, NULL);
        if (c < 0) continue;
        char buf[512];
        read(c, buf, sizeof(buf));
        const char *resp =
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 3\r\nConnection: close\r\n\r\nok\n";
        write(c, resp, strlen(resp));
        close(c);
    }
}
EOF
gcc -O2 -o /usr/local/bin/notify-relay /tmp/notify-relay.c
rm -f /tmp/notify-relay.c

cat > /etc/systemd/system/notify-relay.service <<'EOF'
[Unit]
Description=notify relay (socket-activated)

[Service]
ExecStart=/usr/local/bin/notify-relay
EOF

# The bad path -- moved to /tmp during a migration, docs/clients never updated.
cat > /etc/systemd/system/notify-relay.socket <<'EOF'
[Unit]
Description=notify-relay activation socket

[Socket]
ListenStream=/tmp/notify-relay.sock
Service=notify-relay.service

[Install]
WantedBy=sockets.target
EOF

mkdir -p /etc/systemd/system/sockets.target.wants
ln -sf /etc/systemd/system/notify-relay.socket /etc/systemd/system/sockets.target.wants/notify-relay.socket
