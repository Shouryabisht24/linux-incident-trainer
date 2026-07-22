## Solution

1. Key auth fails for everyone → it's server config, not `~/.ssh` permissions.
2. Ask sshd for its effective setting: `sudo sshd -T | grep -i pubkey` → `pubkeyauthentication no`.
3. Locate the source: `sudo grep -rin pubkeyauthentication /etc/ssh/sshd_config /etc/ssh/sshd_config.d/`
   points to `/etc/ssh/sshd_config.d/hardening.conf`.
4. Change it to `PubkeyAuthentication yes`, validate the config, and reload:
   `sudo sshd -t && sudo service ssh reload` (or `sudo kill -HUP $(cat /run/sshd.pid)`).
5. `ssh -i ~/deploy_key deploy@localhost` works again.

Lesson: `sshd -T` prints the *effective* merged config — the fastest way to see what sshd actually believes,
including values from `sshd_config.d/` drop-ins that override the main file. Always `sshd -t` (syntax-check)
before reloading so a typo doesn't take the SSH daemon down.
