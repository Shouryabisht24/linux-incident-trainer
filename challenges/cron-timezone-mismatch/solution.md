## Solution

1. `cat /etc/cron.d/nightly-report` and `cat /opt/scripts/nightly-report.sh` both look completely
   correct -- valid cron syntax, a script with no bugs, and it genuinely does fire once a day. The
   symptom isn't "it doesn't run," it's "it doesn't run when the rest of the fleet expects."
2. Check what time this box itself believes it is: `date` reports something like
   `Sat Aug 1 19:10:22 PDT 2026`, and `date +%z` reports `-0700`. This box's system timezone is
   Pacific, not UTC.
3. That's the entire bug: cron interprets a schedule like `0 2 * * *` against the system's own local
   timezone (from `/etc/localtime`), not UTC, unless the crontab explicitly overrides it. The same
   literal `0 2 * * *` line means 02:00 UTC on a box configured for UTC and 02:00 *Pacific* (= 09:00 or
   10:00 UTC, depending on daylight saving) on this one. Nothing about the cron entry or the script
   changed between boxes -- only the box's own idea of "what time it is" did, almost certainly from a
   provisioning step that skipped setting the fleet-standard timezone.
4. Fix it at the source: correct the system's configured timezone to UTC, rather than trying to
   compensate by changing the cron schedule's hour to "whatever offset cancels it out" (which breaks
   the moment daylight saving shifts, or the box gets its timezone corrected later by someone else):
   ```
   sudo ln -sf /usr/share/zoneinfo/UTC /etc/localtime
   echo UTC | sudo tee /etc/timezone
   ```
5. Verify with the same command that exposed the bug: `date +%z` now reports `+0000`. `date` itself
   now reads local time as UTC. Re-run the report job as cron would (`su -s /bin/sh -c
   /opt/scripts/nightly-report.sh trainee`) to confirm nothing else broke -- it still produces
   `/var/lib/app/last-report` cleanly, now genuinely timestamped in the fleet's shared 02:00 UTC frame.

Lesson: cron has no built-in concept of "UTC" as a default -- every schedule is relative to
`/etc/localtime`, and a box whose system timezone doesn't match what its own crontabs were *written*
assuming will silently run everything at the wrong wall-clock moment relative to every other box, with
zero errors anywhere to point at the cause. A schedule that "looks identical" across a fleet is only
actually identical if every box agrees on what time it is. When jobs across a fleet need to line up on
a shared moment, either standardize every box's system timezone (simplest, and what real ops teams
usually do -- provision everything as UTC) or pin the specific timezone a job's schedule assumes
directly in the job's own definition, rather than ever depending on whatever the box happens to be set
to.
