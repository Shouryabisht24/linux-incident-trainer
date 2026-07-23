import { useCallback, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ErrorBanner, Spinner } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strips every whitespace character (space, tab, newline) — used both as the paste-time filter
 * and as a change-time backstop, so no whitespace can end up in the field regardless of how it got
 * there (typed, pasted, dragged in, autofilled). */
function stripWhitespace(value: string): string {
  return value.replace(/\s/g, "");
}

/**
 * Backs a single-line credential input (email/password) that must never contain a space:
 * - `onKeyDown` blocks the spacebar outright, so a space never visibly appears while typing.
 * - `onPaste` strips whitespace from the pasted text specifically (rather than blocking the paste
 *   entirely) and re-inserts the cleaned text at the cursor, preserving caret position.
 * - `onChange` re-applies the same stripping as a backstop for any other path text can arrive by
 *   (IME composition, drag-and-drop, browser autofill).
 */
function useNoSpaceField(initial = "") {
  const [value, setValue] = useState(initial);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(stripWhitespace(e.target.value));
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") e.preventDefault();
  }, []);

  const onPaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const input = e.currentTarget;
    const cleaned = stripWhitespace(e.clipboardData.getData("text"));
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + cleaned + input.value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const pos = start + cleaned.length;
      input.setSelectionRange(pos, pos);
    });
  }, []);

  return { value, setValue, onChange, onKeyDown, onPaste };
}

export function AuthForm() {
  const { login, signup } = useAuth();
  // The landing page's "Get started" CTAs link to /login?mode=signup so a new visitor lands
  // straight on the signup form instead of having to notice and click the toggle themselves.
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "login");
  const reducedMotion = useReducedMotion();

  const email = useNoSpaceField();
  const password = useNoSpaceField();
  const [displayName, setDisplayName] = useState("");

  const [touched, setTouched] = useState({ email: false, password: false });
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showEmailErrors = touched.email || attempted;
  const showPasswordErrors = touched.password || attempted;

  const emailErrorMsg = !showEmailErrors
    ? null
    : email.value.length === 0
      ? "Email is required"
      : !EMAIL_RE.test(email.value)
        ? "Enter a valid email address"
        : null;

  const passwordErrorMsg = !showPasswordErrors
    ? null
    : password.value.length === 0
      ? "Password is required"
      : password.value.length < 8
        ? "Must be at least 8 characters"
        : null;

  function switchMode(next: "login" | "signup") {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setAttempted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (!EMAIL_RE.test(email.value) || password.value.length < 8) return;

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.value, password.value);
      } else {
        await signup(email.value, password.value, displayName.trim() || undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className={`auth-shell${reducedMotion ? "" : " auth-shell-animate"}`}>
        <Link to="/" className="auth-brand">
          Linux Incident Trainer
        </Link>

        <div className="auth-card">
          <div className="auth-toggle" role="group" aria-label="Choose login or signup">
            <span className={`auth-toggle-indicator${mode === "signup" ? " signup" : ""}`} aria-hidden="true" />
            <button
              type="button"
              className={`auth-toggle-btn${mode === "login" ? " active" : ""}`}
              aria-pressed={mode === "login"}
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={`auth-toggle-btn${mode === "signup" ? " active" : ""}`}
              aria-pressed={mode === "signup"}
              onClick={() => switchMode("signup")}
            >
              Sign up
            </button>
          </div>

          <div className="auth-card-head">
            <span className="eyebrow auth-eyebrow">{mode === "login" ? "Welcome back" : "New here"}</span>
            <h1>{mode === "login" ? "Log in to your account" : "Create your account"}</h1>
            <p className="muted">
              {mode === "login"
                ? "Pick up where you left off — your progress and any active session are waiting."
                : "Get a live shell into a genuinely broken container in under a minute."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <label className="field" htmlFor="auth-email">
              Email
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email.value}
                onChange={email.onChange}
                onKeyDown={email.onKeyDown}
                onPaste={email.onPaste}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={!!emailErrorMsg}
                aria-describedby={emailErrorMsg ? "auth-email-error" : undefined}
                className={emailErrorMsg ? "field-invalid" : ""}
              />
              {emailErrorMsg && (
                <span id="auth-email-error" className="field-error" role="alert">
                  {emailErrorMsg}
                </span>
              )}
            </label>

            <label className="field" htmlFor="auth-password">
              Password
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password.value}
                onChange={password.onChange}
                onKeyDown={password.onKeyDown}
                onPaste={password.onPaste}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={!!passwordErrorMsg}
                aria-describedby={passwordErrorMsg ? "auth-password-error" : "auth-password-hint"}
                className={passwordErrorMsg ? "field-invalid" : ""}
              />
              {passwordErrorMsg ? (
                <span id="auth-password-error" className="field-error" role="alert">
                  {passwordErrorMsg}
                </span>
              ) : (
                <span id="auth-password-hint" className="field-hint">
                  At least 8 characters. Spaces aren't allowed.
                </span>
              )}
            </label>

            <div className={`auth-collapse${mode === "signup" ? " is-open" : ""}`}>
              <div className="auth-collapse-inner">
                <label className="field" htmlFor="auth-display-name">
                  Display name (optional)
                  <input
                    id="auth-display-name"
                    type="text"
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    tabIndex={mode === "signup" ? 0 : -1}
                    aria-hidden={mode !== "signup"}
                  />
                </label>
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner /> Please wait…
                </>
              ) : mode === "login" ? (
                "Log in"
              ) : (
                "Create account"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
