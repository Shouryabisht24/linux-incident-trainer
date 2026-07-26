import { useState, type FormEvent } from "react";
import { useHelpRequests, useSubmitHelpRequest } from "../api/queries";
import { ErrorBanner, Spinner } from "../components/ui";
import { useToast } from "../context/ToastContext";

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 4000;

// ---------------------------------------------------------------------------
// Form — modeled closely on ProfilePage.tsx's ChangePasswordCard (plain
// useState, an `attempted`-gated validation flag, ErrorBanner, Spinner, toast
// on success, field reset after submit). Deliberately doesn't use
// useNoSpaceField — that hook forbids whitespace for credential fields, and
// subject/message here are free text that legitimately contains spaces.
// ---------------------------------------------------------------------------

function HelpForm() {
  const toast = useToast();
  const submitHelpRequest = useSubmitHelpRequest();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectError =
    attempted && subject.trim().length === 0
      ? "Subject is required"
      : attempted && subject.trim().length > SUBJECT_MAX
        ? `Must be under ${SUBJECT_MAX} characters`
        : null;
  const messageError =
    attempted && message.trim().length === 0
      ? "Message is required"
      : attempted && message.trim().length > MESSAGE_MAX
        ? `Must be under ${MESSAGE_MAX} characters`
        : null;

  function resetFields() {
    setSubject("");
    setMessage("");
    setAttempted(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);

    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject || !trimmedMessage) return;
    if (trimmedSubject.length > SUBJECT_MAX || trimmedMessage.length > MESSAGE_MAX) return;

    submitHelpRequest.mutate(
      { subject: trimmedSubject, message: trimmedMessage },
      {
        onSuccess: () => {
          toast.success("Request submitted.");
          resetFields();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "failed to submit request");
        },
      },
    );
  }

  return (
    <div className="card profile-card">
      <span className="dashboard-card-kicker">$ help --new</span>
      <h2>Contact / ask for help</h2>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <label className="field" htmlFor="help-subject">
          Subject
          <input
            id="help-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUBJECT_MAX}
            aria-invalid={!!subjectError}
            aria-describedby={subjectError ? "help-subject-error" : undefined}
            className={subjectError ? "field-invalid" : ""}
          />
          {subjectError && (
            <span id="help-subject-error" className="field-error" role="alert">
              {subjectError}
            </span>
          )}
        </label>
        <label className="field" htmlFor="help-message">
          Message
          <textarea
            id="help-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MESSAGE_MAX}
            aria-invalid={!!messageError}
            aria-describedby={messageError ? "help-message-error" : undefined}
            className={messageError ? "field-invalid" : ""}
          />
          {messageError && (
            <span id="help-message-error" className="field-error" role="alert">
              {messageError}
            </span>
          )}
        </label>

        {error && <ErrorBanner message={error} />}

        <div>
          <button type="submit" className="btn btn-primary" disabled={submitHelpRequest.isPending}>
            {submitHelpRequest.isPending ? (
              <>
                <Spinner /> Submitting…
              </>
            ) : (
              "Submit request"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past submissions
// ---------------------------------------------------------------------------

function HelpRequestList() {
  const { data, isLoading, error } = useHelpRequests();

  if (isLoading) {
    return <p className="muted">Loading…</p>;
  }

  if (error) {
    return <ErrorBanner message={error instanceof Error ? error.message : "failed to load submissions"} />;
  }

  if (!data || data.length === 0) {
    return <p className="muted">No submissions yet.</p>;
  }

  return (
    <div className="stack">
      {data.map((req) => (
        <div key={req.id} className="help-request-item">
          <div className="spread">
            <h3>{req.subject}</h3>
            <span className="faint">{new Date(req.created_at).toLocaleString()}</span>
          </div>
          <p className="muted">{req.message}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function HelpPage() {
  return (
    <div className="page page-narrow help-page">
      <span className="eyebrow">Support</span>
      <h1>Get help</h1>
      <p className="muted">Stuck on something, or found a bug? Send a note — every submission below is yours alone.</p>

      <div className="stack profile-stack">
        <HelpForm />
        <div>
          <h2 className="progress-grid-heading">Your past submissions</h2>
          <HelpRequestList />
        </div>
      </div>
    </div>
  );
}
