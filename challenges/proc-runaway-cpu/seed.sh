#!/bin/sh
# The runaway: a "report-generator" stuck in a busy loop, burning the CPU.
set -eu
cat > /usr/local/bin/report-generator <<'EOF'
#!/bin/sh
# stuck retry loop that never sleeps
while true; do
  :
done
EOF
chmod +x /usr/local/bin/report-generator
