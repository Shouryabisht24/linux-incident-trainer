## Solution

1. `curl http://localhost:8080/` -> connection refused. But `sudo service myapp status` shows the process
   is up and running -- this isn't a crashed app, so the question is what port it actually bound.
2. `sudo ss -tlnp` shows the python process on `:9091`, not `:8080`.
3. Normally the next move would be "grep the config for a hardcoded port," but there isn't one:
   `cat /proc/$(pgrep -f myapp-server)/cmdline` shows nothing port-related, and the app's own source
   (`/usr/local/bin/myapp-server.py`) has no literal port number in it at all -- it calls
   `socket.getservbyname("myapp", "tcp")`, which looks the port up by name from the system-wide
   `/etc/services` database at startup, rather than hardcoding it. This is an old but still-real pattern
   for keeping a port number defined in exactly one system-level place instead of duplicated across every
   app's own config.
4. `grep myapp /etc/services` shows `myapp 9091/tcp` -- the entry from before the app's port was
   reassigned to 8080 during a migration. The app's own deploy got updated everywhere except this one
   shared, easy-to-forget system file, so it keeps faithfully binding to the old port.
5. Fix the mapping: `sudo sed -i 's/9091/8080/' /etc/services` (unlike `/etc/hosts` or `/etc/resolv.conf`,
   `/etc/services` is a normal file in the container's own filesystem, not bind-mounted, so `sed -i` works
   fine here).
6. Restart the app so it re-resolves its port at startup: `sudo service myapp restart`.
7. `curl http://localhost:8080/` now returns `web ok`. `sudo ss -tlnp` confirms it's on 8080.

Lesson: not every service reads its port from its own config file -- `getservbyname(3)` (backed by
`/etc/services`, and in principle NSS/`nsswitch.conf`'s `services:` line) is a legitimate, still-used
mechanism for looking up a well-known port by name instead of hardcoding it everywhere. When a service is
alive but on the wrong port and grepping its own config turns up nothing, check whether it resolves its
port indirectly through a shared system database like this one -- and remember that a port reassignment
has to update *every* place the mapping exists, including ones outside the app's own deploy.
