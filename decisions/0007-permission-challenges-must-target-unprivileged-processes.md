# 0007 — Permission-based challenges must break something an unprivileged process touches

## Decision
When designing a "permissions & ownership" challenge, the broken file/directory permissions must block a process that actually runs as an **unprivileged** user — never a root-privileged startup path. Breaking permissions on something only root ever touches (e.g. a config file read by a service's root-owned master/startup process) is not a real barrier, because root bypasses Linux DAC permission checks entirely.

## Why
The first version of `perm-config-blocks-service` broke `/etc/nginx/nginx.conf` (`chmod 000`), intending to block nginx from starting. Live end-to-end testing (not just reading the code) caught that `sudo service nginx start` succeeded anyway — nginx's *master* process runs as root to bind port 80 and read its config, and root ignores file permission bits, so the "break" did nothing. The challenge was fixed by instead breaking `/var/www/html` (nginx's document root), which nginx's *worker* processes — which drop privileges to `www-data` specifically to serve untrusted/user-facing content — genuinely cannot read. That produced a real, unbypassable 403 until correctly fixed.

This is a general pattern worth remembering for every future permissions/ownership challenge (6 total, 5 more to author in Phase 4): identify which specific process actually enforces the permission you're breaking, and confirm it doesn't run as root before shipping the challenge. Most daemons that bind privileged ports (nginx, apache, sshd) start as root and then drop privileges for their worker/connection-handling processes — that's where permission bugs are real; their root-owned startup path is not.

## How to apply
For every new permissions-category challenge in Phase 4: before finalizing, actually start the broken service as root/sudo (as a real trainee would) and confirm the break still manifests. Don't assume a `chmod`/`chown` on a config or binary blocks anything without checking which UID actually reads it at the point that matters.
