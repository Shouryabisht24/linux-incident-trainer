#!/bin/sh
# Runs at build time as root. Sets up an ETL export scenario:
# - "etl" is the unprivileged, no-sudo automated service account that reads
#   this export file every night.
# - The plain owner/group/other permission bits are deliberately left
#   completely permissive (0644, world-readable) -- that's not the break.
# - The break is a POSIX ACL named-user entry: `setfacl -m u:etl:---` on the
#   file. A named-user ACL entry always takes precedence over the group/other
#   bits for that specific UID, regardless of how permissive those bits are
#   -- this is exactly how someone can "lock one specific account out" of a
#   file without touching its normal permission bits at all, which is why
#   `ls -l` alone tells an incomplete story here. Root ignores this (and DAC
#   entirely) -- the break only bites the real, unprivileged "etl" process,
#   which is what check.sh actually exercises.
#
# NOTE: the `setfacl` call itself is deliberately NOT run here. Empirically
# verified (see decisions/0041): a POSIX ACL applied at image build time does
# not survive Docker's image layer export/import -- `getfacl` shows it inside
# the same build's later RUN steps, but a fresh container started from the
# finished image shows no ACL at all. Same class of gotcha as "tmpfs is empty
# at container start" -- the fix is the same shape: apply it at container
# start (Dockerfile CMD) instead of at build time.
set -eu

useradd -r -s /usr/sbin/nologin etl

mkdir -p /var/data/exports
chown root:root /var/data/exports
chmod 0755 /var/data/exports

cat > /var/data/exports/customer_export.csv <<'EOF'
customer_id,name,plan
1001,Acme Corp,enterprise
1002,Globex,pro
EXPORT_MARKER_OK
EOF
chown root:root /var/data/exports/customer_export.csv
chmod 0644 /var/data/exports/customer_export.csv

# The ACL deny itself is applied in the Dockerfile's CMD at container start,
# not here -- see NOTE above.
