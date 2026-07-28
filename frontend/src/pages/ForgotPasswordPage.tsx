import { useState } from "react";
import { Link } from "react-router-dom";
import { useRequestPasswordReset } from "../api/queries";
import { ErrorBanner, Spinner } from "../components/ui";
import { useNoSpaceField } from "../hooks/useNoSpaceField";
import { useReducedMotion } from "../hooks/useReducedMotion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public, unauthenticated page — same tier as /login, outside RequireAuth. Deliberately shows the
 * exact same generic success message regardless of whether the account exists: the API itself
 * always returns 200 either way (see auth.routes.ts's /forgot-password), but the UI copy must
 * never introduce a second channel for account-enumeration by branching on anything else either.
 */
export function ForgotPasswordPage() {
  const reducedMotion = useReducedMotion();
  const requestReset = useRequestPasswordReset();

  const email = useNoSpaceField();
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showEmailError = attempted && !submitted;
  const emailErrorMsg = !showEmailError
    ? null
    : email.value.length === 0
      ? "Email is required"
      : !EMAIL_RE.test(email.value)
        ? "Enter a valid email address"
        : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (!EMAIL_RE.test(email.value)) return;

    requestReset.mutate(email.value, {
      // Always show the same success state, whether the request "succeeded" per the API's own
      // always-200 contract or (in the rare case of a network failure) actually threw — a user who
      // can't tell "no such account" from "your connection dropped" learns nothing either way, and
      // retrying is always the safe next step to suggest.
      onSuccess: () => setSubmitted(true),
      onError: () => setSubmitted(true),
    });
  }

  return (
    <div className="auth-page">
      <div className={`auth-shell${reducedMotion ? "" : " auth-shell-animate"}`}>
        <Link to="/" className="auth-brand">
          Linux Incident Trainer
        </Link>

        <div className="auth-card">
          <div className="auth-card-head">
            <span className="eyebrow auth-eyebrow">Reset password</span>
            <h1 className="gradient-heading">Forgot your password?</h1>
            <p className="muted">
              Enter the email on your account and, if it exists, we'll send a link to reset your password.
            </p>
          </div>

          {submitted ? (
            <div className="stack">
              <p>
                If that email exists, we've sent a reset link. It expires in an hour — check your inbox (and spam
                folder) for it.
              </p>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Back to log in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <label className="field" htmlFor="forgot-email">
                Email
                <input
                  id="forgot-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={email.value}
                  onChange={email.onChange}
                  onKeyDown={email.onKeyDown}
                  onPaste={email.onPaste}
                  aria-invalid={!!emailErrorMsg}
                  aria-describedby={emailErrorMsg ? "forgot-email-error" : undefined}
                  className={emailErrorMsg ? "field-invalid" : ""}
                />
                {emailErrorMsg && (
                  <span id="forgot-email-error" className="field-error" role="alert">
                    {emailErrorMsg}
                  </span>
                )}
              </label>

              {error && <ErrorBanner message={error} />}

              <button type="submit" className="btn btn-primary auth-submit" disabled={requestReset.isPending}>
                {requestReset.isPending ? (
                  <>
                    <Spinner /> Sending…
                  </>
                ) : (
                  "Send reset link"
                )}
              </button>

              <p className="muted auth-form-footnote">
                <Link to="/login" className="auth-link">
                  Back to log in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
