## Solution

1. `cat /opt/scripts/sync-data.sh` shows it calls `datasync` by bare name, trusting `PATH` to find
   it -- and it works fine when run interactively.
2. `which datasync` shows it lives at `/opt/tools/bin/datasync`. Check why an interactive shell can
   find it: `echo $PATH` includes `/opt/tools/bin`, added by `/etc/profile.d/tools.sh`.
3. Cron never sources shell profile scripts -- every job runs with cron's own minimal, hardcoded
   `PATH` (`/usr/bin:/bin` by default), which doesn't include `/opt/tools/bin`. So under cron,
   `datasync` genuinely can't be found (`command not found`), even though the exact same script
   works perfectly for a human running it by hand.
4. The fix belongs in the cron job definition itself, not in a shell profile cron never reads. Add
   an explicit `PATH=` line to the top of `/etc/cron.d/sync-job`:
   ```
   PATH=/usr/bin:/bin:/opt/tools/bin
   * * * * * trainee /opt/scripts/sync-data.sh
   ```
   (Using the tool's full path directly in the script, `/opt/tools/bin/datasync`, is an equally
   valid fix.)
5. Verify by reproducing cron's own environment rather than waiting for the schedule -- run the
   job with a stripped-down `PATH` matching what's now in the cron.d file and confirm it succeeds.

Lesson: "it works when I run it manually" is one of the most common false signals in cron
debugging -- an interactive login shell's environment (`PATH` especially, via profile scripts) is
much richer than the minimal environment cron actually provides. Any cron job that depends on a
non-standard install location needs its `PATH` (or full binary paths) set explicitly in the job
definition, never assumed from a shell profile.
