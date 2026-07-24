import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  useChallenge,
  useCheckSession,
  useHints,
  useRevealHint,
  useSolution,
  useStartSession,
  useStopSession,
  useActiveSession,
  useRefreshWsTicket,
} from "../api/queries";
import { Markdown } from "../components/Markdown";
import { TerminalPane, type TerminalStatus } from "../components/TerminalPane";
import { DifficultyBadge, ErrorBanner, PageLoading, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";

interface LocalSession {
  id: string;
  wsTicket: string;
}

const HEARTBEAT_INTERVAL_MS = 20_000;

export function ChallengeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();

  const challengeQuery = useChallenge(slug);
  const activeSessionQuery = useActiveSession();

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

  const hintsQuery = useHints(session?.id);

  // A session belongs to a single challenge — reset local UI state whenever the
  // slug changes so navigating between challenges doesn't carry over stale state.
  useEffect(() => {
    setSession(null);
    setCheckResult(null);
    setSolutionMd(null);
    stoppingRef.current = false;
    stoppedSessionIdsRef.current.clear();
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
    checkMutation.mutate(session.id, {
      onSuccess: (result) => {
        setCheckResult(result);
        if (result.passed) toast.success("Check passed — challenge solved!");
        else toast.error("Not solved yet — see the output below.");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "check failed");
      },
    });
  }, [session, checkMutation, toast]);

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
    // surprise — don't alarm the user over something they just clicked.
    if (stoppingRef.current) return;
    toast.error("Terminal connection lost.");
  }, [toast]);

  const handleTerminalStatusChange = useCallback((status: TerminalStatus) => {
    // Same suppression as handleUnexpectedExit, applied to the disconnected/
    // "Reconnect" UI: don't flash it for a disconnect caused by our own stop.
    if (stoppingRef.current && status === "disconnected") return;
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
    <div className="page">
      <p>
        <Link to="/challenges">&larr; Back to challenges</Link>
      </p>
      <h1>{challenge.title}</h1>
      <div className="row row-wrap" style={{ marginBottom: "1.25rem" }}>
        <DifficultyBadge difficulty={challenge.difficulty} />
        <span className="badge badge-neutral">{challenge.categoryName}</span>
        {challenge.timeLimitMinutes ? <span className="faint">~{challenge.timeLimitMinutes} min</span> : null}
      </div>

      <Markdown>{challenge.descriptionMd}</Markdown>

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

          <div className="terminal-wrap">
            <TerminalPane
              key={session.id}
              wsTicket={session.wsTicket}
              onExit={handleUnexpectedExit}
              onStatusChange={handleTerminalStatusChange}
            />
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
            <div className={`alert ${checkResult.passed ? "alert-success" : "alert-error"}`}>
              {checkResult.passed ? "✅ Solved! " : "❌ Not solved yet. "}
              <code>{checkResult.output}</code>
            </div>
          )}

          {revealed.length > 0 && (
            <div>
              <h3>Hints</h3>
              <ol className="hint-list">
                {revealed.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ol>
            </div>
          )}

          {solutionMd && (
            <div className="card">
              <h3>Solution</h3>
              <Markdown>{solutionMd}</Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
