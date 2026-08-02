## Solution

1. `df -h /var/cache/photoapp/thumbnails` confirms the filesystem is essentially full.
2. `ls /var/cache/photoapp/thumbnails | wc -l` shows an enormous number of files for what should be a small
   site's cache.
3. Cross-check against reality: `ls /srv/photoapp/photos/` shows only a handful of photos are actually live.
   Almost every file in the cache is a `thumb-orphan-*.jpg` -- a thumbnail for a photo that was deleted from
   the site long ago. The cache was never pruned as photos came and went, so every thumbnail ever generated is
   still sitting there.
4. There are far too many files to pass on a shell glob (`rm ...thumb-orphan-*.jpg` will likely fail with
   *Argument list too long*). Use `find` instead:
   ```
   sudo find /var/cache/photoapp/thumbnails -name 'thumb-orphan-*.jpg' -delete
   ```
5. `df -h /var/cache/photoapp/thumbnails` now shows plenty of free space.
6. Confirm the app actually works again, not just that space is free:
   ```
   photoapp-thumbnailer generate 1
   ```
   succeeds and writes a fresh thumbnail.

### Reasoning

A cache is only safe to let grow unbounded if something eventually prunes it. Nothing here ever did: thumbnails
were generated on demand and never removed when their source photo went away, so the cache silently
accumulated the full history of every photo the site had ever hosted, not just the ones still live. This is a
different failure shape from a single runaway log file (`disk-full-var-log`) -- there's no one dominant file
to truncate, just an unbounded number of small ones, which is why `find -delete` (not a shell glob, and not a
single `truncate`) is the right tool.

The durable fix, beyond this exercise, is making thumbnail generation self-cleaning: prune a cached thumbnail
whenever its source photo is deleted, or run a periodic reconciliation job that removes any cached thumbnail
whose source no longer exists -- the same "verify the fix actually works, not just that df looks better" habit
as any other disk-full scenario, since regenerating one thumbnail proves the cache is genuinely writable again.
