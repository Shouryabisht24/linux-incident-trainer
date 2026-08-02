## Solution

1. `cat /etc/cron.d/rotate-metrics` shows the job with no output redirection at all:
   `*/5 * * * * trainee /opt/scripts/rotate-metrics.sh`. Cron's default behavior for output like this
   is to mail it to the job's owner -- but `which sendmail` / `which mail` come back empty. There's no
   mail transport agent installed, so whatever the job printed (including any error) was generated and
   then simply discarded; nothing ever gets written to disk or the terminal.
2. Fix the visibility problem first: add a redirection to the cron.d line so future output lands
   somewhere real:
   ```
   */5 * * * * trainee /opt/scripts/rotate-metrics.sh >> /var/log/rotate-metrics.log 2>&1
   ```
3. Run the script the way cron will now capture it: `/opt/scripts/rotate-metrics.sh >> /var/log/rotate-metrics.log 2>&1; cat /var/log/rotate-metrics.log`. Now the real error is visible:
   `cp: cannot stat '/var/lib/metrics/metrics.log': No such file or directory`.
4. `ls /var/lib/metrics/` shows the actual file is `metrics.current.log`, not `metrics.log` -- the
   script was written against an old filename from before a rename. Fix the script's `SRC` variable:
   ```
   sed -i 's#/var/lib/metrics/metrics.log#/var/lib/metrics/metrics.current.log#' /opt/scripts/rotate-metrics.sh
   ```
5. Re-run it and confirm an archive file now appears under `/var/lib/metrics/archive/`, and that the
   log file stays useful for next time.

Lesson: cron jobs with no output redirection and no MTA on the box are a black hole -- "the job never
runs" and "the job runs and fails instantly" look identical from the outside. Always give a cron job an
explicit destination for its output (`>>` a log file, or a monitoring/alerting hook) *before* trying to
diagnose why it "isn't working" -- otherwise you're debugging blind. Once output is visible, the actual
bug here (a stale hardcoded path after a file rename) is trivial to spot and fix.
