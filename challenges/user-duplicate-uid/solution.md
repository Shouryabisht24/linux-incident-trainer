## Solution

1. The trap: `getent passwd 1301` (or `id 1301`, or `ls -l` on any file owned by that UID) shows only
   **one** name -- `logshipper`. NSS's UID-keyed lookup (`getpwuid()`) returns the first matching
   `/etc/passwd` line for a given numeric UID; it has no concept of "there might be more than one." To see
   the real picture you have to read the file directly: `awk -F: '$3==1301 {print}' /etc/passwd` lists
   **both** `logshipper` and `metricsagent`.
2. `ls -ld /home/metricsagent` displays owner `logshipper` -- not because anything is actually wrong with
   that directory's on-disk UID, but because 1301 resolves to whichever name comes first in `/etc/passwd`.
   `metricsagent`'s home directory genuinely is owned by UID 1301, same as `logshipper`'s; the kernel makes
   no distinction between the two accounts at all -- they are, functionally, the same identity.
3. Decide which account is the legitimate long-term owner of UID 1301. Here it's clearly `logshipper` --
   it already owns real production data (`/var/lib/logship/data/shipment.log`). `metricsagent` is the
   account that was created later and should be the one renumbered.
4. Pick a genuinely free UID (`getent passwd | awk -F: '{print $3}' | sort -n` to see what's taken) and
   renumber the newer account: `sudo usermod -u 1302 metricsagent`.
5. Verify: `id logshipper` and `id metricsagent` now report different UIDs. `ls -ld /home/metricsagent`
   now correctly shows `metricsagent` as owner -- `usermod -u` automatically re-chowns the files it already
   knows the account owns (its home directory, and anything else on disk still tagged with the account's
   *old* UID gets updated too), so the account's own home directory doesn't need a manual `chown` pass.
   `logshipper` and its data file were never touched and remain exactly as they were.

### Reasoning

A duplicate UID is a genuinely dangerous class of bug precisely because the tools admins reach for first
(`ls -l`, `getent passwd <uid>`, `id <uid>`) are **UID-keyed and can only show one name** -- they will
never reveal that a second account exists at the same UID; they'll just confidently print the wrong name.
The only reliable way to detect it is to read `/etc/passwd` (or `/etc/shadow`) directly and look for the
UID *field* appearing more than once, or use a tool that enumerates rather than looks up
(`awk -F: '{print $3}' /etc/passwd | sort | uniq -d`).

The security implication is real, not just cosmetic: as far as the kernel's permission checks are
concerned, `metricsagent` and `logshipper` are **the same principal**. Anything one account can read,
write, or `kill`, the other can too -- there is no isolation between them at all. A duplicate UID that
happens to collide with a genuinely sensitive account (rather than this challenge's relatively low-stakes
example) is a privilege-escalation bug, not just a confusing `ls -l`.

Lesson: never assume a UID maps to exactly one account. Whenever provisioning automation computes "the next
free UID" itself (instead of letting `useradd` allocate one), verify the result against the *entire*
`/etc/passwd` file, not a single lookup -- and be suspicious of `--non-unique`/`-o` showing up anywhere in
a service-account creation script unless it's genuinely intentional (e.g. deliberately aliasing two names to
one UID), which is rare and should be loudly documented when it is.
