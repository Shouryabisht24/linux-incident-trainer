#!/bin/sh
# Solved when calc-app actually runs successfully again.
set -u
OUT=$(/usr/local/bin/calc-app 2>&1)
if echo "$OUT" | grep -q "RESULT=42"; then
  echo "calc-app runs successfully"
  exit 0
fi
echo "calc-app still fails:"
echo "$OUT"
exit 1
