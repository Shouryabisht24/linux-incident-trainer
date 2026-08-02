## Solution

1. `apt-cache policy auditlog-agent` shows:
   ```
   auditlog-agent:
     Installed: 1.0-1
     Candidate: 1.0-1
     Version table:
        2.0-1 500
           500 file:/opt/pkg-repo ./ Packages
    *** 1.0-1 1001
          1001 file:/opt/pkg-repo ./ Packages
          100 /var/lib/dpkg/status
   ```
   Both versions are visible in the mirror, but 1.0-1 carries priority `1001` while 2.0-1 only carries
   `500`. apt always picks the highest-priority version as `Candidate` -- so 1.0-1 wins regardless of
   which is actually newer, and regardless of what an `apt-get upgrade` or `install --only-upgrade` tries
   to do.
2. Priorities above 1000 are special in apt: they mean "install this version even if it constitutes a
   downgrade from what's currently installed." That's a strong hint this pin was deliberately set during
   some past event (an incident freeze, in this case) rather than being an accident.
3. Find the source: `grep -rl auditlog-agent /etc/apt/preferences.d/` turns up two files:
   - `00-incident-freeze`: `Pin: version 1.0-1` / `Pin-Priority: 1001` -- the leftover freeze pin.
   - `50-auditlog-rollout`: `Pin: version 2.0-1` / `Pin-Priority: 500` -- a later attempt to roll the fix
     out, added without noticing (or removing) the freeze pin still in place.
4. The freeze is long over, so the fix is to remove (or lower) the stale pin:
   ```
   sudo rm /etc/apt/preferences.d/00-incident-freeze
   ```
5. Confirm the candidate flipped: `apt-cache policy auditlog-agent` should now show `Candidate: 2.0-1`.
6. Actually install it:
   ```
   sudo apt-get update
   sudo apt-get install --only-upgrade -y auditlog-agent
   ```
7. Verify both `Installed:` and `Candidate:` read `2.0-1`.

### Reasoning

APT resolves a package's *candidate* version by combining every matching stanza across **all**
`/etc/apt/preferences.d/*` files (plus `/etc/apt/preferences` itself) and taking the highest priority
number that applies -- there's no "last file wins" or "most specific wins" rule; it's a strict max over
every applicable pin. That means two files, written by two different people at two different times for
two different reasons, can silently combine into a result neither of them intended. Just installing
`auditlog-agent=2.0-1` by explicit version would have "fixed" the installed package but left the
underlying pin conflict in place -- the very next `apt-get upgrade` a teammate ran would have quietly
reverted it back to 1.0-1, since the candidate itself was never actually corrected. Checking `apt-cache
policy`'s `Candidate:` line, not just the installed version, is what catches that shortcut.
