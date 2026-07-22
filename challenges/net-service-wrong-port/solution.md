## Solution

1. `curl http://localhost:8080/` → connection refused: nothing is bound to 8080.
2. See what's actually listening: `sudo ss -tlnp` shows `nginx` on `0.0.0.0:9090`.
3. Find and fix the config: `grep -rn listen /etc/nginx/` points to `/etc/nginx/conf.d/app.conf` with
   `listen 9090;`. Change it to `listen 8080;`.
4. Validate and reload: `sudo nginx -t && sudo nginx -s reload`.
5. `curl http://localhost:8080/` now returns `web ok`.

Lesson: "connection refused" means nothing is listening on that address:port (vs. a timeout/DROP, which is
usually a firewall). `ss -tlnp` (or `netstat -tlnp`) is the fastest way to see what each process is bound to.
