## Solution

1. Confirm the basics first: `logger -t invoiced 'probe'` then `journalctl -t invoiced --no-pager | tail` shows
   the message landed in the journal just fine. So `invoiced` and journald are both healthy -- whatever's
   broken sits specifically between journald and rsyslog.
2. `cat /etc/rsyslog.d/25-invoiced.conf` shows an entirely ordinary, correct rule:
   ```
   :programname, isequal, "invoiced"    /var/log/invoiced/invoiced.log
   ```
   `systemctl status rsyslog` shows it's active and running. A correct rule, a running daemon -- and still
   nothing. Look closer at *how* rsyslog receives anything at all on a systemd box: the status output shows it
   acquired the socket `/run/systemd/journal/syslog` from systemd (`imuxsock: Acquired UNIX socket
   '/run/systemd/journal/syslog'`).
3. **REASONING**: on a systemd system, rsyslog typically doesn't read `/dev/log` directly the old-fashioned
   way, and it doesn't tail the binary journal either (that would need the separate `imjournal` module, not
   configured here). Instead, journald itself owns the traditional syslog socket, and -- when configured to --
   re-transmits a syslog-protocol copy of every entry it receives out over `/run/systemd/journal/syslog`,
   which rsyslog's `imuxsock` module listens on. That re-transmission is gated entirely by journald's own
   `ForwardToSyslog=` setting. Check the merged config: `systemd-analyze cat-config systemd/journald.conf`
   shows a drop-in setting `ForwardToSyslog=no`. Someone disabled it -- plausibly meaning to cut down on
   duplicate logging overhead -- without realizing `invoiced`'s dedicated rsyslog rule depends entirely on that
   forwarded feed to ever see anything. The journal itself keeps working perfectly (which is exactly why
   `journalctl -t invoiced` showed the message in step 1) -- it's specifically the *export* to rsyslog that's
   cut off, silently, with no error on either side.
4. Fix it: `sudo sed -i 's/ForwardToSyslog=no/ForwardToSyslog=yes/' /etc/systemd/journald.conf.d/noforward.conf`
   then `sudo systemctl restart systemd-journald`.
5. Verify: `logger -t invoiced 'confirm fix'` followed by `tail /var/log/invoiced/invoiced.log` now shows the
   line.

Lesson: journald and rsyslog can both be completely healthy on their own and a downstream pipeline between
them can still be dark, because rsyslog on a systemd box is often just a *consumer* of what journald chooses
to forward, not an independent collector. `ForwardToSyslog=` is the gate on that entire path -- disable it for
"noise reduction" and every rsyslog rule that depends on the journal's forwarded feed goes quiet at once, with
nothing in either journald's or rsyslog's own logs pointing at the cause.
