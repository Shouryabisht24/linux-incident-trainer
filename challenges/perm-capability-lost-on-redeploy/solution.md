## Solution

1. Reproduce the failure as the real actor: `sudo -u netmon /usr/local/bin/icmp-probe` prints
   `icmp-probe: socket: Operation not permitted`. Running the same binary as root or via plain
   `sudo` "works" (prints `PROBE_OK ...`) -- root implicitly holds every capability, which hides
   the actual problem netmon hits every time it runs this on its own.
2. Inspect the binary: `ls -l /usr/local/bin/icmp-probe` shows `-rwxr-xr-x 1 root root` -- owned
   by root, executable, completely normal-looking. This isn't a DAC permission problem at all:
   building a raw socket (`socket(AF_INET, SOCK_RAW, ...)`) is gated by the kernel's
   `CAP_NET_RAW` capability, checked independently of file mode bits and independently of who
   owns the file.
3. Check for the capability directly: `getcap /usr/local/bin/icmp-probe` prints nothing -- the
   binary has no capability set at all.
4. Restore it: `sudo setcap cap_net_raw=+ep /usr/local/bin/icmp-probe`. Confirm with
   `getcap /usr/local/bin/icmp-probe`, which should now show `/usr/local/bin/icmp-probe
   cap_net_raw=ep`.
5. Verify as the real user again: `sudo -u netmon /usr/local/bin/icmp-probe` now prints
   `PROBE_OK raw ICMP socket created`.

Why this happens after "just a redeploy": Linux file capabilities live in an extended attribute
(`security.capability`) attached to a specific file's data on disk -- not to its path, and not to
its ownership/mode. The moment a redeploy process (a package upgrade, a CI artifact push, a plain
`cp`/`install` overwrite) replaces the file's content, that xattr is gone, because as far as the
filesystem is concerned this is new file data, even if every visible attribute (path, owner, mode)
looks byte-for-byte identical to what was there a minute ago. Unlike ownership and permission
bits, which most deploy tooling preserves or reapplies without thinking about it, a capability has
to be explicitly reapplied (`setcap`) as its own deploy step every single time the binary changes
-- and it's exactly the kind of one-line step that's easy to drop from a deploy script and not
notice until the next time the helper actually needs to run.

Contrast with a setuid helper (see `perm-setuid-helper-bit-stripped`): setuid is a single
all-or-nothing bit that hands a caller full root privileges for the duration of the call.
Capabilities are the modern, fine-grained alternative -- `cap_net_raw` grants exactly the one
kernel privilege this helper needs (building a raw socket) and nothing else, which is why
capability-based helpers are generally the safer design once you know they exist. The catch is
operational, not architectural: that fine-grained privilege is invisible in `ls -l`, it's easy to
forget it needs reapplying after every rebuild, and unlike setuid it doesn't survive a naive
file copy at all.
