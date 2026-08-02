#!/bin/sh
# Runs at build time as root.
#
# Break: two units both try to bind port 8080 -- "webapp.service" (the real
# app) and "webapp-canary.service" (a canary-rollout agent that was supposed
# to be disabled after cutover, but the unit was never removed and is still
# enabled). webapp-canary starts first every boot and wins the race for the
# port. webapp's own binary, on a bind failure, doesn't crash -- it logs the
# problem and idles forever -- so its systemd unit has a real, live PID and
# `systemctl` genuinely reports it "active (running)". Status alone can't
# tell you whether a unit is actually doing its job; only checking who
# actually holds the port can.
#
# Both binaries are compiled C (not shell): a real listening TCP socket that
# holds a port is exactly the kind of thing AUTHORING.md calls out as needing
# a real binary, not a script.
set -eu

cat > /tmp/webapp.c <<'EOF'
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main(void) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);
    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        /* Real-world failure mode: log and keep running instead of exiting,
         * so the process (and therefore the systemd unit) stays "up" without
         * ever doing its job. */
        fprintf(stderr, "webapp: bind() failed, port already in use -- idling\n");
        fflush(stderr);
        for (;;) sleep(3600);
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

cat > /tmp/canary.c <<'EOF'
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main(void) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);
    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) return 1;
    listen(sock, 5);
    for (;;) sleep(60); /* holds the port; never answers HTTP */
}
EOF
gcc -O2 -o /usr/local/bin/canary-agent /tmp/canary.c
rm -f /tmp/canary.c

cat > /etc/systemd/system/webapp-canary.service <<'EOF'
[Unit]
Description=webapp canary rollout agent (decommission after cutover)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/canary-agent
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/webapp.service <<'EOF'
[Unit]
Description=webapp
After=network.target webapp-canary.service

[Service]
Type=simple
ExecStart=/usr/local/bin/webapp
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/webapp-canary.service /etc/systemd/system/multi-user.target.wants/webapp-canary.service
ln -sf /etc/systemd/system/webapp.service /etc/systemd/system/multi-user.target.wants/webapp.service
