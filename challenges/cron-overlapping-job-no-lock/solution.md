## Solution

1. `cat /opt/scripts/tally-processed.sh` shows a plain read-modify-write: read the counter, sleep
   (standing in for real processing work), add one, write it back. Run once by hand and it works
   perfectly -- there is no bug visible in a single invocation.
2. The bug only exists *between* invocations. `/etc/cron.d/tally-processed` fires this script every
   minute, but the script itself can take a noticeable amount of time (the `sleep 0.5` here stands in
   for real work that, under load, can easily exceed a minute). If a run is still alive when the next
   minute's cron invocation starts, two copies of the script are now running concurrently against the
   same state file, with no coordination between them at all.
3. Reproduce it directly instead of waiting on real minute-boundary overlap -- run several copies at
   once and see what the shared total ends up as:
   ```
   echo 0 > /var/lib/app/total-processed
   for i in 1 2 3 4 5 6; do su -s /bin/sh -c /opt/scripts/tally-processed.sh trainee & done
   wait
   cat /var/lib/app/total-processed
   ```
   Six invocations should leave a total of `6`. Instead it comes out as `1`: every copy read the
   counter (`0`) before any of them had written anything back, all six independently computed `1`,
   and the last one to finish simply overwrote whatever the others had already written. Five
   increments vanished with no error message anywhere -- exactly what "the total is silently too low"
   looks like from the outside.
4. The fix belongs inside the script, not in the cron schedule (spacing the schedule out further just
   narrows the race window, it doesn't close it) -- serialize access with a real lock:
   ```sh
   #!/bin/sh
   set -eu
   STATE=/var/lib/app/total-processed
   LOCK=/tmp/tally-processed.lock
   exec 9>"$LOCK"
   flock -x 9
   [ -f "$STATE" ] || echo 0 > "$STATE"
   count=$(cat "$STATE")
   sleep 0.5
   count=$((count + 1))
   echo "$count" > "$STATE"
   ```
   `exec 9>"$LOCK"` opens (creating if needed) a lock file on file descriptor 9; `flock -x 9` takes an
   exclusive lock on it, blocking until any other holder releases theirs. Because the lock is acquired
   *before* the counter is ever read, a second invocation that starts while the first is still running
   simply waits its turn instead of racing it -- and the lock is released automatically the moment the
   script exits and fd 9 closes, so nothing needs explicit cleanup.
5. Re-run the same six-at-once test: the total now comes out exactly `6` every time, regardless of how
   many copies overlap or how the timing lines up.

Lesson: any cron job that reads then writes shared state (a counter, a "last processed" marker, an
export file another step depends on) is only safe under overlap if it's actually serialized -- a
schedule interval being "usually" longer than the job's runtime is not a guarantee, it's a hope. The
fix is never to just space the schedule out further (load spikes, slow disks, and busy neighbors will
eventually blow through any interval); it's to make the job itself refuse to run more than one copy
at a time, most simply with `flock` around the critical section. Silent, unlogged data corruption
like this is far more dangerous than a job that fails loudly -- there's nothing in any log to point
you at the real cause, only a number that's mysteriously smaller than it should be.
