#!/bin/sh
# Break: config is 600 root:root, so the unprivileged "billing" user the app
# runs as cannot read it. root can, which is why "sudo cat" misleads.
set -eu
useradd -r -s /usr/sbin/nologin billing
mkdir -p /etc/billing
printf 'db_password=s3cr3t\napi_key=abc123\n' > /etc/billing/billing.conf
chown root:root /etc/billing/billing.conf
chmod 600 /etc/billing/billing.conf
