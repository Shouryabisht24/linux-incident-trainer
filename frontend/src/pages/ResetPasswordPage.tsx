import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useResetPassword } from "../api/queries";
import { ErrorBanner, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useNoSpaceField } from "../hooks/useNoSpaceField";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * Public, unauthenticated page — same tier as /login, outside RequireAuth. Reads the reset token
 * from the query string (the link emailed by /forgot-password). Password validation mirrors
 * ProfilePage's ChangePasswordCard exactly: min 8 chars, a match check, inline field-error/
 * field-hint. On failure, one generic banner — never distinguishes "expired" from "already used"
 * from "invalid", same no-enumeration contract as the backend's /reset-password.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const resetPassword = useResetPassword();

  const newPassword = useNoSpaceField();
  const confirmPassword = useNoSpaceField();
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPasswordError =
    attempted && newPassword.value.length > 0 && newPassword.value.length < 8
      ? "Must be at least 8 characters"
      : null;
  const confirmError =
    attempted && confirmPassword.value.length > 0 && confirmPassword.value !== newPassword.value
      ? "Passwords don't match"
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);

    if (!token) {
      setError("This reset link is missing its token. Request a new one.");
      return;
    }
    if (newPassword.value.length < 8) return;
    if (newPassword.value !== confirmPassword.value) return;

    resetPassword.mutate(
      { token, newPassword: newPassword.value },
      {
        onSuccess: () => {
          toast.success("Password reset. Log in with your new password.");
          navigate("/login", { replace: true });
        },
        onError: () => {
          setError("This reset link is invalid or has expired. Request a new one.");
        },
      },
    );
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
            <h1 className="gradient-heading">Choose a new password</h1>
            <p className="muted">Pick a new password for your account. Spaces aren't allowed, same as at signup.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <label className="field" htmlFor="reset-new-password">
              New password
              <input
                id="reset-new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={newPassword.value}
                onChange={newPassword.onChange}
                onKeyDown={newPassword.onKeyDown}
                onPaste={newPassword.onPaste}
                aria-invalid={!!newPasswordError}
                aria-describedby={newPasswordError ? "reset-new-password-error" : "reset-new-password-hint"}
                className={newPasswordError ? "field-invalid" : ""}
              />
              {newPasswordError ? (
                <span id="reset-new-password-error" className="field-error" role="alert">
                  {newPasswordError}
                </span>
              ) : (
                <span id="reset-new-password-hint" className="field-hint">
                  At least 8 characters. Spaces aren't allowed.
                </span>
              )}
            </label>

            <label className="field" htmlFor="reset-confirm-password">
              Confirm new password
              <input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword.value}
                onChange={confirmPassword.onChange}
                onKeyDown={confirmPassword.onKeyDown}
                onPaste={confirmPassword.onPaste}
                aria-invalid={!!confirmError}
                aria-describedby={confirmError ? "reset-confirm-password-error" : undefined}
                className={confirmError ? "field-invalid" : ""}
              />
              {confirmError && (
                <span id="reset-confirm-password-error" className="field-error" role="alert">
                  {confirmError}
                </span>
              )}
            </label>

            {error && <ErrorBanner message={error} />}

            <button type="submit" className="btn btn-primary auth-submit" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? (
                <>
                  <Spinner /> Resetting…
                </>
              ) : (
                "Reset password"
              )}
            </button>

            <p className="muted auth-form-footnote">
              <Link to="/login" className="auth-link">
                Back to log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
