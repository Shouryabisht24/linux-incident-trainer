## Solution

1. `curl http://db:8080/` fails -- looks like a DNS problem, but which layer?
2. Rule out the DNS *record* itself first: `dig +short @127.0.0.1 db.internal.example` returns
   `127.0.0.1` -- the record is correct, and the local resolver (dnsmasq, listening on `127.0.0.1:53`)
   answers it fine when asked with the full name.
3. So the problem is upstream of DNS: how does the bare name `db` (no dot) turn into a fully-qualified
   name to actually query? That's the job of the `search` directive in `/etc/resolv.conf`. `cat
   /etc/resolv.conf` shows:
   ```
   nameserver 127.0.0.1
   search prod.example.com
   ```
   Every bare-name lookup on this box gets `.prod.example.com` appended, turning `db` into
   `db.prod.example.com` -- a domain dnsmasq has no record for at all, so it NXDOMAINs (or the resolver
   also tries the bare name as a last resort, which also fails since no record exists for a bare `db`
   either).
4. The real internal zone -- confirmed by the working `dig` against `db.internal.example` in step 2 -- is
   `internal.example`, not `prod.example.com`. This is the classic aftermath of an internal zone rename:
   the DNS records get migrated to the new zone, but a host's own resolver config is left pointing at the
   old one.
5. Fix the search domain. `/etc/resolv.conf` is a bind-mounted file inside the container, so `sed -i`
   fails ("Device or resource busy" -- it can't do its usual rename-based replace). Edit it in place with
   `sudo nano /etc/resolv.conf`, changing the `search` line to `search internal.example`, or rewrite it
   without a rename: `sudo sh -c "printf 'nameserver 127.0.0.1\nsearch internal.example\n' >
   /etc/resolv.conf"`.
6. `curl http://db:8080/` now succeeds -- `db` expands to `db.internal.example`, which resolves to
   `127.0.0.1`, where the app is listening.

Lesson: not every "DNS is broken" incident is a bad record -- `/etc/resolv.conf`'s `search` list controls
how *unqualified* (no-dot) names get expanded into full names before they're ever looked up, per
`resolv.conf(5)`. A correct record under the right zone is invisible to a client whose search domain still
points at the old zone. Always separate "does the record resolve when I ask fully-qualified" (rules DNS
data in/out) from "does the short name I actually use resolve" (tests the client-side search config) --
they can fail independently.
