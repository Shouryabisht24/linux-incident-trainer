#!/bin/sh
# Runs at build time as root.
#
# The web app is supposed to serve on 127.0.0.1:8080 via nginx. A decommissioned
# internal tool ("legacy-agent") was supposed to be removed months ago but its
# startup script never got cleaned up, so it still starts on every boot and
# grabs port 8080 first, well before nginx gets a chance to. nginx isn't
# misconfigured at all -- it just loses the race for its own port every time.
set -eu

rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/app.conf <<'EOF'
server {
    listen 8080;
    location / { return 200 "web ok\n"; }
}
EOF

cat > /tmp/legacy-agent.c <<'EOF'
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
        return 1;
    }
    listen(sock, 5);
    for (;;) {
        sleep(60);
    }
    return 0;
}
EOF
gcc -O2 -o /usr/local/bin/legacy-agent /tmp/legacy-agent.c
rm -f /tmp/legacy-agent.c
