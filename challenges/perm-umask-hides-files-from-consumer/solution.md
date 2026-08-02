## Solution

1. Run the report generator as the real actor, right now, rather than waiting on cron's schedule:
   `sudo -u reportgen /usr/local/bin/generate-report.sh`. It succeeds -- the job itself is fine.
2. Find the file it just wrote and check its permissions: `ls -la /var/lib/reports/`. The newest
   file is mode `0600`, owned `reportgen:reportreaders` -- readable only by `reportgen` itself.
   That's odd, because `ls -ld /var/lib/reports` shows the directory itself is correctly set up:
   group-owned by `reportreaders` (which `dashboard` is a member of -- confirm with
   `id dashboard`) with the setgid bit, so new files should get the right *group* automatically.
   The group is right; the mode is wrong.
3. Read the script: `cat /usr/local/bin/generate-report.sh`. Near the top: `umask 077`. A
   process's umask is applied at file-creation time, stripping the corresponding bits from
   whatever the default mode would otherwise be (`0666` for a plain file) -- `077` strips
   *everything* except the owner's own read/write, regardless of what group the file ends up
   belonging to. The setgid directory got the group right; the umask then threw away every bit
   that would have let that group actually matter.
4. Fix the script: `sudo nano /usr/local/bin/generate-report.sh` and change `umask 077` to
   something that still permits group-read, e.g. `umask 027` (yields `0640`) or `umask 022`
   (yields `0644`, also world-readable -- fine here since the report isn't sensitive, but `027` is
   the tighter, more correct choice for a group-gated shared directory like this one).
5. Verify: `sudo -u reportgen /usr/local/bin/generate-report.sh` again, then
   `ls -la /var/lib/reports/` -- the new file is now `0640` (or `0644`), group `reportreaders`.
   `sudo -u dashboard cat <newest-file>` now succeeds and prints the report contents.

Lesson: `umask` is process-scoped, not file- or directory-scoped -- it's applied fresh every time
*that process* creates a file, completely independent of the directory's own ownership/setgid
setup. A directory can be perfectly configured for group-shared access and a script running inside
it can still silently produce unreadable files if its umask is too restrictive. This is an easy
thing to get wrong in exactly the direction this challenge shows: someone "hardening" a script by
tightening its umask, without accounting for the fact that a different, legitimate process is
supposed to read what it produces. Always check both the directory's setup *and* the actual mode
of a freshly created file -- they can tell two different stories.
