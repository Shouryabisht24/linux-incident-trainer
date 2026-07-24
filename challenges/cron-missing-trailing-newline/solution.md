## Solution

1. `cat /etc/cron.d/nightly-sync` shows a perfectly valid-looking line: correct schedule syntax,
   a valid user, a real, executable command. Nothing about the content itself is wrong.
2. Check the raw bytes at the end of the file: `tail -c 1 /etc/cron.d/nightly-sync | od -c` shows
   the last byte is the letter `h` (from `.sh`), not a newline. You can also notice this simply
   because `cat`'s output runs straight into your next shell prompt with no line break.
3. cron requires every line in a crontab file, including the very last one, to be
   newline-terminated. A file that doesn't end in `\n` has its final line treated as incomplete
   and silently dropped -- with zero error output anywhere, since as far as cron's parser is
   concerned there was never a complete line there to reject.
4. Fix it: `echo >> /etc/cron.d/nightly-sync` appends a bare newline to the end of the file.
5. Verify: `tail -c 1 /etc/cron.d/nightly-sync | od -c` now shows `\n` as the last byte, and the
   job line is still intact (`grep nightly-sync.sh /etc/cron.d/nightly-sync`).

Lesson: a missing trailing newline is one of the most notorious "invisible" cron bugs -- the file
looks completely correct in `cat`, `less`, or any editor that doesn't visibly mark line endings,
there's no cron error log entry, and the only symptom is a job that quietly never fires. Any tool
or script that generates crontab files programmatically should always ensure it writes a final
newline.
