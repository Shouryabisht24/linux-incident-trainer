# 0005 — Real systemd-in-Docker for the systemd category, with a fallback plan

## Decision
The "systemd & services" challenge category uses real systemd as PID 1 inside challenge containers (`CapAdd: [SYS_ADMIN]` + a cgroup mount), rather than simulating systemctl/journalctl behavior with a lightweight process supervisor.

## Why
Confirmed with the user directly (over the lightweight-supervisor alternative). Real systemd gives authentic `systemctl status`/`journalctl -u` debugging practice, which is the whole point of this category — a simulated supervisor would be easier to build but less true to real production incidents.

## Known risk
systemd-in-Docker needs elevated container privileges and can be finicky across Docker versions and cgroups v1 vs v2. This is flagged as the highest-risk technical bet in the plan.

## How to apply
Do an early smoke test of a systemd-in-Docker container in Phase 2 (before committing broadly to this category in Phase 4), using the `systemd-crashloop-bad-config` reference challenge. If it proves unreliable on this host, fall back to a lightweight process supervisor that mimics `systemctl`/`journalctl` output for this category only — do not silently degrade other categories. Record the outcome of that smoke test as a follow-up decision (e.g. `0007-systemd-smoke-test-result.md`) once it's run.
