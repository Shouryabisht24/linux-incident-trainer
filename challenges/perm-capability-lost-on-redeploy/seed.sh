#!/bin/sh
# Runs at build time as root. Sets up a monitoring-agent scenario:
# - "netmon" is an unprivileged, no-sudo service account that runs a small
#   latency-probe helper needing to build a raw ICMP socket -- something the
#   kernel refuses to any process, regardless of UID, unless it holds the
#   CAP_NET_RAW capability (root has it implicitly; netmon does not).
# - The sanctioned way to give ONE binary that one capability, without
#   handing netmon broader privileges (full setuid-root, or root/sudo
#   outright), is a Linux file capability applied with `setcap`: it's stored
#   as an extended attribute on that exact file's data, tied to the specific
#   inode/content, NOT to the file's path or ownership.
#
# The break: this is what a "redeploy that overwrites the binary" actually
# does under the hood -- a freshly (re)built binary is new file content, so
# even at the identical path, with identical-looking ownership and mode
# (root:root, 0755), it carries NO capability data at all unless setcap is
# re-applied after every redeploy. That's the gap this challenge bakes in:
# the binary here is never setcap'd, exactly matching the state right after
# a redeploy that forgot to reapply it.
#
# NOTE: like setuid, capabilities are also not honored on interpreted
# scripts starting with a #! shebang -- the helper has to be a real compiled
# binary (same reasoning as decisions/0016 and perm-setuid-helper-bit-stripped).
set -eu

useradd -r -s /usr/sbin/nologin netmon

cat > /tmp/icmp-probe.c <<'EOF'
#include <stdio.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main(void) {
    int fd = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
    if (fd < 0) {
        perror("icmp-probe: socket");
        return 1;
    }
    printf("PROBE_OK raw ICMP socket created\n");
    return 0;
}
EOF
gcc -O2 -o /usr/local/bin/icmp-probe /tmp/icmp-probe.c
rm -f /tmp/icmp-probe.c

chown root:root /usr/local/bin/icmp-probe
chmod 0755 /usr/local/bin/icmp-probe
# Deliberately no `setcap cap_net_raw=+ep` here -- that's the missing piece.
