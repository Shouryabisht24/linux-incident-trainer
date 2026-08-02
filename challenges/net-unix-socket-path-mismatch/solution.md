## Solution

1. `curl -i http://localhost:8080/` -> `502 Bad Gateway`. nginx itself answered (port 8080 is fine) but
   couldn't get a response from its upstream.
2. `sudo tail /var/log/nginx/error.log` shows something like:
   ```
   connect() to unix:/run/backend/app.sock failed (2: No such file or directory)
   ```
   Unlike a TCP upstream mismatch, this won't show up in `ss -tlnp` at all -- unix domain sockets are
   filesystem paths, not host:port pairs.
3. See what socket files actually exist: `ls -la /run/backend/` shows `app-v2.sock`, not `app.sock`. A
   recent rollout renamed the backend's socket file (a common pattern when versioning a socket path
   during a blue/green-style cutover), but the proxy config was never updated to match.
4. Find the stale reference: `grep -rn proxy_pass /etc/nginx/` shows
   `/etc/nginx/conf.d/app.conf: proxy_pass http://unix:/run/backend/app.sock:;`.
5. Fix it to point at the real socket: `proxy_pass http://unix:/run/backend/app-v2.sock:;`.
6. Validate and reload: `sudo nginx -t && sudo nginx -s reload`.
7. `curl http://localhost:8080/` now returns `backend ok`.

Lesson: a 502 from a reverse proxy always means an upstream problem, but "upstream" isn't always a TCP
host:port -- nginx (and many other proxies/app servers) can talk to a backend over a unix domain socket
instead, which is faster and doesn't consume a TCP port at all. When that's the case, `ss -tlnp` is useless
for diagnosis (there's no listening TCP socket to show); read the proxy's own error log for the exact path
it tried, then check what socket files actually exist on disk (`ls -la` the directory) rather than what's
listening on a port.
