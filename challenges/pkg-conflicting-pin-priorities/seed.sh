#!/bin/sh
# Runs at build time as root.
#
# auditlog-agent is distributed via a local file:// package mirror (a real
# apt repo baked into this image -- pure local disk I/O, no internet needed
# or used). 1.0-1 has a known bug; 2.0-1 fixes it and is already sitting in
# the mirror. This should be a normal upgrade.
#
# The break is two conflicting /etc/apt/preferences.d files, both still
# present from two different, uncoordinated changes:
#   - 00-incident-freeze: leftover from an old incident where 1.0-1 was
#     force-pinned at priority 1001 (a priority above 1000 means "install
#     this version even if it's a downgrade" -- it was meant to be temporary
#     and was never removed once the freeze ended).
#   - 50-auditlog-rollout: added later by whoever tried to roll out the
#     fix, pinning 2.0-1 at priority 500 -- intended to make it win, but
#     500 < 1001, so the old freeze pin silently keeps winning.
# Nothing about the mirror or the package is broken; the resolved candidate
# is just wrong because of the stale, higher-priority pin nobody remembered.
set -eu

REPO=/opt/pkg-repo
mkdir -p "$REPO"

build_pkg() {
  ver="$1"
  root="/tmp/auditlog-agent-$ver"
  rm -rf "$root"
  mkdir -p "$root/DEBIAN" "$root/usr/bin"
  cat > "$root/DEBIAN/control" <<EOF
Package: auditlog-agent
Version: $ver
Section: admin
Priority: optional
Architecture: all
Maintainer: Internal Tools <tools@example.internal>
Description: Internal audit log shipping agent
EOF
  cat > "$root/usr/bin/auditlog-agent" <<SCRIPT
#!/bin/sh
echo "auditlog-agent $ver"
SCRIPT
  chmod +x "$root/usr/bin/auditlog-agent"
  dpkg-deb --build --root-owner-group "$root" "$REPO/auditlog-agent_${ver}_all.deb"
  rm -rf "$root"
}

build_pkg "1.0-1"
build_pkg "2.0-1"

( cd "$REPO" && dpkg-scanpackages --multiversion . /dev/null > Packages 2>/dev/null && gzip -9c Packages > Packages.gz )

echo "deb [trusted=yes] file://$REPO ./" > /etc/apt/sources.list.d/pkg-repo.list

apt-get update
apt-get install -y --no-install-recommends auditlog-agent=1.0-1

mkdir -p /etc/apt/preferences.d
cat > /etc/apt/preferences.d/00-incident-freeze <<'EOF'
Package: auditlog-agent
Pin: version 1.0-1
Pin-Priority: 1001
EOF
cat > /etc/apt/preferences.d/50-auditlog-rollout <<'EOF'
Package: auditlog-agent
Pin: version 2.0-1
Pin-Priority: 500
EOF

apt-get purge -y dpkg-dev >/dev/null
apt-get autoremove -y >/dev/null
rm -rf /var/lib/apt/lists/*
