## Solution

1. The daemon runs as the unprivileged `orderd` user. Reproduce its failure directly:
   `sudo -u orderd sh -c 'echo hi >> /var/log/orderd/orderd.log'` → `Permission denied`.
2. Inspect the directory: `ls -ld /var/log/orderd` shows `drwxr-xr-x root root`. Mode `755`
   means only the owner (root) can write; the `orderd` user falls in "other" and gets only `r-x`.
3. Make `orderd` able to write. Simplest: `sudo chown orderd:orderd /var/log/orderd`.
4. Verify: `sudo -u orderd sh -c 'echo hi >> /var/log/orderd/orderd.log'` now succeeds.

Lesson: "permission denied" from a service is about the UID the service actually runs as, not
the UID you used to *start* it. Always reproduce as that user (`sudo -u <svc>`), not as root —
root's write would have "worked" and hidden the real problem.
