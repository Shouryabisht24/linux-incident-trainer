## Solution

1. `/var/log` is clean, so the space isn't going to application logs. Widen the search across
   `/var`: `du -sh /var/cache/* 2>/dev/null | sort -h` shows `/var/cache/apt/archives` is by far
   the largest thing on the box.
2. `ls /var/cache/apt/archives` shows a long list of `.deb` files -- apt's local cache of every
   package it has ever downloaded, going back who knows how long. Nothing prunes this
   automatically by default.
3. This cache is disposable: apt will simply re-download a `.deb` if it's ever needed again, so
   clearing it is safe. Use apt's own tool for it: `sudo apt-get clean` (removes everything under
   `/var/cache/apt/archives`, including partial downloads).
4. Verify: `df -h /var/cache/apt/archives` shows the space back, and installs/upgrades work again.

Lesson: not every "disk full" incident is a runaway application log -- accumulated package-manager
cache is a very common, very boring, very real cause on boxes that don't get routine maintenance.
`apt-get clean` (or the gentler `apt-get autoclean`, which only removes packages that can no
longer be downloaded) is the standard, safe way to reclaim that space, rather than hand-deleting
files under `/var/cache/apt`.
