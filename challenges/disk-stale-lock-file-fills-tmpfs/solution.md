## Solution

1. `brokerctl start` refuses immediately: `only 2MB free in /var/lib/eventqueue and a WAL reservation
   (/var/lib/eventqueue/wal.reserved) is already present; assuming another instance is still using it`.
2. Check whether that's actually true: `pgrep -af eventqueue-worker` returns nothing -- no broker process
   exists anywhere on the box. The reservation is a leftover, not a live claim.
3. `ls -lh /var/lib/eventqueue` shows a single ~13MB `wal.reserved` file eating almost the entire 16MB tmpfs.
   It was written by a previous broker instance that lost power before it could release (or clean up) its
   write-ahead-log reservation.
4. Since nothing holds it, remove the stale reservation:
   ```
   sudo rm /var/lib/eventqueue/wal.reserved
   ```
5. `df -h /var/lib/eventqueue` now shows plenty of free space. Start the broker: `brokerctl start`. It writes
   its own fresh reservation and launches successfully this time.
6. Confirm: `pgrep -af eventqueue-worker` shows it running, and `df -h /var/lib/eventqueue` still shows healthy
   free space (the reservation this run creates is well within the safe threshold).

### Reasoning

Pre-reserving disk space up front (rather than discovering `ENOSPC` mid-write) is a legitimate pattern for
anything that must never fail partway through a write -- but it creates a real hazard: the reservation is a
*file on disk*, and files outlive the process that created them. An ungraceful shutdown (power loss, `kill -9`,
OOM kill) leaves the reservation behind with nothing actually holding it, and a startup check that only asks
"does the reservation file exist and is space low?" can't tell a stale leftover from a live claim.

The fix a trainee has to reach for is the same move as diagnosing a stale PID file: verify the *thing the
file claims to represent* is actually alive (here, a running broker process) before trusting the file's mere
existence. The durable version of this fix, beyond this exercise, is a start script that checks liveness
itself (e.g. an `flock` held on the reservation file for the process's entire lifetime, so the OS releases the
lock automatically the instant the holding process dies) instead of trusting a file's presence as a proxy for
"someone is using this."
