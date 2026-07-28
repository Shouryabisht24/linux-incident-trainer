import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useChangePassword, useDeleteAccount, useUpdateDisplayName } from "../api/queries";
import { ErrorBanner, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useNoSpaceField } from "../hooks/useNoSpaceField";

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

function DisplayNameCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const updateDisplayName = useUpdateDisplayName();
  const [name, setName] = useState(user?.display_name ?? "");

  const dirty = name.trim() !== (user?.display_name ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    updateDisplayName.mutate(name.trim() || null, {
      onSuccess: (res) => {
        setUser(res.user);
        toast.success("Display name updated.");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "failed to update display name");
      },
    });
  }

  return (
    <div className="card profile-card">
      <span className="dashboard-card-kicker">$ whoami --edit</span>
      <h2>Display name</h2>
      <p className="muted">Shown in the navbar and on your dashboard greeting. Optional — leave blank to use your email.</p>
      <form onSubmit={handleSubmit} className="stack">
        <label className="field" htmlFor="profile-display-name">
          Display name
          <input
            id="profile-display-name"
            type="text"
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!dirty || updateDisplayName.isPending}>
            {updateDisplayName.isPending ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              "Save display name"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

function ChangePasswordCard() {
  const toast = useToast();
  const changePassword = useChangePassword();

  const currentPassword = useNoSpaceField();
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

  function resetFields() {
    currentPassword.setValue("");
    newPassword.setValue("");
    confirmPassword.setValue("");
    setAttempted(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);

    if (currentPassword.value.length === 0) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.value.length < 8) return;
    if (newPassword.value !== confirmPassword.value) return;

    changePassword.mutate(
      { currentPassword: currentPassword.value, newPassword: newPassword.value },
      {
        onSuccess: () => {
          toast.success("Password changed.");
          resetFields();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "failed to change password");
        },
      },
    );
  }

  return (
    <div className="card profile-card">
      <span className="dashboard-card-kicker">$ passwd</span>
      <h2>Change password</h2>
      <p className="muted">Requires your current password. Spaces aren't allowed, same as at signup.</p>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <label className="field" htmlFor="profile-current-password">
          Current password
          <input
            id="profile-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword.value}
            onChange={currentPassword.onChange}
            onKeyDown={currentPassword.onKeyDown}
            onPaste={currentPassword.onPaste}
          />
        </label>
        <label className="field" htmlFor="profile-new-password">
          New password
          <input
            id="profile-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword.value}
            onChange={newPassword.onChange}
            onKeyDown={newPassword.onKeyDown}
            onPaste={newPassword.onPaste}
            aria-invalid={!!newPasswordError}
            aria-describedby={newPasswordError ? "profile-new-password-error" : "profile-new-password-hint"}
            className={newPasswordError ? "field-invalid" : ""}
          />
          {newPasswordError ? (
            <span id="profile-new-password-error" className="field-error" role="alert">
              {newPasswordError}
            </span>
          ) : (
            <span id="profile-new-password-hint" className="field-hint">
              At least 8 characters. Spaces aren't allowed.
            </span>
          )}
        </label>
        <label className="field" htmlFor="profile-confirm-password">
          Confirm new password
          <input
            id="profile-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword.value}
            onChange={confirmPassword.onChange}
            onKeyDown={confirmPassword.onKeyDown}
            onPaste={confirmPassword.onPaste}
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? "profile-confirm-password-error" : undefined}
            className={confirmError ? "field-invalid" : ""}
          />
          {confirmError && (
            <span id="profile-confirm-password-error" className="field-error" role="alert">
              {confirmError}
            </span>
          )}
        </label>

        {error && <ErrorBanner message={error} />}

        <div>
          <button type="submit" className="btn btn-primary" disabled={changePassword.isPending}>
            {changePassword.isPending ? (
              <>
                <Spinner /> Changing…
              </>
            ) : (
              "Change password"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — self-service account deletion
// ---------------------------------------------------------------------------

const DELETE_CONFIRM_WORD = "DELETE";

function DeleteAccountCard() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();

  const currentPassword = useNoSpaceField();
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === DELETE_CONFIRM_WORD && currentPassword.value.length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canDelete) return;

    deleteAccount.mutate(currentPassword.value, {
      onSuccess: () => {
        logout();
        toast.success("Your account has been deleted.");
        navigate("/", { replace: true });
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "current password is incorrect");
      },
    });
  }

  return (
    <div className="card profile-card profile-danger-card">
      <span className="dashboard-card-kicker">$ rm -rf ~/account</span>
      <h2>Danger zone</h2>
      <p className="muted">
        Permanently deletes your account: your login, progress, session history, and any check attempts. Any
        currently running challenge session is stopped and its container destroyed first. This action cannot be
        undone.
      </p>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <label className="field" htmlFor="profile-delete-confirm">
          Type <strong>{DELETE_CONFIRM_WORD}</strong> to confirm
          <input
            id="profile-delete-confirm"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </label>
        <label className="field" htmlFor="profile-delete-password">
          Current password
          <input
            id="profile-delete-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword.value}
            onChange={currentPassword.onChange}
            onKeyDown={currentPassword.onKeyDown}
            onPaste={currentPassword.onPaste}
          />
        </label>

        {error && <ErrorBanner message={error} />}

        <div>
          <button type="submit" className="btn btn-danger" disabled={!canDelete || deleteAccount.isPending}>
            {deleteAccount.isPending ? (
              <>
                <Spinner /> Deleting…
              </>
            ) : (
              "Permanently delete my account"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="page page-narrow profile-page">
      <span className="eyebrow">Account</span>
      <h1 className="gradient-heading">Profile & settings</h1>
      <p className="muted profile-email">{user?.email}</p>

      <div className="stack profile-stack">
        <DisplayNameCard />
        <ChangePasswordCard />
        <DeleteAccountCard />
      </div>
    </div>
  );
}
