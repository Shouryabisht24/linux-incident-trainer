## Solution

1. Compare installed vs. available: `apt-cache policy widget-cli` shows `Installed: 1.0-1` while the
   version table lists `2.0-1` as available from the internal mirror (`file:/opt/pkg-repo`). The mirror
   is healthy and the newer package is genuinely there -- so a normal upgrade *should* work.
2. Try it anyway: `sudo apt-get install --only-upgrade widget-cli` (or `sudo apt-get upgrade`) reports the
   package is being kept back, or does nothing. That's the tell that something is deliberately blocking
   this specific package, independent of dependency or network issues.
3. `apt-mark showhold` lists `widget-cli`. A hold is apt's way of freezing a package at its current
   version -- `apt-get upgrade` and `install --only-upgrade` both skip anything on the hold list
   entirely, by design, regardless of what's available. It was set during an earlier incident freeze
   and never lifted once that freeze ended.
4. Lift it and upgrade:
   ```
   sudo apt-mark unhold widget-cli
   sudo apt-get update
   sudo apt-get install --only-upgrade -y widget-cli
   ```
5. Verify: `widget-cli --health` now prints `OK` -- the 2.0-1 binary is running.

### Reasoning

`apt-mark hold` is meant to be a deliberate, temporary safety valve (e.g. "don't touch this package
during tonight's freeze"), but it has no expiry and leaves no obvious trace in everyday commands --
`apt list --upgradable`, `apt-get upgrade -s`, even `apt-cache policy` won't shout "this is held," they
just quietly agree the candidate isn't going to change. The only way to see it is to explicitly ask
(`apt-mark showhold`, or `apt-mark showhold widget-cli`). This is exactly why holds left over from past
incidents are a classic silent blocker: everything about the package and its mirror looks completely
healthy, and the fix (`apt-mark unhold`) is trivial once you know to look for it -- the hard part is
remembering holds exist at all.
