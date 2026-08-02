## Solution

1. `metricsdctl start` refuses immediately: `SPOOL_DIR=/var/lib/metricsd/spool is not on a size-bounded tmpfs
   (found: ext4)` (or `overlay`, depending on the underlying storage driver) -- not a permissions error, not a
   missing directory.
2. Confirm what that path actually is: `stat -f -c %T /var/lib/metricsd/spool` reports an ordinary filesystem
   type, not `tmpfs`. `findmnt -t tmpfs` (or `mount | grep tmpfs`) shows the real bounded mount lives at
   `/var/lib/metricsd-buffer` instead.
3. `cat /etc/metricsd/metricsd.conf` shows `SPOOL_DIR=/var/lib/metricsd/spool` -- the config still names the
   path from before the buffer mount was relocated/renamed to `/var/lib/metricsd-buffer`. Nobody updated the
   config when the mount moved.
4. Point the config at the real mount:
   ```
   sudo sed -i 's#^SPOOL_DIR=.*#SPOOL_DIR=/var/lib/metricsd-buffer#' /etc/metricsd/metricsd.conf
   ```
5. Start it: `metricsdctl start` succeeds this time.
6. Confirm it's actually using the bounded mount, not just that it started: `pgrep -af metricsd-worker` shows
   `/var/lib/metricsd-buffer` in its argv, and `stat -f -c %T /var/lib/metricsd-buffer` confirms that path
   really is `tmpfs`.

### Reasoning

A size-bounded mount only protects the root filesystem if the application is actually writing into it. A
path name is just a string -- nothing keeps a config file's `SPOOL_DIR` in sync with wherever ops has actually
mounted the real buffer, especially across a rename or relocation. If nothing had checked, `metricsd` would
have silently spooled into an ordinary directory on the root filesystem, defeating the entire point of the
bounded mount: instead of a contained, predictable failure (fill a small tmpfs, get `ENOSPC` from `metricsd`
itself), an unbounded write into the root filesystem risks starving every other process on the box of disk
space.

`metricsdctl`'s refusal here is a *good* thing: it's the kind of self-check ("is my configured writable
directory actually the bounded mount I expect?") worth building into anything that's supposed to be
size-limited, using `stat -f -c %T` or `findmnt -T` rather than trusting a path string alone. The bug to fix
isn't the check -- it's the drift between the mount's real location and the config that names it. `findmnt -t
tmpfs` (or `mount | grep tmpfs`) is the fast way to find where a bounded mount *actually* lives when a config
disagrees.
