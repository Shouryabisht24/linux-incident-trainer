## Solution

1. Reproduce the real workflow, not a guess: `sudo -u dataexport sh -c "umask 027; touch /srv/exports/probe"`
   (dataexport owns the directory, so this write succeeds), then
   `sudo -u analyst test -r /srv/exports/probe` -- **denied**.
2. `ls -l /srv/exports/probe` shows the new file's group is `dataexport`, not `exportreaders`. `ls -ld
   /srv/exports` shows no `s` in the group execute position -- there's no setgid bit, so this directory does
   **not** force new files to inherit its own group. Whatever group a new file gets instead comes purely from
   the process that created it.
3. `id dataexport` shows `gid=1001(dataexport) groups=1001(dataexport)` -- its **primary** group is its own
   private group, not `exportreaders`. `analyst`, meanwhile, correctly has `exportreaders` as a
   **supplementary** group (`groups=...,exportreaders`), which is fine for *reading* files that are already
   group-owned `exportreaders` -- but says nothing about what group *new* files dataexport creates will get.
4. Fix the primary group: `sudo usermod -g exportreaders dataexport`. Now `id dataexport` shows
   `gid=1000(exportreaders)`.
5. Verify with a fresh file: `sudo -u dataexport sh -c "umask 027; touch /srv/exports/probe2"` then
   `sudo -u analyst test -r /srv/exports/probe2` -- succeeds.

### Reasoning: why this needed `-g`, not `-aG`

This is the crux of the challenge, and it's worth being explicit about the underlying mechanism because it's
easy to get "fixed" by luck with the wrong command:

- When a process creates a new file, the kernel assigns that file's **group** from the process's *effective
  GID* -- which, absent something like a setgid directory or an explicit `newgrp`/`sg`, is simply the
  process's **primary** group as recorded in `/etc/passwd`. Supplementary groups are consulted only for
  **permission checks** against existing files/directories -- they play no part in deciding what group a
  brand-new file gets.
- `usermod -aG exportreaders dataexport` (append to supplementary groups) would make `dataexport`
  technically "a member of `exportreaders`" per `id`, and would even let it read/write *existing*
  `exportreaders`-owned files -- but it does nothing to change what group *future* files it creates come out
  as. Confirmed directly: running that command instead and re-testing still produced a `dataexport`-group
  file that `analyst` couldn't read.
- `usermod -g exportreaders dataexport` (change the primary group) is the only fix that actually changes
  what group new files get, because it changes the value the kernel reads at file-creation time.

This is the mirror image of `user-not-in-group`, which is about a **supplementary**-group gap blocking
access to an **existing**, already-correctly-group-owned resource (`usermod -aG` is exactly right there).
Here the resource doesn't exist yet at the moment of the bug -- it's created fresh by the misconfigured
account -- so the fix has to reach all the way back to which group the kernel will stamp on it, which is a
primary-group question, not a supplementary-group one.

Lesson: "is the user in the right group" has two different answers depending on whether you're asking
about *reading what's already there* (supplementary groups, `usermod -aG`) or *what group new files a
process creates will get* (the primary group, `usermod -g`) -- confusing the two produces a fix that looks
plausible, changes `id`'s output, and does not actually solve the problem.
