import { useEffect, useRef, useState } from "react";
import { api, type ChallengeDetail as ChallengeDetailType } from "../api/client";
import { TerminalPane } from "./TerminalPane";

interface SessionState {
  sessionId: string;
  wsTicket: string;
}

export function ChallengeDetail({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [challenge, setChallenge] = useState<ChallengeDetailType | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ passed: boolean; output: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const [totalHints, setTotalHints] = useState(0);
  const [solutionMd, setSolutionMd] = useState<string | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  useEffect(() => {
    api.getChallenge(slug).then(setChallenge).catch((err) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, []);

  async function handleStart() {
    setStarting(true);
    setError(null);
    setCheckResult(null);
    setSolutionMd(null);
    try {
      const res = await api.startSession(slug);
      setSession({ sessionId: res.sessionId, wsTicket: res.wsTicket });
      const hintsState = await api.getHints(res.sessionId);
      setHints(hintsState.revealed);
      setTotalHints(hintsState.totalHints);
      heartbeatRef.current = window.setInterval(() => {
        api.heartbeat(res.sessionId).catch(() => {});
      }, 20_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start session");
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    if (!session) return;
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    await api.stopSession(session.sessionId).catch(() => {});
    setSession(null);
    setCheckResult(null);
    setHints([]);
  }

  async function handleCheck() {
    if (!session) return;
    setChecking(true);
    try {
      const result = await api.checkSession(session.sessionId);
      setCheckResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "check failed");
    } finally {
      setChecking(false);
    }
  }

  async function handleRevealHint() {
    if (!session) return;
    const result = await api.revealHint(session.sessionId);
    if (result.hint) setHints((prev) => [...prev, result.hint!]);
    setTotalHints(result.totalHints);
  }

  async function handleShowSolution() {
    if (!session) return;
    if (!window.confirm("Reveal the full solution? This ends the challenge for you.")) return;
    const result = await api.getSolution(session.sessionId);
    setSolutionMd(result.solutionMd);
  }

  if (!challenge) {
    return (
      <div style={{ padding: "2rem" }}>
        {error ? <p style={{ color: "crimson" }}>{error}</p> : <p>Loading…</p>}
        <button onClick={onBack}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <button onClick={onBack}>&larr; Back to challenges</button>
      <h1>{challenge.title}</h1>
      <p>
        <strong>{challenge.categoryName}</strong> &middot; {challenge.difficulty}
        {challenge.timeLimitMinutes ? ` · ~${challenge.timeLimitMinutes} min` : ""}
      </p>
      <p style={{ whiteSpace: "pre-wrap" }}>{challenge.descriptionMd}</p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!session ? (
        <button onClick={handleStart} disabled={starting}>
          {starting ? "Starting…" : "Start Challenge"}
        </button>
      ) : (
        <>
          <TerminalPane wsTicket={session.wsTicket} />

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button onClick={handleCheck} disabled={checking}>
              {checking ? "Checking…" : "Check My Fix"}
            </button>
            <button onClick={handleRevealHint} disabled={hints.length >= totalHints}>
              Reveal Hint ({hints.length}/{totalHints})
            </button>
            <button onClick={handleShowSolution}>Show Solution</button>
            <button onClick={handleStop}>Stop Session</button>
          </div>

          {checkResult && (
            <p style={{ color: checkResult.passed ? "green" : "crimson" }}>
              {checkResult.passed ? "✅ Solved! " : "❌ Not solved yet. "}
              <code>{checkResult.output}</code>
            </p>
          )}

          {hints.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3>Hints</h3>
              <ol>
                {hints.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ol>
            </div>
          )}

          {solutionMd && (
            <div style={{ marginTop: "1rem", background: "#f5f5f5", padding: "1rem" }}>
              <h3>Solution</h3>
              <pre style={{ whiteSpace: "pre-wrap" }}>{solutionMd}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
