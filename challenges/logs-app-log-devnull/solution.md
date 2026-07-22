## Solution

1. `paymentd-log hello` then `cat /var/log/paymentd/paymentd.log` — still empty.
2. `ls -l /var/log/paymentd/paymentd.log` reveals it's a **symlink to `/dev/null`**. Everything appended
   to it is silently thrown away — a classic "make the disk-full alert stop" hack that destroys logging.
3. Replace it with a real file:
   `sudo rm /var/log/paymentd/paymentd.log && sudo touch /var/log/paymentd/paymentd.log`
4. Verify: `paymentd-log test && cat /var/log/paymentd/paymentd.log` shows the line.

Lesson: an always-empty log is often not "the app isn't logging" — check `ls -l` for a symlink to `/dev/null`
(or a wrong target). The real answer to log growth is rotation (`logrotate`), never redirecting to the bit bucket.
