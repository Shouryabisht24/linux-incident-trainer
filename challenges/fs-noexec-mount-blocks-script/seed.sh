#!/bin/sh
# Build time. Sets up the stable entry point ops tooling actually calls
# (/usr/local/bin/run-migration) which just execs the real script wherever it
# currently lives. The real script itself gets written at container start
# onto /opt/deploy, which challenge.json mounts as a noexec tmpfs -- a
# deploy-tooling directory that was set up for artifact staging and locked
# down with noexec as a security default, without anyone realizing scripts
# meant to be *run* would end up staged there too.
set -eu

mkdir -p /var/lib/app
mkdir -p /opt/deploy

cat > /usr/local/bin/run-migration <<'EOF'
#!/bin/sh
exec /opt/deploy/run-migration.sh "$@"
EOF
chmod +x /usr/local/bin/run-migration
