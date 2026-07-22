# 0010 — systemd-in-Docker confirmed working; real systemd chosen over the fallback

## Decision
The "systemd & services" category uses **real systemd-in-Docker**, as originally hoped in `decisions/0005`,
not the lightweight supervisor fallback. `createSessionContainer` in `docker.service.ts` gained a
`requires_systemd` branch that adds `CapAdd: ["SYS_ADMIN"]`, `Binds: ["/sys/fs/cgroup:/sys/fs/cgroup:rw"]`,
and tmpfs `/run` + `/run/lock`. systemd challenge images set `CMD ["/sbin/init"]` (via the shared
Dockerfile helper) and enable units offline by symlinking into `multi-user.target.wants/` in `seed.sh`
(you can't `systemctl enable` at build time — there's no running systemd/bus).

## Why
Decision 0005 flagged real systemd as the highest-risk technical bet and kept a fallback in reserve. A smoke
test on the target environment (Docker 29.x, Docker Desktop) settled it: `systemctl is-system-running`
reports `running`, services start/stop, `journalctl -u` works, and `status=203/EXEC` / masked-unit / crash-loop
behaviors all reproduce authentically. Three systemd challenges were then built and each passed the full
verify loop (break real before fix, `systemctl`/`journalctl`-driven fix, check passes) against the real
platform via the API + container lifecycle. So the fallback wasn't needed and would have taught less realistic
skills (`journalctl`, `daemon-reload`, unit states are the point of the category).

The cgroup bind mount is the one sanctioned exception to `decisions/0002` (no bind mounts): it mounts the
cgroup **pseudo-filesystem**, not host user data, and is required for systemd's cgroup management. It's called
out in the README as the least-locked-down challenge category (SYS_ADMIN is a broad capability), still confined
to a resource-limited, network-isolated container.

## How to apply
For a systemd challenge: set `"requires_systemd": true`, build the image with `CMD ["/sbin/init"]`, install
`systemd systemd-sysv`, strip container-hostile units (getty/udev/firstboot) in the Dockerfile, and in
`seed.sh` write the unit + create the `*.target.wants/` symlink to enable it. Give it ~5–6s to boot before
the first check. Budget a bit more memory (256MB) than the plain challenges.
