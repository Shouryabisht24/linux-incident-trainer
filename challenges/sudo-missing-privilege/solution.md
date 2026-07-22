## Solution

1. `sudo -u oncall sudo -n id` → `oncall is not in the sudoers file. This incident will be reported.`
2. Grant sudo via a drop-in file (the maintainable, package-safe way) rather than editing `/etc/sudoers`:
   create `/etc/sudoers.d/oncall` with:
   `oncall ALL=(ALL) NOPASSWD:ALL`
3. Do it safely so a typo can't break sudo for everyone:
   `sudo visudo -f /etc/sudoers.d/oncall` (visudo syntax-checks before saving). If you write the file another
   way, set mode 0440 and run `sudo visudo -c` to validate: sudo ignores drop-in files that are group/world
   writable or malformed.
4. Verify: `sudo -u oncall sudo -n id` now works.

Lesson: grant sudo through `/etc/sudoers.d/` drop-ins and always edit with `visudo` (or validate with
`visudo -c`) — a single syntax error in any sudoers file disables sudo entirely, which can lock you out of a box.
