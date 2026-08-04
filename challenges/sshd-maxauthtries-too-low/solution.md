## Solution

**Reasoning first.** The correct key is genuinely authorized and genuinely offered -- so this isn't a
key-management or access-control problem in the usual sense. What's different here is the *shape* of the
login: it's not one key, it's a sequence of keys tried in order, and the failure happens mid-handshake rather
than as an outright rejection. That combination points at a counter that trips before the sequence finishes,
not at any single key or user being blocked.

1. Watch `auth.log` during a failed run: `sudo tail -n 30 /var/log/auth.log` shows two
   `Failed publickey for deploy` lines (for the two retired decoy keys) immediately followed by
   `Disconnecting: Too many authentication failures for deploy`. sshd drops the connection outright -- it
   never reaches the third, correct key in the sequence.
2. Ask sshd for its effective setting: `sudo sshd -T | grep -i maxauthtries` → `maxauthtries 2`. Every
   publickey offer that sshd rejects counts as one authentication failure against this limit, regardless of
   which key or method. With 2 retired keys ahead of the real one, hitting the limit is inevitable no matter
   how correct the final key is.
3. Locate the source: `sudo grep -rin maxauthtries /etc/ssh/sshd_config /etc/ssh/sshd_config.d/` points to
   `/etc/ssh/sshd_config.d/authtries.conf` -- a brute-force-hardening change that didn't account for this
   fleet's legitimate multi-key rotation flow.
4. Fix the *existing* line rather than appending a new one:
   `sudo sed -i 's/MaxAuthTries 2/MaxAuthTries 6/' /etc/ssh/sshd_config.d/authtries.conf`. This matters:
   sshd_config directives are first-match-wins when a file is parsed top to bottom -- a second `MaxAuthTries`
   line appended below the first would be silently ignored, and the original `2` would still be in effect.
5. Validate and reload: `sudo sshd -t && sudo service ssh reload`.
6. The full sequence now succeeds:
   `ssh -o IdentitiesOnly=yes -i ~/decoy1_key -i ~/decoy2_key -i ~/deploy_key deploy@localhost 'echo SSH_OK'`
   prints `SSH_OK`.

Lesson: `MaxAuthTries` counts failed *attempts*, not failed *logins* -- any workflow that legitimately offers
more than one credential per connection (key rotation, `ssh-agent` holding several identities, PAM stacking
multiple factors) needs headroom above the number of credentials it might try, or brute-force hardening will
start rejecting its own legitimate users. And when editing `sshd_config`-style files, remember duplicate
directives don't "last value wins" the way shell variables do -- the first one sshd reads takes effect.
