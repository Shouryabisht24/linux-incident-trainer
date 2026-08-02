## Solution

1. `webappctl start` fails immediately: `cat: /etc/webapp/conf.active/app.conf: Too many levels of symbolic
   links`.
2. That's `ELOOP` -- the kernel refused to keep resolving a symlink chain. `ls -l /etc/webapp/conf.active` and
   `readlink /etc/webapp/conf.active` show it points at `conf.active` -- itself. A broken deploy script created
   a self-referential loop instead of pointing the "active" pointer at a real profile.
3. The real profile is untouched: `cat /etc/webapp/profiles/prod/app.conf` shows a normal `LISTEN_PORT=8080`
   config, and `ls -l /etc/webapp/profiles/` confirms it's the only profile that actually exists on disk.
4. Repoint the symlink at the real target:
   ```
   sudo ln -sfn /etc/webapp/profiles/prod /etc/webapp/conf.active
   ```
   (`-f` replaces the existing broken link; `-n` treats `conf.active` itself as the link to replace rather
   than following it into a directory.)
5. Start the service: `webappctl start`. Confirm with `pgrep -af webapp-worker`.

### Reasoning

`ELOOP` is a distinct filesystem error from "no such file" (`ENOENT`, a dangling symlink) or "permission
denied" (`EACCES`). It specifically means the kernel's path-resolution walk hit its symlink-hop limit (40 on
Linux) without reaching a real file -- almost always because a symlink points back into its own chain, either
directly at itself or through a short cycle of two or more links. This is enforced identically for root and
unprivileged processes; no amount of `sudo` makes a circular symlink resolve.

`readlink` (or `namei -l` for a full one-hop-at-a-time trace through a longer chain) shows you exactly what a
link's target text is, which is the fastest way to tell "circular" apart from "dangling" apart from "points at
the wrong but real thing" -- three different bugs that all look identical from the outside as "the service
won't start."
