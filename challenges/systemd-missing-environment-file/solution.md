## Solution

1. `sudo systemctl status billing-worker` shows `failed`. Since `Restart=no`, it isn't crash-looping -- it
   died once, immediately, and just stayed dead. `sudo journalctl -u billing-worker -n 20 --no-pager` shows
   the app's own reason, printed to stderr before it exited: `FATAL: BILLING_API_KEY is not set -- check
   EnvironmentFile`.
2. Look at how the unit is supposed to get that variable: `sudo systemctl cat billing-worker.service` shows
   `EnvironmentFile=-/etc/billing-worker/billing-worker.env`. The leading `-` is the important detail --
   it's the "optional" marker for `EnvironmentFile=`, telling systemd to proceed silently if the file doesn't
   exist rather than failing the unit. That's exactly why nothing about the unit's own load/start ever
   looked wrong: no error, no warning, nothing in `systemctl status` about a missing file.
3. Check whether the file is actually there: `ls -l /etc/billing-worker/` -- the directory doesn't even
   exist. The deploy or secrets-management step that's supposed to write this host's environment file was
   simply never run.
4. Fix it by creating the file with the variable the app genuinely needs:
   ```
   sudo mkdir -p /etc/billing-worker
   printf 'BILLING_API_KEY=prod-key-please-rotate\n' | sudo tee /etc/billing-worker/billing-worker.env
   ```
5. `EnvironmentFile=` is only read once, when the process starts -- editing it doesn't affect an
   already-running (or already-failed) unit. Restart it: `sudo systemctl restart billing-worker`.
6. `systemctl is-active billing-worker` now reports `active`.

Lesson: the optional `-` prefix on `EnvironmentFile=` is meant for genuinely optional config overlays, but
it also means a required env file going missing produces *zero* signal at the systemd level -- the unit
loads clean and starts clean, and the only place the failure shows up is in the application's own log, one
level down. This is deliberately distinct from a bad `ExecStart=` path (systemd itself would refuse to even
try running a nonexistent binary, with a clear `status=203/EXEC`): a missing `EnvironmentFile=` lets the
process actually start and run its own logic before failing on something it needed but never got.
