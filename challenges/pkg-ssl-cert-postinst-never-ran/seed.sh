#!/bin/sh
# Runs at build time as root.
#
# `apt-get install ssl-cert` above already ran its postinst normally, which
# calls `make-ssl-cert generate-default-snakeoil` and creates a real
# self-signed cert/key pair under /etc/ssl/{certs,private}. dpkg's database
# now correctly and durably records ssl-cert as "install ok installed" --
# that bookkeeping is exactly what a golden-image clone would carry over to
# a new host.
#
# The break: simulate the clone. A host-specific, first-boot-generated
# artifact (the actual snakeoil key/cert) does NOT travel with a cloned
# image the way dpkg's own database does -- so on a freshly cloned host, the
# files are simply absent even though dpkg is completely convinced ssl-cert
# is fully configured. This is deliberately NOT the same failure mode as
# "dpkg was interrupted" (dpkg --audit is clean here, and dpkg --configure -a
# does nothing, because as far as dpkg's own bookkeeping is concerned there
# is nothing left unconfigured) -- the fix has to re-trigger the package's
# actual generation step, not dpkg's configure step.
set -eu

rm -f /etc/ssl/private/ssl-cert-snakeoil.key /etc/ssl/certs/ssl-cert-snakeoil.pem
