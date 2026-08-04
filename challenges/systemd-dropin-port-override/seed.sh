#!/bin/sh
# Runs at build time as root.
#
# Break: webapp.service's base unit correctly sets Environment=LISTEN_PORT=8080
# -- exactly what every runbook documents. But a drop-in under
# webapp.service.d/ (left over from a debugging session and never cleaned up)
# sets Environment=LISTEN_PORT=9099. Later Environment= directives override
# earlier ones for the same key, so the drop-in silently shadows the base
# unit's port with no error from systemd anywhere -- the service starts fine,
# `systemctl status` shows it healthy, it just isn't listening where anyone
# expects. Compiled as a real C binary (a real listening TCP socket, per
# AUTHORING.md) so the port mismatch is a genuine, curl-observable failure.
set -eu

cat > /tmp/webapp.c <<'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main(void) {
    const char *portstr = getenv("LISTEN_PORT");
    int port = portstr ? atoi(portstr) : 8080;
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((unsigned short)port);
    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        fprintf(stderr, "webapp: bind() failed on port %d\n", port);
        return 1;
    }
    listen(sock, 16);
    for (;;) {
        int c = accept(sock, NULL, NULL);
        if (c < 0) continue;
        char buf[512];
        read(c, buf, sizeof(buf));
        const char *resp =
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 7\r\nConnection: close\r\n\r\nweb ok\n";
        write(c, resp, strlen(resp));
        close(c);
    }
}
EOF
gcc -O2 -o /usr/local/bin/webapp /tmp/webapp.c
rm -f /tmp/webapp.c

cat > /etc/systemd/system/webapp.service <<'EOF'
[Unit]
Description=webapp
After=network.target

[Service]
Type=simple
Environment=LISTEN_PORT=8080
ExecStart=/usr/local/bin/webapp
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/webapp.service.d
# TEMP: point at the debug port while we chase the memory leak -- revert after
# the investigation. (Nobody ever came back and removed this.)
cat > /etc/systemd/system/webapp.service.d/override.conf <<'EOF'
[Service]
Environment=LISTEN_PORT=9099
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/webapp.service /etc/systemd/system/multi-user.target.wants/webapp.service
