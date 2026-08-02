#!/bin/sh
# Runs at build time as root.
#
# widget-cli is an internal CLI tool distributed via a local package mirror --
# a real file:// apt repo baked into this image, so apt-get/apt-mark/apt-cache
# all work for real here without any actual internet access (file:// is pure
# local disk I/O, no network syscalls involved).
#
# Ops shipped 2.0-1 to the mirror because the monitoring stack now calls
# `widget-cli --health` as a liveness probe -- a subcommand that doesn't exist
# in 1.0-1. Before that rollout finished, someone `apt-mark hold`'d widget-cli
# during an unrelated incident freeze and never lifted it. So even though
# 2.0-1 sits right there in the mirror, `apt-get upgrade`/`install --only-upgrade`
# silently keeps it back -- nothing about the mirror or the package itself is
# broken, the hold is just invisible unless you go looking for it.
set -eu

REPO=/opt/pkg-repo
mkdir -p "$REPO"

build_pkg() {
  ver="$1"
  health_body="$2"
  root="/tmp/widget-cli-$ver"
  rm -rf "$root"
  mkdir -p "$root/DEBIAN" "$root/usr/bin"
  cat > "$root/DEBIAN/control" <<EOF
Package: widget-cli
Version: $ver
Section: utils
Priority: optional
Architecture: all
Maintainer: Internal Tools <tools@example.internal>
Description: Widget CLI internal tool
EOF
  cat > "$root/usr/bin/widget-cli" <<SCRIPT
#!/bin/sh
if [ "\${1:-}" = "--health" ]; then
  $health_body
else
  echo "widget-cli $ver"
fi
SCRIPT
  chmod +x "$root/usr/bin/widget-cli"
  dpkg-deb --build --root-owner-group "$root" "$REPO/widget-cli_${ver}_all.deb"
  rm -rf "$root"
}

build_pkg "1.0-1" 'echo "unknown option: --health" >&2; exit 1'
build_pkg "2.0-1" 'echo OK; exit 0'

( cd "$REPO" && dpkg-scanpackages --multiversion . /dev/null > Packages 2>/dev/null && gzip -9c Packages > Packages.gz )

echo "deb [trusted=yes] file://$REPO ./" > /etc/apt/sources.list.d/pkg-repo.list

apt-get update
apt-get install -y --no-install-recommends widget-cli=1.0-1
apt-mark hold widget-cli

apt-get purge -y dpkg-dev >/dev/null
apt-get autoremove -y >/dev/null
rm -rf /var/lib/apt/lists/*
