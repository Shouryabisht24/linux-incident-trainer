#!/bin/sh
# Runs at build time as root.
#
# Two real, dpkg-tracked packages, distributed via a local file:// mirror
# baked into the image (pure local disk I/O -- no internet needed or used,
# at build or runtime):
#   - libfoo1: provides a real, compiled shared library (/usr/lib/libfoo.so.1,
#     with a proper embedded SONAME) that ldconfig resolves normally.
#   - clientapp: a real gcc-compiled binary, dynamically linked against
#     libfoo, with a genuine `Depends: libfoo1` recorded in its control file.
#
# The break: someone "cleaning up unused packages" ran
#   dpkg -r --force-depends libfoo1
# --force-depends is exactly what let dpkg skip the dependency safety check
# that would otherwise have refused ("dependency problems prevent removal
# of libfoo1"), since clientapp still needs it. The removal itself succeeds
# cleanly and dpkg's bookkeeping for libfoo1 is internally consistent
# afterwards (it correctly says libfoo1 is gone) -- but clientapp's own
# recorded dependency on libfoo1 is now unsatisfied, which is exactly what
# `apt-get check` is for. This is deliberately run as a plain dpkg command
# (no download involved) rather than corrupting /var/lib/dpkg/status by
# hand, since it's the actual real-world command that produces this mess.
set -eu

REPO=/opt/pkg-repo
mkdir -p "$REPO"

# --- Build libfoo1 -----------------------------------------------------
libfoo_root=/tmp/libfoo1-pkg
rm -rf "$libfoo_root"
mkdir -p "$libfoo_root/DEBIAN" "$libfoo_root/usr/lib"
cat > "$libfoo_root/DEBIAN/control" <<EOF
Package: libfoo1
Version: 1.0-1
Section: libs
Priority: optional
Architecture: $(dpkg --print-architecture)
Maintainer: Internal Tools <tools@example.internal>
Description: Internal shared library used by clientapp
EOF
cat > /tmp/libfoo.c <<'EOF'
int foo_hello(void) { return 42; }
EOF
gcc -shared -fPIC -Wl,-soname,libfoo.so.1 -o "$libfoo_root/usr/lib/libfoo.so.1.0.0" /tmp/libfoo.c
ln -sf libfoo.so.1.0.0 "$libfoo_root/usr/lib/libfoo.so.1"
rm -f /tmp/libfoo.c
dpkg-deb --build --root-owner-group "$libfoo_root" "$REPO/libfoo1_1.0-1_$(dpkg --print-architecture).deb"
rm -rf "$libfoo_root"

# --- Build clientapp (depends on libfoo1, actually links against it) --
# Install libfoo1 first so clientapp can actually link + run at build time.
dpkg -i "$REPO/libfoo1_1.0-1_$(dpkg --print-architecture).deb"
ldconfig

client_root=/tmp/clientapp-pkg
rm -rf "$client_root"
mkdir -p "$client_root/DEBIAN" "$client_root/usr/bin"
cat > "$client_root/DEBIAN/control" <<EOF
Package: clientapp
Version: 1.0-1
Section: utils
Priority: optional
Architecture: $(dpkg --print-architecture)
Depends: libfoo1
Maintainer: Internal Tools <tools@example.internal>
Description: Internal client app linked against libfoo1
EOF
cat > /tmp/clientapp.c <<'EOF'
#include <stdio.h>
extern int foo_hello(void);
int main(void) {
    printf("RESULT=%d\n", foo_hello());
    return 0;
}
EOF
gcc -o "$client_root/usr/bin/clientapp" /tmp/clientapp.c -l:libfoo.so.1
rm -f /tmp/clientapp.c
dpkg-deb --build --root-owner-group "$client_root" "$REPO/clientapp_1.0-1_$(dpkg --print-architecture).deb"
rm -rf "$client_root"

dpkg -i "$REPO/clientapp_1.0-1_$(dpkg --print-architecture).deb"

( cd "$REPO" && dpkg-scanpackages . /dev/null > Packages 2>/dev/null && gzip -9c Packages > Packages.gz )
echo "deb [trusted=yes] file://$REPO ./" > /etc/apt/sources.list.d/pkg-repo.list
apt-get update

# Sanity check before breaking anything: clientapp must actually work here.
clientapp | grep -q RESULT=42

# The break: force-remove libfoo1 out from under clientapp. After this,
# apt-get itself will refuse ANY further operation ("Unmet dependencies")
# until the trainee fixes it -- so any of our own build-time cleanup from
# here on has to use plain dpkg, not apt-get, exactly like the real
# incident this simulates.
dpkg -r --force-depends libfoo1
ldconfig

dpkg --purge dpkg-dev >/dev/null
rm -rf /var/lib/apt/lists/*
