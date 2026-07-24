#!/bin/sh
# Runs at build time as root.
#
# calc-app is a small internal tool dynamically linked against libcalc, a
# locally-built shared library (not from a Debian package, deliberately, so
# this doesn't depend on any real network install at build time). It's
# versioned the standard way: the real file (libcalc.so.1.0.0) is what
# actually gets loaded, found via its embedded SONAME (libcalc.so.1) once
# ldconfig has scanned it into the linker cache; a separate unversioned dev
# symlink (libcalc.so) is only used when compiling new programs against it,
# never at runtime.
#
# Break: someone "cleaning up old library versions" deleted the real library
# file outright, thinking it was an unused leftover, then ran ldconfig -- so
# the linker cache now correctly (and unhelpfully) agrees the library is
# gone. It isn't recoverable by just recreating a symlink this time: the
# actual file is gone. Nightly backups of /usr/local/lib exist precisely for
# this kind of mistake.
set -eu

mkdir -p /usr/local/lib /var/backups/local-lib

cat > /tmp/libcalc.c <<'EOF'
int calc_double(int x) { return x * 2; }
EOF
gcc -shared -fPIC -Wl,-soname,libcalc.so.1 -o /usr/local/lib/libcalc.so.1.0.0 /tmp/libcalc.c
ln -sf libcalc.so.1.0.0 /usr/local/lib/libcalc.so.1
ln -sf libcalc.so.1 /usr/local/lib/libcalc.so
rm -f /tmp/libcalc.c

# A backup of the library, taken before the accidental deletion below.
cp /usr/local/lib/libcalc.so.1.0.0 /var/backups/local-lib/libcalc.so.1.0.0

mkdir -p /etc/ld.so.conf.d
echo "/usr/local/lib" > /etc/ld.so.conf.d/local.conf
ldconfig

cat > /tmp/calc-app.c <<'EOF'
#include <stdio.h>
extern int calc_double(int x);
int main(void) {
    printf("RESULT=%d\n", calc_double(21));
    return 0;
}
EOF
gcc -o /usr/local/bin/calc-app /tmp/calc-app.c -L/usr/local/lib -lcalc
rm -f /tmp/calc-app.c

# The break: the real library file (not just a symlink to it) is gone.
# ldconfig derives its SONAME -> file mapping by scanning the actual files
# for their embedded SONAME, not from filesystem symlink conventions -- so
# once the real file is deleted, no amount of recreating symlinks alone can
# fix this; refreshing the cache afterwards makes it accurately reflect that
# the library is genuinely missing.
rm -f /usr/local/lib/libcalc.so.1.0.0 /usr/local/lib/libcalc.so.1
ldconfig
