# 0047 — `explain.json` backfill across the full 100-challenge catalogue

## Context

The "Explain" walkthrough panel (`ExplainPanel.tsx`, `GET /api/sessions/:id/explain`,
`getExplainSteps` in `challenge.service.ts`) shipped with only 3 reference `explain.json` files
(`disk-full-var-log`, `perm-config-blocks-service`, `systemd-crashloop-bad-config`) — the other 97
challenges silently rendered no panel at all, by design (`ExplainPanel` returns `null` for `steps.length
=== 0`, not an empty/broken-looking state). That gap was fine while the catalogue itself was still being
built out, but with the catalogue now at 100 challenges (see the 50→100 expansion note in `tasks.md`),
97 challenges quietly missing an already-built, already-working feature was the highest-leverage gap
left in the app.

## What was done

Authored `explain.json` for all 97 remaining challenges, in 5 waves of 2 parallel background agents each
(same "2 at a time" cadence established for the challenge-catalogue expansion), grouped by category:

| Wave | Categories | Challenges |
|---|---|---|
| 1 | cron-scheduling, disk-filesystem | 9 + 10 = 19 |
| 2 | logs-journald, networking-dns | 9 + 10 = 19 |
| 3 | package-management, permissions-ownership | 9 + 10 = 19 |
| 4 | process-performance, ssh-remote-access | 10 + 10 = 20 |
| 5 | systemd-services, users-groups-sudo | 10 + 10 = 20 |

Unlike the catalogue-expansion agents, none of this work touched Docker at all — no build, no run, no
`check.sh` verification loop. Each agent's job was purely: read that challenge's `challenge.json`,
`seed.sh`, `check.sh`, `solution.md`, and `hints.json`, then write 4-6 reasoning steps (`order_index`,
`title`, `explanation`) that build a mental model — confirm the symptom, find the real cause via a named
diagnostic command, explain the actual underlying OS/tool mechanism, verify against that same diagnostic
command, and (often) a closing note on the durable fix vs. the immediate bandage — grounded in that
specific challenge's own files, not generic advice. Every agent was pointed at the same 3 reference files
as a tone/format bar before writing anything.

Every one of the 97 new files was independently re-validated by me directly (`python3 -m json.tool`),
not just trusted from each agent's own report, plus a final direct `find challenges -name explain.json |
wc -l` confirming exactly 100/100 challenges now have one.

## Category-specific correctness notes carried forward into agent prompts

Several categories needed explicit guardrails to avoid the same fake-break/mischaracterization traps
`decisions/0007`/`0016`/AUTHORING.md already document, since an explain step that describes the wrong
mechanism is worse than no explain step at all:

- **permissions-ownership / ssh-remote-access**: explicitly framed around `decisions/0007` (root ignores
  DAC checks — steps must center the real unprivileged actor) and its two named exceptions (the execute
  bit; sshd/ssh-client's own StrictModes-style enforcement, which *does* apply regardless of privilege).
- **systemd-services**: `systemd-missing-environment-file`'s steps explicitly state that `EnvironmentFile=`
  is read as root before systemd drops to the unit's own user, so file permissions on it are inert — the
  break is the file being missing, fixed via the optional `-` prefix, not a chmod.
- **users-groups-sudo**: `sudoers-dropin-syntax-error`'s steps carry forward the empirically-confirmed
  fact (from the original challenge-authoring pass) that a syntax error in one sudoers drop-in only voids
  that file's own rules on sudo 1.9.13, not sudo system-wide.
- **networking-dns**: reminded that this platform never grants `NET_ADMIN`, so no explanation invents an
  iptables/nftables framing anywhere in the batch.
- **package-management**: reminded that no seed.sh in this repo uses live `apt` against a real network —
  package state is corrupted by direct dpkg-database edits — so no explanation describes a live apt
  operation.
- **process-performance**: carried forward two prior empirical findings (zombies still count against a
  `pids` cgroup ceiling even though they hold no other resources; `proc-cpu-affinity-starvation` needs the
  full 2-vCPU quota to avoid CFS bandwidth-fragmentation inverting the intended effect) so explanations
  match what the container actually does, not textbook behavior.

## Verification

- All 97 new files independently validated as syntactically correct JSON by direct command, not agent
  self-report.
- Final catalogue-wide count confirmed at exactly 100/100 via `find challenges -name explain.json | wc -l`.
- No file other than the new `explain.json` per slug was touched by any agent (spot-checked via each
  agent's own git-status-equivalent report; `tasks.md` and `decisions/` were explicitly off-limits to every
  batch agent to avoid a 10-way concurrent write race, consolidated centrally here instead).
- No backend restart was required or performed — `explain.json` is read live off disk per-request
  (unlike `challenge.json`, which needs `syncChallengesFromDisk` at boot).
