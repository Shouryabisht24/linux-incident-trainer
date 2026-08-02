## Solution

1. `sudo -u netops sudo -n id` fails with `sudo: a password is required` -- notice this is a *different*
   message from `sudo-missing-privilege`'s `is not in the sudoers file`. That phrasing means sudo evaluated
   its policy and found **no matching rule** for netops, even though something was clearly written for it.
2. Run the real diagnostic tool: `sudo visudo -c`. It reports a syntax error at a specific location, e.g.:
   ```
   /etc/sudoers.d/netops:1:17: syntax error
   netops ALL=(ALL NOPASSWD:ALL
                   ^~~~~~~~~
   ```
3. `sudo cat /etc/sudoers.d/netops` shows the actual line: `netops ALL=(ALL NOPASSWD:ALL` -- the closing
   paren after the runas list (`ALL`) is missing, so the parser can't make sense of the rule and drops it
   entirely. sudo does **not** fall back to "grant nothing but keep going for everyone else" in a way that
   surfaces the loss anywhere except a syntax-error log line -- from netops's point of view it just looks
   like sudo was never configured.
4. This box has no text editor installed (`visudo -f` needs `$EDITOR`/`vi` and finds neither), so write the
   corrected line directly and lean on `visudo -c` for the validation `visudo -f` would normally give you:
   `echo 'netops ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/netops && sudo chmod 440
   /etc/sudoers.d/netops && sudo visudo -c`.
5. Verify: `sudo visudo -c` now reports every sudoers source parsed OK, and `sudo -u netops sudo -n id`
   succeeds.

### Reasoning / why this is a distinct failure mode from `sudo-missing-privilege`

`sudo-missing-privilege` is a user who was **never granted anything** -- the fix is to add a rule. This
challenge is a user who **has** a rule on disk, written in the theoretically-right place
(`/etc/sudoers.d/`), that still doesn't work because of a syntax error -- a much more confusing on-call
scenario, since a hasty `ls /etc/sudoers.d/` or `cat` of the file makes it look like the grant is already
there. The tell is in sudo's own error message (`is not in the sudoers file` vs. `a password is required`)
and confirmed decisively by `visudo -c`, which is exactly why it's the canonical diagnostic for any
sudoers-not-behaving-as-expected report.

It's also worth knowing what this failure mode is *not*: on modern sudo (this box runs 1.9.13), a syntax
error in one `sudoers.d` file does **not** take down sudo for every user on the box -- it only invalidates
the rule(s) inside that broken file. `trainee`'s own grant lives directly in `/etc/sudoers` and kept working
throughout this incident, which is exactly how `trainee` was able to SSH in and fix it in the first place. A
single typo can absolutely disable sudo for the *specific user or rule* it was meant to configure, but
"one bad drop-in locks out the entire box" is closer to sudoers folklore than this sudo build's actual,
observed behavior -- always verify with `visudo -c` rather than assuming the worst (or the mildest) case.

Lesson: a sudoers rule that looks present isn't the same as a sudoers rule that parses. Always run
`sudo visudo -c` after any manual edit to `/etc/sudoers.d/*`, and always edit with `visudo` (or its `-f`
form for a specific file) so a syntax error is caught before it's saved, not discovered later via a
confused on-call ticket.
