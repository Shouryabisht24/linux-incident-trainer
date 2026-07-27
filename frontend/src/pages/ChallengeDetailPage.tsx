import { useCallback, useEffect, useRef, useState, type SVGProps } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  useChallenge,
  useCheckSession,
  useHints,
  useProgress,
  useRevealHint,
  useSolution,
  useStartSession,
  useStopSession,
  useActiveSession,
  useRefreshWsTicket,
} from "../api/queries";
import { Celebration, type CelebrationKind } from "../components/Celebration";
import { Markdown } from "../components/Markdown";
import { TerminalPane, type TerminalStatus } from "../components/TerminalPane";
import { DifficultyBadge, ErrorBanner, PageLoading, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";

interface LocalSession {
  id: string;
  wsTicket: string;
}

const HEARTBEAT_INTERVAL_MS = 20_000;

// Auto-reconnect backoff after an unexpected terminal disconnect — 5 attempts,
// capped at 8s apart, ~23s total budget before falling back to the existing
// manual "Reconnect" button + "Terminal connection lost" toast.
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];

// ---------------------------------------------------------------------------
// Icons — same hand-authored 22x22 stroke-glyph convention as
// DashboardPage/ChallengeListPage (no icon package, no emoji). Replaces the
// plain ✅/❌ emoji the check-result banner used to render.
// ---------------------------------------------------------------------------

function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8.5" />
      <path d="M7 11.3l2.8 2.8 5.2-5.6" />
    </svg>
  );
}

function XCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8.5" />
      <path d="M8.2 8.2l5.6 5.6M13.8 8.2l-5.6 5.6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Milestone-celebration detection — purely a client-side before/after
// comparison of `useProgress()` data around a "Check my fix" call, no new
// backend endpoint or column. `snapshotProgress` is captured right before the
// check mutation fires; `detectCelebration` compares it against the freshly
// refetched progress once the check comes back solved. Naturally satisfies
// "don't fire on a re-check of an already-solved challenge": if the challenge
// was already solved, `before` already reflects that (its own solved count/
// category-complete state is unchanged by a repeat check), so neither
// condition newly becomes true.
// ---------------------------------------------------------------------------

interface ProgressSnapshot {
  totalSolved: number;
  categorySlug: string;
  categorySolved: number;
  categoryTotal: number;
}

function snapshotProgress(
  progress: { solved: number; categories: { slug: string; solved: number; total: number }[] } | undefined,
  categorySlug: string,
): ProgressSnapshot | null {
  const cat = progress?.categories.find((c) => c.slug === categorySlug);
  if (!progress || !cat) return null;
  return { totalSolved: progress.solved, categorySlug: cat.slug, categorySolved: cat.solved, categoryTotal: cat.total };
}

function detectCelebration(
  before: ProgressSnapshot | null,
  after: { solved: number; categories: { slug: string; name: string; solved: number; total: number }[] } | undefined,
): { kind: CelebrationKind; categoryName?: string } | null {
  if (!before || !after) return null;

  // First-ever solve takes priority — a user's very first check is very
  // likely also their first-ever category completion if that category only
  // has one challenge, and "you solved your first incident" is the more
  // meaningful message to lead with in that overlap.
  if (before.totalSolved === 0 && after.solved === 1) {
    return { kind: "first-solve" };
  }

  const afterCat = after.categories.find((c) => c.slug === before.categorySlug);
  if (
    afterCat &&
    before.categoryTotal > 0 &&
    before.categorySolved < before.categoryTotal &&
    afterCat.solved === afterCat.total
  ) {
    return { kind: "category-complete", categoryName: afterCat.name };
  }

  return null;
}

export function ChallengeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();

  const challengeQuery = useChallenge(slug);
  const activeSessionQuery = useActiveSession();
  const progressQuery = useProgress();

  const startMutation = useStartSession();
  const stopMutation = useStopSession();
  const checkMutation = useCheckSession();
  const revealHintMutation = useRevealHint();
  const solutionMutation = useSolution();
  const refreshTicketMutation = useRefreshWsTicket();

  const [session, setSession] = useState<LocalSession | null>(null);
  const [resuming, setResuming] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>("connecting");
  const [checkResult, setCheckResult] = useState<{ passed: boolean; output: string } | null>(null);
  const [solutionMd, setSolutionMd] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ kind: CelebrationKind; categoryName?: string } | null>(null);

  // Set true right before the stop mutation fires, cleared on error (a failed
  // stop leaves the session/terminal alive, so a later real disconnect should
  // still be reported) and implicitly moot on success (the whole terminal panel
  // unmounts). Lets the WS-close handlers below tell "the container went away
  // because *we* just stopped it" apart from a genuinely unexpected disconnect,
  // without having TerminalPane itself guess at parent-level intent.
  const stoppingRef = useRef(false);

  // Session IDs we ourselves have stopped. `activeSessionQuery`'s cache is
  // invalidated on stop (see useStopSession), but invalidation only *triggers*
  // a refetch — it doesn't clear the stale `data` synchronously, so the render
  // that flips local `session` to null can still momentarily see the
  // just-stopped session as "active" and try to resume it below, which 404/409s
  // and throws a spurious error toast. Keyed by ID (not a blanket flag) so it
  // only ever suppresses resuming *that* specific stale session, never a
  // genuinely new one that shows up later for the same slug.
  const stoppedSessionIdsRef = useRef<Set<string>>(new Set());

  // Auto-reconnect budget: how many backoff attempts have fired since the last
  // successful connect, and the pending window.setTimeout (if any) for the
  // next one. Reset on a successful reconnect (handleTerminalStatusChange) and
  // cleared on slug change / stop, same places stoppingRef/stoppedSessionIdsRef
  // already get reset — a stop or navigation must never leave a stray attempt
  // pending against a session that's gone.
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  const hintsQuery = useHints(session?.id);

  // A session belongs to a single challenge — reset local UI state whenever the
  // slug changes so navigating between challenges doesn't carry over stale state.
  useEffect(() => {
    setSession(null);
    setCheckResult(null);
    setSolutionMd(null);
    stoppingRef.current = false;
    stoppedSessionIdsRef.current.clear();
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, [slug]);

  // Resume-on-refresh: if the backend reports an active session for *this*
  // challenge and we don't have local session state for it yet, fetch a fresh
  // ws-ticket (the one issued at session start has a 60s lifetime and is long
  // gone after a reload) and reconnect the terminal automatically.
  useEffect(() => {
    const active = activeSessionQuery.data?.session;
    if (!active || !slug || active.challenge_slug !== slug) return;
    if (session || refreshTicketMutation.isPending) return;
    if (stoppedSessionIdsRef.current.has(active.id)) return;

    setResuming(true);
    refreshTicketMutation.mutate(active.id, {
      onSuccess: (res) => {
        setSession({ id: active.id, wsTicket: res.wsTicket });
        toast.info("Resumed your in-progress session.");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "failed to resume your session");
      },
      onSettled: () => setResuming(false),
    });
    // refreshTicketMutation / toast intentionally omitted: stable-enough for this effect's purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionQuery.data, slug, session]);

  // Heartbeat: keeps the idle reaper from reclaiming a session the user is still
  // actively looking at. Fire-and-forget by design — not modeled as react-query
  // state since there's nothing to cache or render from it.
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      api.heartbeat(session.id).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [session]);

  const handleStart = useCallback(() => {
    if (!slug) return;
    stoppingRef.current = false;
    startMutation.mutate(slug, {
      onSuccess: (res) => {
        setSession({ id: res.sessionId, wsTicket: res.wsTicket });
        setCheckResult(null);
        setSolutionMd(null);
        toast.success("Session started — good luck.");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "failed to start session");
      },
    });
  }, [slug, startMutation, toast]);

  const handleStop = useCallback(() => {
    if (!session) return;
    // Mark this stop as user-initiated *before* the request goes out: the
    // backend killing the container can race the HTTP response, and the WS
    // bridge closing as a result must not be reported as a surprise disconnect.
    stoppingRef.current = true;
    stoppedSessionIdsRef.current.add(session.id);
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    stopMutation.mutate(session.id, {
      onSuccess: () => {
        setSession(null);
        setCheckResult(null);
        toast.info("Session stopped.");
      },
      onError: (err) => {
        // The stop didn't actually happen — the session/terminal are still
        // live, so a subsequent close should go back to being treated as real.
        stoppingRef.current = false;
        toast.error(err instanceof Error ? err.message : "failed to stop session");
      },
    });
  }, [session, stopMutation, toast]);

  const handleCheck = useCallback(() => {
    if (!session) return;
    // Snapshot progress *before* the check fires — this is the "before" side
    // of the client-only first-solve/category-complete detection (see
    // detectCelebration above). Taken here rather than inside onSuccess since
    // by then useCheckSession's own onSuccess has already invalidated (and
    // possibly begun refetching) the progress query.
    const categorySlug = challengeQuery.data?.category;
    const before = categorySlug ? snapshotProgress(progressQuery.data, categorySlug) : null;

    checkMutation.mutate(session.id, {
      onSuccess: async (result) => {
        setCheckResult(result);
        if (result.passed) {
          toast.success("Check passed — challenge solved!");
          // Pull the post-invalidation progress fresh (rather than trusting
          // whatever's already cached, which may still be the pre-check
          // value depending on refetch timing) and compare against the
          // snapshot taken above.
          const fresh = await progressQuery.refetch();
          const outcome = detectCelebration(before, fresh.data);
          if (outcome) setCelebration(outcome);
        } else {
          toast.error("Not solved yet — see the output below.");
        }
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "check failed");
      },
    });
  }, [session, checkMutation, toast, challengeQuery.data, progressQuery]);

  const handleRevealHint = useCallback(() => {
    if (!session) return;
    revealHintMutation.mutate(session.id, {
      onSuccess: (result) => {
        if (!result.hint) toast.info("No more hints available.");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "failed to reveal hint");
      },
    });
  }, [session, revealHintMutation, toast]);

  const handleShowSolution = useCallback(() => {
    if (!session) return;
    if (!window.confirm("Reveal the full solution? This ends the challenge for you.")) return;
    solutionMutation.mutate(session.id, {
      onSuccess: (result) => setSolutionMd(result.solutionMd),
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "failed to load solution");
      },
    });
  }, [session, solutionMutation, toast]);

  const handleReconnect = useCallback(() => {
    if (!session) return;
    refreshTicketMutation.mutate(session.id, {
      onSuccess: (res) => setSession((prev) => (prev ? { ...prev, wsTicket: res.wsTicket } : prev)),
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "failed to reconnect");
      },
    });
  }, [session, refreshTicketMutation, toast]);

  const handleUnexpectedExit = useCallback(() => {
    // A stop we ourselves initiated closing the socket is expected, not a
    // surprise — don't alarm the user over something they just clicked, and
    // never race the stop-suppression mechanism with an auto-reconnect.
    if (stoppingRef.current) return;

    if (reconnectAttemptsRef.current >= RECONNECT_DELAYS_MS.length) {
      // Budget exhausted — fall back to exactly today's behavior: the toast,
      // plus the manual "Reconnect" button (driven by terminalStatus below).
      reconnectAttemptsRef.current = 0;
      toast.error("Terminal connection lost.");
      return;
    }

    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current += 1;
    const sessionId = session?.id;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      // A stop can land mid-backoff — bail rather than reconnecting a session
      // the user (or we) just tore down.
      if (stoppingRef.current || !sessionId) return;
      refreshTicketMutation.mutate(sessionId, {
        onSuccess: (res) => setSession((prev) => (prev ? { ...prev, wsTicket: res.wsTicket } : prev)),
      });
    }, RECONNECT_DELAYS_MS[attempt]);
  }, [toast, refreshTicketMutation, session]);

  const handleTerminalStatusChange = useCallback((status: TerminalStatus) => {
    // Same suppression as handleUnexpectedExit, applied to the disconnected/
    // "Reconnect" UI: don't flash it for a disconnect caused by our own stop.
    if (stoppingRef.current && status === "disconnected") return;
    // A successful (re)connect resets the backoff budget for any future drop.
    if (status === "connected") reconnectAttemptsRef.current = 0;
    setTerminalStatus(status);
  }, []);

  if (challengeQuery.isLoading) {
    return (
      <div className="page">
        <PageLoading label="Loading challenge…" />
      </div>
    );
  }

  if (challengeQuery.error || !challengeQuery.data) {
    return (
      <div className="page">
        <ErrorBanner
          message={challengeQuery.error instanceof Error ? challengeQuery.error.message : "challenge not found"}
        />
        <p style={{ marginTop: "1rem" }}>
          <Link to="/challenges">&larr; Back to challenges</Link>
        </p>
      </div>
    );
  }

  const challenge = challengeQuery.data;
  const otherActive =
    activeSessionQuery.data?.session && activeSessionQuery.data.session.challenge_slug !== slug
      ? activeSessionQuery.data.session
      : null;
  const revealed = hintsQuery.data?.revealed ?? [];
  const totalHints = hintsQuery.data?.totalHints ?? challenge.hintCount;
  const checkingForSession = activeSessionQuery.isLoading || resuming;

  return (
    <div className="page challenge-detail-page">
      {celebration && (
        <Celebration
          kind={celebration.kind}
          categoryName={celebration.categoryName}
          onDismiss={() => setCelebration(null)}
        />
      )}

      <p>
        <Link to="/challenges">&larr; Back to challenges</Link>
      </p>

      <div className="challenge-panel challenge-detail-card">
        <span className="kicker-line">$ challenges/{challenge.slug}/challenge.json</span>
        <h1>{challenge.title}</h1>
        <div className="row row-wrap challenge-detail-meta">
          <DifficultyBadge difficulty={challenge.difficulty} />
          <span className="badge badge-neutral">{challenge.categoryName}</span>
          {challenge.timeLimitMinutes ? <span className="faint">~{challenge.timeLimitMinutes} min</span> : null}
        </div>

        <Markdown>{challenge.descriptionMd}</Markdown>
      </div>

      {otherActive && !session && (
        <div className="alert alert-info" style={{ marginBottom: "1rem" }}>
          You have a running session for <strong>{otherActive.challenge_title}</strong>. Starting this challenge
          will stop it. <Link to={`/challenges/${otherActive.challenge_slug}`}>Go there instead</Link>
        </div>
      )}

      {checkingForSession ? (
        <PageLoading label={resuming ? "Resuming your session…" : "Checking for an active session…"} />
      ) : !session ? (
        <button className="btn btn-primary" onClick={handleStart} disabled={startMutation.isPending}>
          {startMutation.isPending ? (
            <>
              <Spinner /> Starting…
            </>
          ) : (
            "Start Challenge"
          )}
        </button>
      ) : (
        <div className="stack">
          <div className="terminal-status">
            <span className={`dot dot-${terminalStatus}`} />
            {terminalStatus === "connected" && "Connected"}
            {terminalStatus === "connecting" && "Connecting…"}
            {terminalStatus === "disconnected" && (
              <>
                Disconnected
                <button className="btn btn-sm" onClick={handleReconnect} disabled={refreshTicketMutation.isPending}>
                  {refreshTicketMutation.isPending ? "Reconnecting…" : "Reconnect"}
                </button>
              </>
            )}
          </div>

          <div className="terminal-frame">
            <div className="terminal-wrap">
              <TerminalPane
                key={session.id}
                wsTicket={session.wsTicket}
                onExit={handleUnexpectedExit}
                onStatusChange={handleTerminalStatusChange}
              />
            </div>
          </div>

          <div className="row row-wrap">
            <button className="btn btn-primary" onClick={handleCheck} disabled={checkMutation.isPending}>
              {checkMutation.isPending ? (
                <>
                  <Spinner /> Checking…
                </>
              ) : (
                "Check My Fix"
              )}
            </button>
            <button
              className="btn"
              onClick={handleRevealHint}
              disabled={revealHintMutation.isPending || revealed.length >= totalHints}
            >
              {revealHintMutation.isPending ? "Revealing…" : `Reveal Hint (${revealed.length}/${totalHints})`}
            </button>
            <button className="btn" onClick={handleShowSolution} disabled={solutionMutation.isPending}>
              {solutionMutation.isPending ? "Loading…" : "Show Solution"}
            </button>
            <button className="btn btn-danger" onClick={handleStop} disabled={stopMutation.isPending}>
              {stopMutation.isPending ? "Stopping…" : "Stop Session"}
            </button>
          </div>

          {checkResult && (
            <div
              className={`alert challenge-check-alert ${checkResult.passed ? "alert-success" : "alert-error"}`}
              role="alert"
            >
              <span className="challenge-check-alert-icon">
                {checkResult.passed ? <CheckCircleIcon /> : <XCircleIcon />}
              </span>
              <div>
                <strong>{checkResult.passed ? "Solved" : "Not solved yet"}</strong>
                <code>{checkResult.output}</code>
              </div>
            </div>
          )}

          {revealed.length > 0 && (
            <div className="hint-card">
              <span className="kicker-line">$ hints --revealed</span>
              <h3>Hints</h3>
              <ol className="hint-list">
                {revealed.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ol>
            </div>
          )}

          {solutionMd && (
            <div className="card challenge-panel">
              <h3>Solution</h3>
              <Markdown>{solutionMd}</Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
