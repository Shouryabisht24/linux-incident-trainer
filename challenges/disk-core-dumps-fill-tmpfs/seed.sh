#!/bin/sh
# Runs at build time as root.
#
# Break: render-worker is a tiny binary that reliably segfaults shortly after
# starting (a real crash, real SIGSEGV -- not simulated). Its supervisor
# wrapper (/usr/local/bin/worker-supervisor) sets `ulimit -c unlimited`
# before every run, which was reasonable for one-off debugging but was never
# turned back off. Each crash writes a real kernel core dump (default
# core_pattern of a bare "core" filename, dumped into the process's cwd) into
# a fresh subdirectory of /var/crash. The fill itself happens at container
# start (see Dockerfile CMD) against the size-bounded tmpfs mounted at
# /var/crash -- tmpfs is empty at container start, so nothing to bake in here.
set -eu

cat > /tmp/render-worker.c <<'EOF'
#include <stdio.h>

int main(void) {
    /* Pretend to do a little work first, like a real job would. */
    printf("render-worker: starting job\n");
    fflush(stdout);

    /* Then hit a real null-pointer dereference. This is a genuine crash --
     * the kernel delivers a real SIGSEGV and, with core dumping enabled,
     * writes a real ELF core file. */
    int *p = 0;
    *p = 1;
    return 0;
}
EOF
gcc -O2 -o /usr/local/bin/render-worker /tmp/render-worker.c
rm -f /tmp/render-worker.c

cat > /usr/local/bin/worker-supervisor <<'EOF'
#!/bin/bash
# Runs render-worker once, in its own scratch directory under /var/crash.
#
# BUG: core dumping is left fully unlimited for a binary that crashes on
# essentially every run. Whoever added this during an investigation never
# capped it back down, so every crash leaves a multi-hundred-KB core file
# behind, forever, in a directory nothing ever cleans up.
set -u
ulimit -c unlimited
run_dir="/var/crash/run-$$-$(date +%s%N)"
mkdir -p "$run_dir"
cd "$run_dir" || exit 1
/usr/local/bin/render-worker
exit 0
EOF
chmod +x /usr/local/bin/worker-supervisor
