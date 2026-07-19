## Solution

1. `sudo service nginx start` succeeds — nginx's *master* process runs as root, which can bind port 80 and read its config regardless of file permissions.
2. But `curl localhost` returns `403 Forbidden`. nginx's *worker* processes (the ones that actually read files off disk and serve them) drop root privileges and run as the unprivileged `www-data` user — so file permissions genuinely apply to them.
3. `ls -la /var/www/html` shows the directory is `700` and `index.nginx-debian.html` is `600`, both owned by `root:root` — `www-data` can't even traverse into the directory, let alone read the file.
4. Fix it: `sudo chmod 755 /var/www/html && sudo chmod 644 /var/www/html/index.nginx-debian.html`
5. Verify: `curl localhost` should now return nginx's default "Welcome to nginx!" page with a 200 status.

The general lesson: a service "starting successfully" only tells you its root-privileged parts worked. Many real services (nginx, most web servers, mail servers) drop privileges for the parts that actually touch user-facing files or untrusted input — that's exactly where permission bugs bite, and `sudo`-ing your way past them doesn't fix the underlying issue for real traffic.
