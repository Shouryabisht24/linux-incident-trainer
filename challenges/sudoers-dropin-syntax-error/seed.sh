#!/bin/sh
# Runs at build time as root.
#
# Break: someone tried to grant the "netops" service account passwordless
# sudo via a proper /etc/sudoers.d/ drop-in (the right idea), but the line
# has a typo -- a missing closing paren. sudo's parser discards the broken
# rule and logs a syntax error, so netops ends up with *no* effective grant
# at all, exactly as if nothing had ever been written for it. This is
# distinct from sudo-missing-privilege (where the user was simply never
# granted anything): here a grant genuinely exists on disk and looks right
# at a glance, it just doesn't parse. Only netops's own file is broken --
# trainee's separate grant lives directly in /etc/sudoers and is completely
# unaffected, so trainee retains working sudo throughout (confirmed: this
# sudo build does not cascade a parse error in one sudoers.d file into a
# blanket denial for every user on the box -- only the rule(s) inside the
# broken file are lost).
set -eu

useradd -m -s /bin/bash netops

cat > /etc/sudoers.d/netops <<'EOF'
netops ALL=(ALL NOPASSWD:ALL
EOF
chmod 0440 /etc/sudoers.d/netops
