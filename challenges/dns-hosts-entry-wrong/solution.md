## Solution

1. Isolate whether it's the service or the name: `curl http://127.0.0.1:8080/` returns `api ok`, but
   `curl http://api.internal:8080/` fails to connect. So the service is fine — resolution is wrong.
2. `getent hosts api.internal` (or `cat /etc/hosts`) shows `api.internal -> 10.99.99.99`, an address that
   isn't this machine.
3. Fix the static entry so it points at 127.0.0.1. Note `/etc/hosts` is a bind-mounted file inside a
   container, so `sed -i` fails ("Device or resource busy" — it can't do its rename trick). Edit it in place
   with `sudo nano /etc/hosts`, or rewrite it without a rename:
   `grep -v api.internal /etc/hosts > /tmp/h && echo '127.0.0.1 api.internal' >> /tmp/h && sudo cp /tmp/h /etc/hosts`
4. `curl http://api.internal:8080/` now succeeds.

Lesson: `/etc/hosts` is consulted before DNS (per `/etc/nsswitch.conf`), so a stale line there silently
overrides real DNS. And inside containers `/etc/hosts`, `/etc/resolv.conf`, and `/etc/hostname` are
bind-mounted — in-place editors work, but tools that replace-by-rename (like `sed -i`) don't.
