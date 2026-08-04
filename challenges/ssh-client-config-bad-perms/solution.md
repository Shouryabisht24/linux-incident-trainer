## Solution

**Reasoning first.** Every other SSH challenge in this set is about the *server* (sshd) rejecting something
-- a config directive, a host key, a user's `authorized_keys`. This one never gets that far: the failure
happens on the machine you're sitting on, in a process running as your own unprivileged user, before any TCP
connection to sshd is even attempted. That's the tell that the actor enforcing the rule this time is the
`ssh` client itself, not sshd.

1. Run it without hiding stderr: `ssh apphost 'echo hi'` prints
   `Bad owner or permissions for /home/trainee/.ssh/config` and exits immediately -- no connection attempt,
   no host key prompt, nothing.
2. This is the `ssh(1)` client's own StrictModes-equivalent check: it will not read a per-user config file
   (`~/.ssh/config`) if that file is writable by group or other, on the theory that anyone who can write to it
   could redirect your connections or inject their own `ProxyCommand`. This check runs as *you*, using your
   own real UID -- it has nothing to do with sshd or the target host, which is why it fails identically no
   matter what's on the other end.
3. Confirm the mode: `ls -l ~/.ssh/config` shows `-rw-rw-rw-` (or similar) -- writable by everyone, not just
   the owner.
4. Fix it: `chmod 600 ~/.ssh/config`.
5. `ssh apphost 'echo SSH_OK'` now works -- the `apphost` alias resolves, pulling in its `HostName`, `User`,
   and `IdentityFile` from the config exactly as intended.

Lesson: `ssh` enforces permission hygiene on its *own* config file the same way sshd enforces it on
`authorized_keys` -- both exist so that a file controlling how/where credentials get used can't be tampered
with by anyone but its owner. When an SSH command fails instantly, with no network delay and no
authentication back-and-forth visible, suspect the client side (`~/.ssh/config`, `known_hosts`, or a bad
`IdentityFile` path) before assuming the server rejected anything.
