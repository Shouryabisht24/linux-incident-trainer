## Solution

**Reasoning first.** The symptoms rule out the usual suspects: the key material is right (it's the same key
that's sitting in `~/deploy_key`), and `~/.ssh`/`authorized_keys` permissions on `deploy`'s home are exactly
`700`/`600` -- a StrictModes violation would explain a rejection, but this isn't one. What's left, once
"the key is wrong" and "the permissions are wrong" are both ruled out, is: **sshd isn't reading the file you
think it's reading.** `AuthorizedKeysFile` is one of the few directives that fully *replaces* the default
lookup rather than adding to it -- set it, and `~/.ssh/authorized_keys` is simply never consulted again,
correct key or not.

1. Confirm sshd's effective config: `sudo sshd -T | grep -i authorizedkeysfile` shows something like
   `authorizedkeysfile /etc/ssh/authorized_keys/%u` -- not the default `.ssh/authorized_keys`.
2. Find the source: `sudo grep -rin authorizedkeysfile /etc/ssh/sshd_config /etc/ssh/sshd_config.d/` points to
   `/etc/ssh/sshd_config.d/authkeys.conf`, left behind by an in-progress migration to a centralized
   authorized-keys layout (common in fleets managed by config-management tools, so that keys can be pushed to
   `/etc/ssh/authorized_keys/<user>` by root without needing write access to every user's home directory).
3. `%u` expands to the username, so sshd is looking for `/etc/ssh/authorized_keys/deploy`. Check whether that
   exists: `sudo ls -la /etc/ssh/authorized_keys/` -- the directory itself doesn't exist. The migration was
   configured but never actually carried out.
4. Deploy's real public key is still sitting, unused, in the old default location:
   `/home/deploy/.ssh/authorized_keys`. Create the new expected path and put it there, owned by root
   (readable is fine -- this is a centralized directory, not a per-user home, so it isn't subject to the same
   "must be owned by the target user" expectation StrictModes has for `~/.ssh`):
   ```
   sudo mkdir -p /etc/ssh/authorized_keys
   sudo cp /home/deploy/.ssh/authorized_keys /etc/ssh/authorized_keys/deploy
   sudo chmod 755 /etc/ssh/authorized_keys
   sudo chmod 644 /etc/ssh/authorized_keys/deploy
   ```
5. No sshd reload is needed -- unlike `sshd_config` directives, the *contents* of whatever
   `AuthorizedKeysFile` points at are read fresh on every authentication attempt.
6. `ssh -i ~/deploy_key deploy@localhost` now succeeds.

Lesson: `AuthorizedKeysFile` is a full override, not an addition to the default search path -- and it accepts
`%u` (username) and `%h` (home directory) tokens for exactly this kind of centralized-storage layout. When key
auth fails and the key/permissions both check out, always confirm *where sshd is actually looking* with
`sshd -T` before assuming the problem is the key itself.
