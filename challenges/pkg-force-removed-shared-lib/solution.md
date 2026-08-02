## Solution

1. `clientapp` fails with `error while loading shared libraries: libfoo.so.1: cannot open shared object
   file: No such file or directory`.
2. Check dpkg's own view of the two packages:
   ```
   dpkg-query -W -f='${Status}\n' libfoo1     # not installed
   dpkg-query -W -f='${Status}\n' clientapp   # install ok installed
   ```
   `clientapp` is still fully installed and still declares `Depends: libfoo1` in its control data -- but
   `libfoo1` itself is gone. That gap is the actual "database inconsistency": dpkg is internally correct
   about each package individually, but the dependency relationship between them no longer holds.
3. Confirm it the proper way apt itself would notice: `sudo apt-get check` reports `clientapp` has an
   unmet dependency on `libfoo1`.
4. The temptation is to just restore `/usr/lib/libfoo.so.1` by hand (copy a file, run `ldconfig`) -- don't.
   That would get `clientapp` running again but would leave dpkg's package database still showing
   `libfoo1` as not installed, and `apt-get check` would still flag the problem. The fix has to go through
   the package manager so both the files *and* the bookkeeping come back in sync.
5. Confirm the package is still available (it's in the internal mirror this whole environment already
   uses) and reinstall it properly:
   ```
   sudo apt-get update
   sudo apt-get install -y libfoo1
   ```
   Because dpkg already considers `libfoo1` not-installed, a plain `install` (not `--reinstall`) puts it
   back -- extracting the real file and, just as importantly, restoring the "install ok installed" status
   line that satisfies `clientapp`'s recorded dependency.
6. Verify: `clientapp` prints `RESULT=42`, `sudo apt-get check` is silent, and
   `dpkg-query -W -f='${Status}\n' libfoo1` reads `install ok installed`.

### Reasoning

`dpkg -r --force-depends` exists precisely to let an operator bypass the one safety check dpkg normally
performs before removing a package: "does anything else installed still depend on this?" Using it doesn't
corrupt dpkg's bookkeeping for the package being removed -- that part stays perfectly consistent, which is
exactly why `dpkg --audit`/`dpkg --configure -a` (the tools for *interrupted* installs) find nothing wrong
here. The inconsistency lives one level up, in the *relationship* between two otherwise-fine package
records: one package's `Depends:` line points at something the other no longer provides. `apt-get check`
is the tool that actually looks across the whole dependency graph rather than at one package in isolation,
which is why it -- not `dpkg --audit` -- is what surfaces this class of problem. And because the failure
mode here is a broken relationship between package records, not merely a missing file, the fix has to be
"reinstall the package" (which repairs the record) rather than "restore the file" (which doesn't).
