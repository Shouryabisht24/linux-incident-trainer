#!/bin/sh
# Solved when a valid, matching snakeoil key/cert pair exists with the
# ownership the package's own maintainer script sets up (not just any
# self-signed pair dropped in by hand).
set -u
KEY=/etc/ssl/private/ssl-cert-snakeoil.key
CERT=/etc/ssl/certs/ssl-cert-snakeoil.pem

[ -s "$KEY" ] || { echo "snakeoil key missing or empty: $KEY"; exit 1; }
[ -s "$CERT" ] || { echo "snakeoil cert missing or empty: $CERT"; exit 1; }

openssl x509 -noout -in "$CERT" 2>/dev/null || { echo "cert does not parse as a valid x509 cert"; exit 1; }
openssl rsa -noout -in "$KEY" 2>/dev/null || { echo "key does not parse as a valid RSA key"; exit 1; }

km=$(openssl rsa -noout -modulus -in "$KEY" 2>/dev/null)
cm=$(openssl x509 -noout -modulus -in "$CERT" 2>/dev/null)
if [ -z "$km" ] || [ "$km" != "$cm" ]; then
  echo "key and cert do not match (modulus mismatch)"
  exit 1
fi

group=$(stat -c '%G' "$KEY" 2>/dev/null)
if [ "$group" != "ssl-cert" ]; then
  echo "key group ownership is '$group', expected 'ssl-cert' (the package's own postinst sets this)"
  exit 1
fi

echo "snakeoil key/cert pair present, valid, matching, and correctly owned"
exit 0
