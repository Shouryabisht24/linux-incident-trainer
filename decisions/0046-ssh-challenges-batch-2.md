# 0046: SSH & Remote Access challenges, batch 2 (final 5, brings project to 100)

## Context

The project expanded from 50 to 100 challenges in small batches after an earlier large parallel batch
caused infrastructure instability. This batch is the final wave: 5 new challenges in **SSH & Remote Access**,
authored from scratch, bringing the project to exactly 100 challenges total. Five SSH challenges already
existed (`ssh-authorized-keys-perms`, `sshd-allowusers-blocks-user`, `sshd-host-key-perms-too-open`,
`sshd-match-forces-restricted-shell`, `sshd-pubkey-auth-disabled`) and were not to be duplicated.

## Final 5 slugs

1. **`sshd-authorizedkeysfile-wrong-path`** -- `AuthorizedKeysFile` repointed to a centralized
   `/etc/ssh/authorized_keys/%u` layout (an in-progress migration) that was never actually populated; the
   trainee's key and `~/.ssh` permissions are both fine, but sshd is looking in the wrong place entirely. Distinct
   from `sshd-pubkey-auth-disabled` (a blanket `PubkeyAuthentication no` toggle) -- this is a *path*
   misconfiguration, and the fix is creating a real file at the right location, not flipping a yes/no flag.
2. **`sshd-listening-on-nonstandard-port`** -- sshd moved to a non-default port during a hardening pass; a
   deploy pipeline hardcoded to port 22 can't reach it. Trainee must discover the actual port (`sshd -T`, `ss
   -tlnp`) and add `Port 22` back (sshd supports multiple `Port` directives, so this doesn't require reverting
   the hardening change).
3. **`ssh-client-config-bad-perms`** -- the trainee's own `~/.ssh/config` is world-writable, so the `ssh`
   client itself (running as the trainee's own unprivileged user, independent of sshd or root) refuses to use
   it ("Bad owner or permissions"). This is the client-side counterpart to the existing server-side
   `ssh-authorized-keys-perms` StrictModes challenge -- same shape of bug, different enforcing actor.
4. **`sshd-maxauthtries-too-low`** -- `MaxAuthTries` set to 2 for anti-brute-force hardening, but the
   fleet's real deploy automation legitimately offers 3 keys per connection (2 retired keys from a rotation,
   then the current one); the connection gets dropped after the retired keys fail, before the correct key is
   ever tried. Fix requires editing the *existing* `MaxAuthTries` line in place, not appending a duplicate --
   sshd_config keeps the first value it reads for a directive within a file, which is itself part of the
   lesson.
5. **`sshd-ciphers-negotiation-mismatch`** -- see "Seed swapped" below. sshd's `Ciphers` list was restricted
   during a "disable weak ciphers" hardening pass to a single legacy cipher (`3des-cbc`) that a modern `ssh`
   client doesn't propose by default, so the transport-layer key exchange itself fails
   ("Unable to negotiate ... no matching cipher found") before authentication is ever attempted -- a
   genuinely different failure class (transport negotiation) from every other SSH challenge in the set, all of
   which fail during or after authentication.

## Seed swapped

Seed idea 5 (a chrooted, `internal-sftp`-only user missing a required library/binary inside the jail) was
attempted first, per the brief's explicit encouragement to try it. It was built with the "compile/copy real
binaries + shared libs" pattern from `decisions/0016`: an external `/usr/lib/openssh/sftp-server` binary (not
`internal-sftp`, specifically to require in-jail libraries) copied into the chroot along with its `ldd`
dependency closure (computed dynamically at build time, architecture-agnostic), a `/dev/null` device node, and
a minimal `/etc/passwd`/`/etc/group` -- with the `libc.so.6` copy deliberately deleted from the jail as the
break. Confirmed the exact real-world failure mode manually (`chroot /srv/sftp/sftpuser
/usr/lib/openssh/sftp-server` → `error while loading shared libraries: libc.so.6: cannot open shared object
file`), and confirmed copying it back fixed that specific failure at the raw-chroot level. But the *real* sshd-
mediated SFTP session still died immediately after the protocol handshake began (`channel 0: read failed rfd 8:
Broken pipe` in `sshd -d -d` output) even with the library restored, `/dev/null`, and `/etc/passwd` all present
-- almost certainly an NSS `dlopen()` dependency (`libnss_files.so.2`) that doesn't show up in a static `ldd`
listing and would have required yet another undocumented jail dependency to chase down. Given the AUTHORING.md
brief's explicit fallback clause for exactly this situation, substituted the cipher/KEX negotiation-mismatch
scenario above instead: still a genuinely distinct SSH failure class (transport vs. every other challenge's
authentication/access-control layer), but built and verified cleanly on the first attempt with no exotic ELF
/chroot runtime dependencies to fight.

## Verification

All 5 went through the full build → run-with-platform-flags → check-before (non-zero) → fix-as-`trainee` →
check-after (zero) loop before shipping; see each challenge's own reasoning in the transcript. Two ran the
additional real-stack loop: signed up a throwaway account, `POST
/api/challenges/<slug>/sessions` after a `docker compose restart backend` (required for
`syncChallengesFromDisk`), confirmed `POST /api/sessions/:id/check` returned `passed: false` against the real
session container before the fix, applied the fix as `trainee` via `docker exec -u trainee` into the real
container, confirmed `passed: true` after, then `POST /api/sessions/:id/stop` and deleted the throwaway
account:
- `sshd-ciphers-negotiation-mismatch`
- `ssh-client-config-bad-perms`

Note: this environment appears to share Docker state and `/tmp` scratch space across concurrently-running
batch agents (a stray `/tmp/token.txt` from another agent's own throwaway-account test collided with this
batch's identically-named scratch file mid-verification, and an unrelated `tsx watch` dev-server restart
drained an in-flight session at one point). Neither affected the verification's validity -- sessions were
consistently started and stopped under whichever token was actually live at each step -- but both were flagged
and corrected before the batch was declared done, and no other agent's `verify/*` build cache or running
containers were intentionally disturbed (a `docker rmi` cleanup of this batch's own throwaway `verify/*` test
tags at the end only removed images not backing any running container, confirmed via inspecting each removal
for errors before treating cleanup as complete).

## Result

Challenge count: 100 directories under `challenges/` (excluding `_schema/` and `AUTHORING.md`), confirmed
directly by listing. This batch is the last of 10; a separate consolidation step handles `tasks.md` and any
milestone summary.
