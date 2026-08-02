## Solution

1. `sudo apt-get update` fails, and the error names the exact broken source:
   ```
   Err:2 file:/opt/legacy-mirror ./ Packages
     File not found - ./Packages (2: No such file or directory)
   ...
   E: Some index files failed to download. They have been ignored, or old ones used instead.
   ```
   (or similar -- apt reports a non-zero exit as soon as *any* configured source can't be fetched, even
   if every other source is perfectly fine).
2. Look at everywhere apt is told to look: `cat /etc/apt/sources.list` (intentionally empty -- this host
   has no real external mirrors) and `ls /etc/apt/sources.list.d/`. There are two files:
   - `internal-good.list`: `deb [trusted=yes] file:///opt/pkg-repo ./` -- the real, working internal
     mirror, baked into this image.
   - `internal-legacy.list`: `deb [trusted=yes] file:///opt/legacy-mirror ./` -- `ls /opt/legacy-mirror`
     shows it doesn't exist. This was a second internal mirror that got decommissioned; whoever retired
     it never removed the reference to it.
3. Since the legacy mirror is genuinely gone for good (not a typo pointing at a real, still-live path),
   the fix is to remove the stale entry:
   ```
   sudo rm /etc/apt/sources.list.d/internal-legacy.list
   ```
4. Confirm: `sudo apt-get update` now exits cleanly, and `apt-cache policy reportviewer` shows a real
   `Candidate:` from the internal mirror again.

### Reasoning

On a host with genuinely no internet, `apt-get update`'s failures are never a DNS timeout or a dropped
connection -- they're config problems you can fully diagnose and fix locally: a `sources.list.d` entry
left behind after a mirror was retired, a typo in a path, a missing `Release`/`Packages` file. apt treats
the whole `update` operation as failed (non-zero exit) if *any* one of its configured sources errors,
which is exactly why a single stale entry can quietly break every downstream script that chains
`apt-get update && apt-get install ...` -- even though the actually-needed mirror was never the problem.
The fix is always to read apt's own error output for the specific source it's complaining about, check
that path directly (`ls`), and either correct it or remove it if it's truly gone -- not to assume the
whole apt setup is broken.
