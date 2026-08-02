## Solution

1. Run the export script by hand and it works fine -- no bug in the script. The failure is one hop
   downstream: `sudo -u invoicer /opt/scripts/process-export.sh` prints
   `refusing to process /var/lib/invoicer/exports/last-export.txt: owned by root, not invoicer`.
2. `ls -l /var/lib/invoicer/exports/last-export.txt` confirms it: the file is owned by `root`, not
   `invoicer`.
3. `cat /etc/cron.d/export-invoices` shows the job line runs as `root`:
   `* * * * * root /opt/scripts/export-invoices.sh >> /var/log/export-invoices.log 2>&1`.
   Whatever user cron runs a job as becomes the owner of any file that job creates -- there's nothing
   wrong with the export script's logic, only with which account cron invokes it as.
4. Fix it at the source -- the cron job definition, not the file after the fact:
   ```
   sudo sed -i 's/^\* \* \* \* \* root /* * * * * invoicer /' /etc/cron.d/export-invoices
   ```
   (Editing the user field directly, e.g. with `sudo nano /etc/cron.d/export-invoices`, works just as
   well.)
5. Re-run the job the way cron now will (`su -s /bin/sh -c /opt/scripts/export-invoices.sh invoicer`,
   or just wait for the next minute) and confirm `sudo -u invoicer /opt/scripts/process-export.sh` now
   succeeds -- the fresh file is owned by `invoicer`.

Lesson: the user field in a crontab or `/etc/cron.d` entry isn't just "who has permission to run this" --
it's "who owns everything this job produces." A downstream consumer that (reasonably) trusts only its own
service account's output will silently reject anything a misconfigured job produces under the wrong
identity, even though the job itself reports total success. When a pipeline's own script runs clean but a
later stage rejects its output, check *which account* actually ran it, not just whether it ran.
