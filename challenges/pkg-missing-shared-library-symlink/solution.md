## Solution

1. The error `libcalc.so.1: cannot open shared object file` names a specific library the dynamic
   linker couldn't find. Check what's actually on disk: `ls -la /usr/local/lib/ | grep calc`
   shows nothing at all -- unlike a simpler "missing symlink" situation, the real library file
   itself is genuinely gone this time.
2. A missing real file can't be fixed by relinking anything -- it has to come from somewhere else.
   Check for backups: `ls /var/backups/local-lib/` shows a copy of the library was backed up
   before whatever deleted it.
3. Restore the real file, keeping its correct versioned filename:
   `sudo cp /var/backups/local-lib/libcalc.so.1.0.0 /usr/local/lib/libcalc.so.1.0.0`.
4. Recreate the SONAME symlink the dynamic linker actually looks for at runtime (the version
   embedded in the library at link time, `libcalc.so.1`, not the fully-versioned filename):
   `sudo ln -sf libcalc.so.1.0.0 /usr/local/lib/libcalc.so.1`.
5. The dynamic linker doesn't scan library directories live -- it consults a prebuilt cache
   (`/etc/ld.so.cache`), derived by `ldconfig` reading each library file's own embedded SONAME.
   Refresh it: `sudo ldconfig`.
6. Verify: `calc-app` now runs and prints `RESULT=42`.

Lesson: `ldconfig` builds its cache by reading the SONAME embedded *inside* each shared library
file it finds, not by trusting filenames or symlinks -- so a missing real file can't be patched
over with a clever symlink the way a missing symlink-to-an-intact-file sometimes can. Always
confirm whether the actual data is gone or just a pointer to it before reaching for backups; when
it really is the data, restoring it (filename and version intact) followed by `ldconfig` is the
only path back.
