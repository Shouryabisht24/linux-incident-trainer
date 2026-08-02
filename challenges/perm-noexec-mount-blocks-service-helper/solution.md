## Solution

1. Reproduce it the way it's actually discovered: `sudo service renderd start` prints
   `renderd: startup self-test failed, refusing to start (see /var/log/renderd/renderd.log)` and
   exits non-zero. `cat /var/log/renderd/renderd.log` shows the self-test's own error output:
   something like `/opt/render-assets/render-helper.sh: Permission denied`.
2. `cat /etc/default/renderd` shows `HELPER_PATH=/opt/render-assets/render-helper.sh` -- this is
   what `/etc/init.d/renderd` actually runs, once, as its own startup self-test, before it
   considers itself started. `ls -l /opt/render-assets/render-helper.sh` shows `-rwxr-xr-x` -- the
   execute bit is completely fine. A normal permissions fix (`chmod +x`) would do nothing here.
3. Check how `/opt/render-assets` is actually mounted: `mount | grep render-assets` shows
   `... on /opt/render-assets type tmpfs (rw,nosuid,nodev,noexec,...)`. `noexec` tells the kernel
   to refuse `execve()` of anything on that filesystem outright, independent of the file's own
   permission bits -- enforced at the mount/VFS level, not by DAC checks. Critically, this is
   **not** bypassed by root either (unlike ordinary permission bits) -- which is exactly why
   `renderd`'s own startup self-test, run as root via `service renderd start`, genuinely fails
   too, not just for some unprivileged caller.
4. Because remounting requires `CAP_SYS_ADMIN`, which trainees don't have here, the fix is the
   same one real ops teams use: never run executables directly off a noexec-mounted
   staging/artifact directory. Move the helper to a normal exec-enabled location and repoint the
   single config value both consumers read:
   ```
   sudo mkdir -p /opt/render-tools
   sudo cp /opt/render-assets/render-helper.sh /opt/render-tools/render-helper.sh
   sudo chmod +x /opt/render-tools/render-helper.sh
   sudo sed -i 's#/opt/render-assets/render-helper.sh#/opt/render-tools/render-helper.sh#' /etc/default/renderd
   ```
5. Verify: `sudo service renderd start` now prints `renderd started`, and
   `sudo service renderd status` reports `renderd is running`.

Lesson: `noexec` is a mount-level restriction, not a permission bit -- it blocks `execve()`
regardless of file mode, and unlike normal DAC checks it isn't waived for root either, so it's a
mechanism you can build an honest, unbypassable challenge around even for a service that starts as
root. The discovery path matters too: the failure here doesn't show up as "I ran a script and got
Permission denied" -- it shows up as a service that flatly refuses to start, with the real cause
one layer down inside its own startup self-test. Following the failure from the service's own
behavior (`service ... start`, its log) down to the specific helper it invokes internally, rather
than assuming the service's top-level config is the problem, is the actual skill this kind of
incident exercises. Directories meant purely for artifact/data staging are frequently mounted
`noexec` as a security default -- the fix is keeping executable tooling off of them (and pointing
whatever config references them at a proper location), not fighting the mount option.
