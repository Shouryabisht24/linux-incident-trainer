## Solution

1. `df -h /var/spool/ingest` shows free space — misleading. The failure is `No space left on device`
   anyway, so check inodes: `df -i /var/spool/ingest` → **IUse 100%**.
2. The filesystem is out of inodes: thousands of tiny leftover `.tmp` files consumed them all
   (`ls -1 /var/spool/ingest | wc -l`).
3. Delete the stale files. `rm *.tmp` may fail with *Argument list too long*, so use find:
   `sudo find /var/spool/ingest -name '*.tmp' -delete`
4. Verify: `df -i /var/spool/ingest` shows inodes free again, and creating a file works.

Lesson: a filesystem can be "full" two ways — data blocks (`df -h`) or inodes (`df -i`). Millions of tiny
files exhaust inodes long before bytes. When `df -h` says there's room but writes fail, always check `df -i`.
