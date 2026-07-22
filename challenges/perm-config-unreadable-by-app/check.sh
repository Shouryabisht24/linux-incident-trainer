#!/bin/sh
# Tests that the billing user (the real, unprivileged actor) can read the config.
set -u
if sudo -u billing cat /etc/billing/billing.conf >/dev/null 2>&1; then
  echo "billing user can read /etc/billing/billing.conf"
  exit 0
fi
echo "billing user still cannot read /etc/billing/billing.conf"
exit 1
