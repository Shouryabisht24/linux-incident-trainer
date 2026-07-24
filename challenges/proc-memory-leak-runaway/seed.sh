#!/bin/sh
# The runaway: a "cache-warmer" process that allocates memory and never frees
# it, ~2MB/sec. The container's memory limit is deliberately tight (see
# challenge.json resource_limits) so left alone this genuinely runs the box
# out of memory over a couple of minutes -- that's the point, not incidental.
set -eu

cat > /tmp/cache-warmer.c <<'EOF'
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(void) {
    for (;;) {
        void *block = malloc(1024 * 1024); /* 1MB */
        if (block) {
            memset(block, 1, 1024 * 1024); /* touch pages so they're really committed */
        }
        /* deliberately never freed -- that's the leak */
        usleep(500000); /* ~2MB/sec */
    }
    return 0;
}
EOF
gcc -O2 -o /usr/local/bin/cache-warmer /tmp/cache-warmer.c
rm -f /tmp/cache-warmer.c
chmod +x /usr/local/bin/cache-warmer
