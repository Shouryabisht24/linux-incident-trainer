## Solution

1. Reproduce it: `logger -t telemetryd "probe"` immediately followed by `journalctl -t telemetryd` shows
   nothing at all -- not even the line just sent, in the current boot. That immediately rules out the usual
   "lost on reboot" persistence problem; something is stopping journald from retaining messages in the first
   place.
2. Check the actual merged config: `systemd-analyze cat-config systemd/journald.conf` shows a drop-in setting
   `Storage=none`.
3. **REASONING**: `Storage=` has four values, and it's easy to assume it's a simple disk-vs-memory switch --
   it isn't:
   - `persistent` -- always write to `/var/log/journal` on disk.
   - `volatile` -- keep an in-memory journal under `/run/log/journal` only; queryable during the current boot,
     gone after a reboot (this is the mechanism behind `logs-journald-not-persistent`, a different challenge).
   - `auto` -- persistent if `/var/log/journal` exists, volatile otherwise (the default).
   - `none` -- **journald stores nothing, period.** No `/run` journal, no disk journal. Messages are still
     accepted and can still be forwarded elsewhere (syslog, kmsg, console) if those are configured, but
     journald itself retains zero history -- there's nothing for `journalctl` to ever show, even one second
     after the message was sent.
   `Storage=none` is a real, legitimate setting (e.g. for a minimal container image that forwards everything
   to an external log collector and wants zero local disk/memory footprint) -- but here it was applied to a
   box where `telemetryd`'s messages are expected to be queryable locally via `journalctl`, so it's simply the
   wrong setting for what this box needs.
4. Fix it: `sudo sed -i 's/Storage=none/Storage=auto/' /etc/systemd/journald.conf.d/nostore.conf` then
   `sudo systemctl restart systemd-journald`.
5. Verify: `logger -t telemetryd "confirm"` followed immediately by `journalctl -t telemetryd` now shows the
   line.

Lesson: `Storage=none` is easy to misread as "don't persist to disk" (i.e. the same idea as `volatile`) when it
actually means "retain nothing, anywhere, ever." Always check the merged journald config
(`systemd-analyze cat-config systemd/journald.conf`) rather than guessing from the setting's name, and test
with an immediate round-trip (`logger` then `journalctl`) to tell "not persisted across reboot" apart from
"not retained at all."
