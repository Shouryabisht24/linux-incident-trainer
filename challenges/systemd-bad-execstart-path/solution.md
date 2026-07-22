## Solution

1. `systemctl status apiserver` → `status=203/EXEC`: systemd couldn't exec the program named in `ExecStart`.
2. `systemctl cat apiserver` shows `ExecStart=/usr/local/sbin/apiserver`, but `ls -l /usr/local/sbin/apiserver`
   says it doesn't exist. The binary is actually at `/usr/local/bin/apiserver` (`command -v apiserver`).
3. Fix the path in the unit — edit `/etc/systemd/system/apiserver.service` so
   `ExecStart=/usr/local/bin/apiserver`.
4. Because the **unit file** changed, reload the manager then restart:
   `sudo systemctl daemon-reload && sudo systemctl restart apiserver`.
5. `systemctl is-active apiserver` → `active`.

Lesson: `203/EXEC` is almost always a wrong/missing ExecStart path or a non-executable file. And any time you
edit a `.service` file you must `systemctl daemon-reload` before the change takes effect — otherwise systemd
keeps running the old definition and you'll swear your edit "did nothing."
