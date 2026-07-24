#!/bin/sh
# Solved when the etl account can actually be used again.
set -u
OUT=$(su - etl -c 'echo ETL_OK' 2>&1)
if echo "$OUT" | grep -q "ETL_OK"; then
  echo "etl account is usable again"
  exit 0
fi
echo "etl account is still blocked:"
echo "$OUT"
exit 1
