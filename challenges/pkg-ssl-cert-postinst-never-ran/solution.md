## Solution

1. `dpkg -s ssl-cert` reports `Status: install ok installed`, and `sudo dpkg --audit` is silent -- dpkg's
   own bookkeeping is completely clean. This immediately rules out the "interrupted dpkg" failure mode
   (that's a different, already-covered challenge): there is nothing left in dpkg's configure queue, so
   `sudo dpkg --configure -a` does nothing here.
2. The actual problem is that the certificate/key pair the package is supposed to provide simply isn't on
   disk: `ls -la /etc/ssl/private/ | grep snakeoil` and `ls -la /etc/ssl/certs/ | grep snakeoil` both come
   up empty.
3. `ssl-cert`'s postinst doesn't write these files inline -- it shells out to a helper command.
   `dpkg -L ssl-cert | grep bin` reveals `/usr/sbin/make-ssl-cert`.
4. Re-trigger the package's own setup step, rather than generating a cert by hand with raw `openssl req`:
   ```
   sudo dpkg-reconfigure ssl-cert
   ```
   This re-runs ssl-cert's postinst, which in turn calls
   `make-ssl-cert generate-default-snakeoil --force-overwrite`, recreating both files with the exact
   ownership and permissions (`root:ssl-cert`, key mode `0640`) the package expects downstream services to
   rely on. If debconf declines to re-trigger it in a given environment, calling the helper directly
   (`sudo make-ssl-cert generate-default-snakeoil --force-overwrite`) does the same thing.
5. Verify: both files exist, `openssl x509 -noout -in ...` / `openssl rsa -noout -in ...` parse cleanly,
   their moduli match (a genuine pair), and the key's group is `ssl-cert`.

### Reasoning

Cloning a VM or container image copies dpkg's status database byte-for-byte, but dpkg's database only
records that a package's postinst *ran* -- it says nothing about host-specific side effects that postinst
produced along the way (a generated cert, a machine ID, host SSH keys, and similar per-host artifacts all
fall in this category). A cloned host can be in a state dpkg considers perfectly configured while the
actual generated artifact from the *original* host's first boot is simply absent. The fix is never
`dpkg --configure -a` here (there's nothing left in dpkg's own queue to configure) -- it's finding and
re-running whatever generation step the package's maintainer scripts actually call, so the result matches
exactly what the package would have produced on a genuine first boot (right file, right owner, right
permissions), instead of a hand-rolled substitute that merely "looks like" a cert.
