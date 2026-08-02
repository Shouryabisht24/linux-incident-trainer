## Solution

1. Confirm it against the account that actually matters, not root: `sudo -u orderapi sh -c 'echo test >>
   /var/log/orderapi/orderapi.log'` fails with "Permission denied". The file already has a lot of history in
   it, so this account clearly used to be able to write here.
2. `ls -l /var/log/orderapi/orderapi.log` shows it's owned `root:root`, mode `0600` -- `orderapi` has no access
   bits at all. `cat /etc/logrotate.d/orderapi` shows why:
   ```
   /var/log/orderapi/orderapi.log {
       daily
       rotate 7
       missingok
       notifempty
       create 0600 root root
   }
   ```
3. **REASONING**: `create <mode> <owner> <group>` tells logrotate exactly what to stamp on the brand-new,
   empty file it creates immediately after rotating the old one out of the way. Rotation itself isn't broken
   here at all -- the path is right, the schedule fires, `missingok`/`notifempty` aren't hiding anything.
   The bug is entirely in what happens *after* a successful rotation: logrotate (running as root) faithfully
   creates the new file exactly as told -- owned by `root:root`, mode `0600` -- which locks out the
   unprivileged `orderapi` account that the service actually runs as. The app itself never crashes or errors
   loudly; it just silently fails to open its own log file for appending, and since nothing else about the
   service is broken, this goes unnoticed until someone actually needs the logs.
4. Fix the directive to match the real service account:
   `sudo sed -i 's/create 0600 root root/create 0640 orderapi orderapi/' /etc/logrotate.d/orderapi`
5. Verify end-to-end by forcing a fresh rotation (not waiting for the schedule):
   ```
   sudo rm -f /var/log/orderapi/orderapi.log.1 /var/lib/logrotate/status
   sudo logrotate --force /etc/logrotate.d/orderapi
   sudo -u orderapi sh -c 'echo test >> /var/log/orderapi/orderapi.log'
   ```
   The write now succeeds, and `cat /var/log/orderapi/orderapi.log` shows the new line.

Lesson: `missingok`/wrong paths aren't the only way logrotate quietly breaks logging. The `create` directive
runs with root's privilege and stamps whatever owner/mode you tell it to on the fresh file -- get that wrong
and every rotation re-locks the app out of its own log, right after it looked like everything was working.
Root never notices because root can write to anything; only checking as the real service account (never as
root -- root ignores DAC permissions and will lie to you) reveals the break.
