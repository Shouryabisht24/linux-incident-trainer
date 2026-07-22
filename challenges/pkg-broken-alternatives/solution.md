## Solution

1. `mytool` → `No such file or directory`. Follow the link chain:
   `ls -l $(command -v mytool)` → `/usr/local/bin/mytool -> /etc/alternatives/mytool`, and
   `ls -l /etc/alternatives/mytool` → `-> /usr/local/bin/mytool-2.0`, which isn't installed.
2. `update-alternatives --display mytool` shows only `mytool-1.0` is a real, registered option.
3. Point the alternative back at the installed version, via the tool that owns these links (so its database
   stays consistent): `sudo update-alternatives --set mytool /usr/local/bin/mytool-1.0`.
4. `mytool` runs again (`mytool v1.0 running`).

Lesson: `update-alternatives` manages a two-hop symlink chain (`/usr/bin/x -> /etc/alternatives/x -> real`).
A partial upgrade can leave `/etc/alternatives/x` aimed at a removed version. Fix it with
`update-alternatives --set` / `--config`, not a raw `ln`, so the alternatives database and the symlink agree.
