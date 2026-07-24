## Solution

1. `cat /usr/local/bin/run-migration` shows it's a thin wrapper that execs
   `/opt/deploy/run-migration.sh`. `ls -l /opt/deploy/run-migration.sh` shows `-rwxr-xr-x` --
   the execute bit is fine, so a normal permissions fix (`chmod +x`) won't do anything.
2. Check how `/opt/deploy` is actually mounted: `mount | grep /opt/deploy` shows
   `... on /opt/deploy type tmpfs (rw,nosuid,nodev,noexec,...)`. `noexec` tells the kernel to
   refuse `execve()` of anything on that filesystem outright, independent of the file's own
   permission bits -- this is enforced at the VFS/mount level, not by DAC permission checks.
3. Because trainees don't have the capability to remount filesystems in this environment (that
   would need `CAP_SYS_ADMIN`), the correct real-world fix is the same one ops teams use: never
   run scripts directly off a noexec-mounted staging/artifact directory. Move the script to a
   normal exec-enabled location:
   ```
   sudo mkdir -p /opt/tools
   sudo cp /opt/deploy/run-migration.sh /opt/tools/run-migration.sh
   sudo chmod +x /opt/tools/run-migration.sh
   sudo sed -i 's#/opt/deploy/run-migration.sh#/opt/tools/run-migration.sh#' /usr/local/bin/run-migration
   ```
4. Verify: `run-migration` now runs successfully and produces `/var/lib/app/migration.done`.

Lesson: `noexec` is a mount-level restriction, not a permission bit -- `chmod +x` on a file living
on a noexec filesystem changes nothing, and (outside of a container with `CAP_SYS_ADMIN`) you
can't just remount your way out of it either. Directories meant purely for data/artifact staging
are frequently mounted `noexec` as a security default; the fix is to keep executable tooling off
of them, not to fight the mount option.
