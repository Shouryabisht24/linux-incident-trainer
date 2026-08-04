## Solution

1. Rule out the failure modes this looks like it *could* be: `top` shows `event-shipper` at ~0% CPU (not
   `proc-runaway-cpu`'s busy loop), and `ps aux | grep event-shipper` shows it as a normal, live process, not
   `<defunct>` (not `proc-zombie-process-leak`'s kind of problem either). It's genuinely alive and genuinely
   idle -- a real hang, not a symptom this repo's other process challenges already cover.
2. Look at exactly what it's asleep inside: get its PID (`cat /var/run/telemetry/event-shipper.pid`), then
   `cat /proc/<pid>/status | grep State` (interruptible sleep, `S`) and, more usefully,
   `cat /proc/<pid>/wchan` -- the actual kernel function it's parked in. It reads `wait_for_partner`: the
   kernel's name for a process blocked opening one end of a named pipe (FIFO) while nothing has opened the
   other end yet.
3. Find the pipe it's stuck on: `/run/app.pipe`. `event-shipper`'s own source (`cat
   /usr/local/bin/event-shipper`) shows it opens that FIFO for *writing* (`exec 3>/run/app.pipe`) as the very
   first thing it does. Opening a FIFO write-only is expected, standard behavior to block in the kernel until
   some other process opens it for *reading* -- this isn't a bug in `event-shipper`, it's just how named
   pipes work.
4. So: what's supposed to read from that pipe? `log-collector` is. It's started by the same control script as
   `event-shipper` (`/usr/local/bin/svc-ctl`), which reads which services to start from
   `/etc/telemetry/services.conf`. That file only lists `SERVICES="event-shipper"` -- `log-collector` was
   dropped from it, so it never starts, and the pipe's read end never opens.
5. Fix the config and start the missing reader:
   `sudo sed -i 's/SERVICES="event-shipper"/SERVICES="event-shipper log-collector"/' /etc/telemetry/services.conf`
   then `sudo svc-ctl start log-collector`.
6. `event-shipper` itself needs **no restart at all** -- the moment `log-collector` opens the pipe for
   reading, `event-shipper`'s already-blocked `open()` call returns immediately and it starts writing.
   Verify: `cat /proc/<event-shipper-pid>/wchan` now shows something like `do_wait` /`hrtimer_nanosleep`
   (it's back in its normal `sleep 2` cycle, not stuck), and `/var/log/telemetry/events.log` is visibly
   growing.

Lesson: a process that's alive, using no CPU, and not a zombie is still very possibly *completely stuck* --
`ps`/`top` alone can't distinguish "genuinely blocked forever" from "idling as designed" (e.g. `sleep
infinity`). `/proc/<pid>/status`'s `State` field plus `/proc/<pid>/wchan` (what kernel function it's
actually parked in) is the fast, precise way to tell them apart, and often names the exact resource it's
waiting on. And when the block is a classic IPC handshake (a FIFO here; the same idea applies to sockets
waiting on `accept()`/`connect()`, or a lock file another process holds), the fix is frequently on the *other
side* of the handshake, not the stuck process itself.
