#!/bin/sh
# Break: mark the already-installed "tree" package as unpacked-but-not-configured
# by editing dpkg's status database directly (NOT via apt, so the build can't be
# broken by network operations). This reproduces the "dpkg was interrupted" state.
set -eu
sed -i '/^Package: tree$/,/^$/ s/^Status: install ok installed$/Status: install ok unpacked/' /var/lib/dpkg/status
