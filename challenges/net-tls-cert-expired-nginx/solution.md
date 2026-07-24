## Solution

1. Find which certificate file nginx is actually configured to use:
   `grep ssl_certificate /etc/nginx/conf.d/tls-app.conf` points at `/etc/nginx/ssl/site.crt`.
2. Check its validity: `sudo openssl x509 -in /etc/nginx/ssl/site.crt -noout -enddate` shows a
   `notAfter` date well in the past. You can confirm the same thing live, the way monitoring
   would: `echo | openssl s_client -connect localhost:8443 2>/dev/null | openssl x509 -noout
   -checkend 0` reports the certificate has already expired.
3. nginx doesn't refuse to start or serve an expired certificate on its own -- TLS handshakes
   still complete just fine; only inspecting the certificate's own dates reveals the problem.
4. Generate a fresh self-signed certificate and key to replace the expired pair:
   ```
   sudo openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
     -keyout /etc/nginx/ssl/site.key -out /etc/nginx/ssl/site.crt \
     -subj '/CN=app.internal'
   ```
5. Reload nginx so it picks up the new files (a config/cert change on disk does nothing until
   nginx is told to reload): `sudo service nginx reload`.
6. Verify against the live server, not just the file on disk:
   `echo | openssl s_client -connect localhost:8443 2>/dev/null | openssl x509 -noout -checkend 0`
   now reports the certificate is valid.

Lesson: a working TLS handshake does not mean a valid certificate -- expiry is a property clients
(and monitoring) check separately from the handshake itself, and nginx will happily keep serving
an expired cert forever if nobody rotates it. Always verify against the live socket
(`openssl s_client`), not just a file on disk, since a fix only counts once the running service has
actually reloaded it.
