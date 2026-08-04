## Solution

1. `systemctl is-active metrics-agent` reports `inactive` -- notably not `failed`. Trying
   `sudo systemctl start metrics-agent` "succeeds" (exit 0) but the agent still isn't running afterward.
   That combination -- a start that reports success but produces nothing -- is the signature of a systemd
   Condition, not a crash. `sudo systemctl status metrics-agent` confirms it: a `Condition:` block reading
   something like `ConditionPathExists=/etc/metrics-agent/enabled was not met`.
2. A `Condition*=` directive in a unit's `[Unit]` section is a start-time gate: if the condition is false,
   systemd doesn't attempt to start the unit at all, and -- critically -- it does **not** count that as a
   failure. The unit just stays `inactive`, silently, forever, on every subsequent boot and every manual
   start attempt. This is deliberately different from `systemd-masked-service`: masking is an explicit admin
   action and shows up unambiguously as `Loaded: masked`; a failed Condition shows up as a perfectly normal
   `Loaded: loaded`, `Active: inactive (dead)`, with only that one `Condition:` line as the tell.
3. See exactly what's being required: `sudo systemctl cat metrics-agent.service` shows
   `ConditionPathExists=/etc/metrics-agent/enabled` in the `[Unit]` section -- a real, common pattern for
   gating a service's rollout per-host via a flag file that config management is supposed to drop during
   provisioning.
4. Check whether that path exists: `ls -l /etc/metrics-agent/` -- it doesn't. The directory was never
   created, meaning the provisioning step that's supposed to enable this host for the rollout never ran.
5. Fix it by creating what provisioning was supposed to leave behind, then starting the service:
   ```
   sudo mkdir -p /etc/metrics-agent
   sudo touch /etc/metrics-agent/enabled
   sudo systemctl start metrics-agent
   ```
6. `systemctl is-active metrics-agent` now reports `active`.

Lesson: `systemctl start` returning success and `is-active` reporting anything other than `failed` doesn't
mean a unit is fine -- it can mean systemd never even attempted to start it. A `Condition*=` failure is
silent by design (it's meant for legitimate "don't run this here" cases, like a unit that should only run on
hosts with a certain mount or feature flag present), so it never surfaces as an alarm the way a real failure
does. `systemctl status` is still the right first move, but you have to actually read the `Condition:` line,
not just the `Active:` line, to catch this class of bug.
