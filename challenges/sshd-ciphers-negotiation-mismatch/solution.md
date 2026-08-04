## Solution

**Reasoning first.** Every other access-control incident in this category fails *after* a TCP connection is
established and *during* authentication -- a key is rejected, a user is excluded, a command is overridden.
This one fails before any of that: there's no login prompt, no password fallback, nothing user-specific at
all. That's the signature of a transport-layer (algorithm negotiation) failure, which happens during the
initial key exchange, strictly before sshd even knows or cares which user is connecting.

1. Run it without hiding stderr: `ssh -i ~/deploy_key deploy@localhost 'echo hi'` fails immediately with
   `Unable to negotiate with ::1 port 22: no matching cipher found. Their offer: 3des-cbc`.
2. "Their offer" is the server's proposal -- i.e. sshd's `Ciphers` list. Confirm it directly:
   `sudo sshd -T | grep -i '^ciphers'` → `ciphers 3des-cbc`.
3. Locate the source: `sudo grep -rin '^ciphers' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/` points to
   `/etc/ssh/sshd_config.d/ciphers.conf` -- a "disable weak ciphers" hardening change that named the one
   cipher to keep instead of the ones to drop, leaving only a legacy 3DES cipher that modern `ssh` clients
   don't even include in their default proposal (CBC-mode and 3DES ciphers were phased out of default client
   offers years ago over known weaknesses).
4. Fix the list to include at least one modern AEAD cipher, preserving the intent of the original hardening
   rather than reverting it: change the line to something like
   `Ciphers 3des-cbc,aes256-gcm@openssh.com,chacha20-poly1305@openssh.com`.
5. Validate and reload: `sudo sshd -t && sudo service ssh reload`.
6. `ssh -i ~/deploy_key deploy@localhost 'echo SSH_OK'` now succeeds.

Lesson: `Ciphers`/`KexAlgorithms`/`MACs`/`HostkeyAlgorithms` restrictions are transport-level, evaluated during
the very first packet exchange -- long before `AllowUsers`, `PubkeyAuthentication`, or any per-user directive
gets a chance to matter. `sshd -T` shows the effective (server-side) list; a failed negotiation error always
names the client's actual offer, which is the fastest way to see exactly what's not overlapping. When
"hardening" a cipher/KEX/MAC list, always verify with a real client connection afterward -- `sshd -t` only
checks that the config *parses*, not that anything can actually negotiate against it.
