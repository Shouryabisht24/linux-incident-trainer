## Solution

1. `top` (press `1` for the per-core view) shows one CPU core pegged at 100% while the rest of the box's
   cores sit idle -- and `render-worker` is still only crawling despite that. A single busy process on an
   otherwise-idle multi-core box that still can't get enough CPU is the classic signature of a *CPU affinity*
   problem, not a quota or priority one: the process isn't allowed to use the cores that are actually free.
2. Find render-worker's PID (`cat /var/run/render-worker/render-worker.pid`) and check its allowed CPU set:
   `taskset -p <pid>` prints its affinity mask. Then check whatever process `top` shows saturating that one
   busy core (`taskset -p <that-pid>`) -- they report the *same* mask.
3. render-worker's pin comes from its own config: `/etc/render-worker/render-worker.conf` sets
   `PINNED_CORE=0`, a leftover from an old cache-locality tuning pass, applied via `taskset -c` in its
   control script (`/usr/local/bin/svc-ctl`) at every start. Meanwhile `batch-encoder` -- a separate,
   legitimate workload, not something this challenge asks you to change -- is *also* permanently pinned to
   core 0 by its own launcher, and fully saturates it. render-worker was never meant to fight over that
   specific core; it just needs to run somewhere that's actually free, and this box has plenty of spare
   capacity (2 vCPUs of quota) elsewhere.
4. Fix: edit the config and clear the pin --
   `sudo sed -i 's/PINNED_CORE=0/PINNED_CORE=/' /etc/render-worker/render-worker.conf`, then
   `sudo svc-ctl restart`. With no `PINNED_CORE` set, the control script starts render-worker without
   `taskset` at all, and the kernel's own scheduler places it on whichever core is actually idle.
   (A live, no-restart fix also works to prove the diagnosis: `sudo taskset -pc 1 <pid>` re-pins a *running*
   process's affinity immediately, without needing to relaunch it -- useful for confirming the theory before
   committing to the config edit.)
5. Verify: `taskset -p <new-pid>` now shows the full CPU mask (or whichever core you moved it to, distinct
   from `batch-encoder`'s), and its throughput recovers -- measured here as CPU time actually consumed:
   wedged on the contended core it was managing only about half a core's worth of ticks per second; freed
   from it, it saturates close to a full core, since it's no longer splitting the one core it was stuck on
   with `batch-encoder`.

Lesson: overall CPU quota and idle cores don't help a process that's been pinned (via `taskset`, or
inherited from a container's `--cpuset-cpus`) onto the one core something else already owns -- `top`'s
per-core view plus `taskset -p` on both the starved process and whatever's hogging its assigned core is the
fast way to tell "CPU affinity conflict" apart from "not enough quota" or "wrong priority." The fix is almost
always to stop needlessly constraining affinity, not to fight harder for the same core.
