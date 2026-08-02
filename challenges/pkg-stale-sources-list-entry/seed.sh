#!/bin/sh
# Runs at build time as root.
#
# This host has no real internet -- its /etc/apt/sources.list is stripped
# down to nothing, and the only real mirror it ever talks to is a local
# file:// repo baked right into the image (pure local disk I/O, no network
# syscalls, so this all genuinely works with no internet at runtime).
#
# The break: a second sources.list.d entry, for a "legacy" internal mirror
# that was decommissioned last quarter, was never removed. It points at a
# path that simply doesn't exist on this filesystem. `apt-get update`
# processes every configured source and fails as soon as it can't fetch
# that one -- which, since apt treats any source failure as an overall
# non-zero exit, breaks every "apt-get update && ..." one-liner on the box,
# even though the still-healthy internal mirror is sitting right there.
set -eu

REPO=/opt/pkg-repo
mkdir -p "$REPO"

root=/tmp/reportviewer-pkg
rm -rf "$root"
mkdir -p "$root/DEBIAN" "$root/usr/bin"
cat > "$root/DEBIAN/control" <<EOF
Package: reportviewer
Version: 1.0-1
Section: utils
Priority: optional
Architecture: all
Maintainer: Internal Tools <tools@example.internal>
Description: Internal report viewer CLI
EOF
cat > "$root/usr/bin/reportviewer" <<'EOF'
#!/bin/sh
echo "reportviewer 1.0"
EOF
chmod +x "$root/usr/bin/reportviewer"
dpkg-deb --build --root-owner-group "$root" "$REPO/reportviewer_1.0-1_all.deb"
rm -rf "$root"

( cd "$REPO" && dpkg-scanpackages . /dev/null > Packages 2>/dev/null && gzip -9c Packages > Packages.gz )

# Baseline for this offline host: no real external mirrors at all. Modern
# debian:12-slim ships its default mirror as a deb822 sources.list.d entry
# (not the classic /etc/apt/sources.list), so that's what has to go.
rm -f /etc/apt/sources.list.d/debian.sources
echo "# no external mirrors on this host -- internal-only, see sources.list.d/" > /etc/apt/sources.list

echo "deb [trusted=yes] file://$REPO ./" > /etc/apt/sources.list.d/internal-good.list

# Sanity-check the good mirror works at build time (must succeed, or the
# build itself would fail here).
apt-get update

# The actual break, added after that sanity check so it can't ever break the
# build: a stale reference to a legacy mirror path that doesn't exist.
echo "deb [trusted=yes] file:///opt/legacy-mirror ./" > /etc/apt/sources.list.d/internal-legacy.list

apt-get purge -y dpkg-dev >/dev/null
apt-get autoremove -y >/dev/null
rm -rf /var/lib/apt/lists/*
