import { useProgress } from "../api/queries";
import { ErrorBanner, PageLoading } from "../components/ui";

export function ProgressDashboardPage() {
  const { data, isLoading, error } = useProgress();

  return (
    <div className="page">
      <h1>Progress</h1>

      {isLoading && <PageLoading label="Loading progress…" />}
      {error && <ErrorBanner message={error instanceof Error ? error.message : "failed to load progress"} />}

      {data && (
        <>
          <div className="progress-summary">
            <span className="big">
              {data.solved}/{data.total}
            </span>
            <span className="muted">challenges solved</span>
          </div>
          <div className="progress-bar-track" style={{ marginBottom: "2rem" }}>
            <div
              className="progress-bar-fill"
              style={{ width: data.total > 0 ? `${(data.solved / data.total) * 100}%` : "0%" }}
            />
          </div>

          <h2>By category</h2>
          <div className="card">
            {data.categories.length === 0 && <p className="muted">No categories yet.</p>}
            {data.categories.map((cat) => (
              <div className="category-row" key={cat.slug}>
                <span>{cat.name}</span>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: cat.total > 0 ? `${(cat.solved / cat.total) * 100}%` : "0%" }}
                  />
                </div>
                <span className="muted" style={{ textAlign: "right" }}>
                  {cat.solved}/{cat.total}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
