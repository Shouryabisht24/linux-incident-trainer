## Solution

1. `curl -i http://localhost:8080/` → `502 Bad Gateway`. nginx got the request but couldn't reach its upstream.
2. `sudo tail /var/log/nginx/error.log` shows `connect() failed ... upstream: "http://127.0.0.1:3000/"`.
   But `sudo ss -tlnp | grep -E '3000|3001'` shows the backend is on **3001**, nothing on 3000.
3. Fix the mismatch: in `/etc/nginx/conf.d/proxy.conf` change `proxy_pass http://127.0.0.1:3000;` to
   `...:3001;`.
4. `sudo nginx -t && sudo nginx -s reload`.
5. `curl http://localhost:8080/` returns `backend ok`.

Lesson: a 502 from a reverse proxy is almost always an upstream problem, not a client one. Read the proxy's
error log for the exact upstream address it tried, then verify something is really listening there (`ss -tlnp`).
The bug is a port mismatch between the proxy config and the backend.
