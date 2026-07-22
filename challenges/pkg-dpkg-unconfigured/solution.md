## Solution

1. `sudo dpkg --audit` reports `tree` as *unpacked but not yet configured* — dpkg's database is in the
   interrupted state that makes apt/dpkg refuse further work.
2. The remedy is exactly what the error message says: `sudo dpkg --configure -a`. This runs the pending
   configuration (postinst) for every package stuck in that state, with no downloads required.
3. Verify: `sudo dpkg --audit` is now silent and `dpkg-query -W -f='${Status}\n' tree` shows
   `install ok installed`.

Lesson: `dpkg --configure -a` is the first thing to reach for when apt says "dpkg was interrupted." It's safe
and idempotent — it just finishes configuring already-unpacked packages. Only if a package's postinst itself
fails do you dig deeper (fix the cause, then re-run).
