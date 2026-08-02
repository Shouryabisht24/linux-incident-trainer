## Solution

1. `top` (Shift+P to sort by `%CPU`) shows two processes burning CPU at similar levels:
   `batch-report-job` and `telemetry-agent`. The `NI` column for both reads `0`.
2. Confirm precisely: `ps -o pid,ni,pcpu,cmd -p $(cat /var/run/batch-report-job.pid),$(cat
   /var/run/telemetry-agent.pid)`. Same niceness, same priority class -- on a box with a tight CPU budget,
   that means they're roughly splitting it evenly, regardless of which one is actually more important.
3. This box's own runbook says `telemetry-agent` (a background metrics scraper) must always run
   deprioritized so it never meaningfully competes with real work. Its niceness is config-driven:
   `/etc/telemetry-agent/telemetry-agent.conf` sets `NICE_LEVEL=0` -- a recent redeploy reset it back to the
   default instead of the documented deprioritized value. `batch-report-job` itself is completely fine; it's
   the *competing* process's priority that's misconfigured.
4. Fix it immediately, live: `sudo renice 15 -p $(cat /var/run/telemetry-agent.pid)`. This takes effect
   instantly -- unlike a `ulimit`-style resource limit, niceness applies to a process for as long as it's
   scheduled, so no restart is required to see the CPU split correct itself.
5. For a fix that survives the next restart, also correct the source of truth:
   `sudo sed -i 's/NICE_LEVEL=0/NICE_LEVEL=15/' /etc/telemetry-agent/telemetry-agent.conf`. The control
   script (`svc-ctl`) reads this value and applies it via `nice -n` every time it starts the service.
6. Verify: `ps -o pid,ni,pcpu,cmd -p ...` now shows `telemetry-agent` at `NI 15`, and `batch-report-job` is
   visibly getting the overwhelming majority of the CPU time in `top`.

One thing worth understanding about *why* the fix only works in this direction: lowering a process's
niceness (making it more negative / higher priority) requires the `CAP_SYS_NICE` capability, which this
container doesn't have -- so there was never a path to "fix" this by making `batch-report-job` more
aggressive instead. `renice`ing the *offending* process up is not just the conventional courteous fix, it's
the only one actually available here. That maps well to production practice too: proactively deprioritizing
a known-secondary workload (`nice`/`ionice` at launch) is far more robust than hoping to boost the important
job's priority after the fact.

Lesson: two processes at identical niceness fighting over a scarce, shared CPU budget will roughly
fair-share it regardless of which one actually matters -- check `ps -o ni` (or `top`'s `NI` column) whenever
a process that "should" be winning isn't, and look for where its competitor's priority is supposed to be
set (a config value feeding a control script's `nice -n`, in this case) before assuming the important job
itself is broken.
