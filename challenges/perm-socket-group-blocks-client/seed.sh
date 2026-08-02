#!/bin/sh
# Runs at build time as root. Sets up a stats-daemon scenario:
# - "metricsd" is the unprivileged, no-sudo account the stats daemon itself
#   runs as. It's healthy; nothing is wrong with the daemon's own process.
# - "collector" is a SEPARATE unprivileged, no-sudo service account that's
#   supposed to poll the daemon's local control socket. It's correctly
#   provisioned as a member of "metrics-clients", the shared group meant to
#   gate access to that socket.
# - The break: connect() to a Unix domain socket is gated by ordinary DAC
#   permission checks on the socket's own filesystem path, exactly like a
#   regular file. The daemon's run directory, /run/metricsd, was created
#   without the setgid bit and without "metrics-clients" group ownership --
#   just a plain directory owned by the daemon's own account. Every time the
#   daemon (re)creates its socket there, the fresh socket inherits the
#   *creating process's own* primary group ("metricsd"), not the shared
#   client group -- so "collector", though correctly a member of
#   "metrics-clients", never actually has access to any socket the daemon
#   creates. Root ignores this and always could connect -- the real,
#   unprivileged "collector" process cannot, which is what check.sh actually
#   exercises.
# - The fix targets the *directory*, not the transient socket file: applying
#   setgid + the shared group there makes every subsequently-created socket
#   automatically inherit "metrics-clients" as its group, regardless of which
#   account's process creates it (verified empirically -- see decisions/0041).
#
# NOTE: the socket file itself is a runtime-only object -- it doesn't exist
# yet at build time, and there's nothing meaningful to bake into the image
# for it (same rule as tmpfs being empty at container start). The daemon
# that creates it is started fresh in the Dockerfile's CMD.
set -eu

groupadd metrics-clients
useradd -r -s /usr/sbin/nologin metricsd
useradd -r -s /usr/sbin/nologin -G metrics-clients collector

mkdir -p /run/metricsd
chown metricsd:metricsd /run/metricsd
chmod 0755 /run/metricsd

cat > /usr/local/bin/metricsd-daemon.sh <<'EOF'
#!/bin/sh
# Minimal stand-in for a real stats daemon: accepts one client at a time on
# its Unix domain control socket and replies with a fixed line, in a loop.
# umask 007 -> freshly bound sockets are mode 0770 (rwxrwx---): full access
# for the socket's own group, none for "other" -- so group membership is
# what actually decides who can connect, which is exactly what this
# challenge is about.
umask 007
SOCK=/run/metricsd/metricsd.sock
rm -f "$SOCK"
while true; do
  printf 'METRICSD_HELLO\n' | nc -lU "$SOCK"
done
EOF
chmod +x /usr/local/bin/metricsd-daemon.sh

touch /var/log/metricsd.log
chown metricsd:metricsd /var/log/metricsd.log
