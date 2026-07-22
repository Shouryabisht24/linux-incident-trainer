#!/bin/sh
# Break: the ci account's login shell is /usr/sbin/nologin, so any `su - ci`
# or login-shell job prints "This account is currently not available" and exits.
set -eu
useradd -m ci
usermod -s /usr/sbin/nologin ci
