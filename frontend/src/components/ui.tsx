export function Spinner() {
  return <span className="spinner" role="status" aria-label="loading" />;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const cls =
    difficulty === "beginner" ? "badge-beginner" : difficulty === "intermediate" ? "badge-intermediate" : "badge-hard";
  return <span className={`badge ${cls}`}>{difficulty}</span>;
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="row" style={{ padding: "3rem 0", justifyContent: "center", color: "var(--color-text-muted)" }}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
