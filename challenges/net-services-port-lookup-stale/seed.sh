#!/bin/sh
# Runs at build time as root.
#
# Break: this app doesn't hardcode its listen port -- it looks it up by
# service name via getservbyname(3), against the system-wide /etc/services
# database (a legitimate, if old-school, pattern for keeping a port number
# defined in exactly one place). Monitoring and every client expect the app
# on 8080. But /etc/services still has the entry from before a port
# reassignment during a migration -- "myapp" maps to 9091, not 8080 -- and
# nobody updated it when the app's port changed, so the app itself faithfully
# (and silently) binds to the stale port every time it starts.
set -eu

echo "myapp		9091/tcp		# internal app port" >> /etc/services

cat > /usr/local/bin/myapp-server.py <<'EOF'
import socket
import http.server

port = socket.getservbyname("myapp", "tcp")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"web ok\n")

    def log_message(self, *args):
        pass

http.server.HTTPServer(("0.0.0.0", port), Handler).serve_forever()
EOF

cat > /etc/init.d/myapp <<'EOF'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          myapp
# Required-Start:    $network
# Required-Stop:     $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: myapp web service
### END INIT INFO
PIDFILE=/run/myapp.pid

start() {
    setsid /usr/bin/python3 /usr/local/bin/myapp-server.py </dev/null >/var/log/myapp.log 2>&1 &
    echo $! > "$PIDFILE"
}

stop() {
    if [ -f "$PIDFILE" ]; then
        kill "$(cat "$PIDFILE")" 2>/dev/null || true
        rm -f "$PIDFILE"
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 1; start ;;
    status)
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "myapp is running (pid $(cat "$PIDFILE"))"
        else
            echo "myapp is not running"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
EOF
chmod +x /etc/init.d/myapp
