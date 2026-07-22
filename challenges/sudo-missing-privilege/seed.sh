#!/bin/sh
# Break: the oncall user exists but has no sudo privileges at all.
set -eu
useradd -m -s /bin/bash oncall
