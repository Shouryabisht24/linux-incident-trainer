import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCategories, useChallenges } from "../api/queries";
import { DifficultyBadge, ErrorBanner, PageLoading } from "../components/ui";

type SolvedFilter = "all" | "solved" | "unsolved";

export function ChallengeListPage() {
  const challengesQuery = useChallenges();
  const categoriesQuery = useCategories();
  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [solved, setSolved] = useState<SolvedFilter>("all");

  const filtered = useMemo(() => {
    const challenges = challengesQuery.data ?? [];
    return challenges.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (difficulty !== "all" && c.difficulty !== difficulty) return false;
      if (solved === "solved" && !c.solved) return false;
      if (solved === "unsolved" && c.solved) return false;
      return true;
    });
  }, [challengesQuery.data, category, difficulty, solved]);

  const isLoading = challengesQuery.isLoading || categoriesQuery.isLoading;
  const error = challengesQuery.error ?? categoriesQuery.error;

  return (
    <div className="page">
      <div className="spread" style={{ marginBottom: "1.25rem" }}>
        <h1>Challenges</h1>
        {challengesQuery.data && (
          <span className="muted">
            {challengesQuery.data.filter((c) => c.solved).length} / {challengesQuery.data.length} solved
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "failed to load challenges"} />}

      {!isLoading && !error && (
        <div className="filters-bar">
          <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categoriesQuery.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="filter-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Filter by difficulty">
            <option value="all">All difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="hard">Hard</option>
          </select>
          <select
            className="filter-select"
            value={solved}
            onChange={(e) => setSolved(e.target.value as SolvedFilter)}
            aria-label="Filter by solved status"
          >
            <option value="all">All statuses</option>
            <option value="solved">Solved</option>
            <option value="unsolved">Unsolved</option>
          </select>
          {(category !== "all" || difficulty !== "all" || solved !== "all") && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setCategory("all");
                setDifficulty("all");
                setSolved("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {isLoading && <PageLoading label="Loading challenges…" />}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="empty-state">No challenges match these filters.</div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="challenge-grid">
          {filtered.map((c) => (
            <Link key={c.slug} to={`/challenges/${c.slug}`} className={`challenge-card${c.solved ? " solved" : ""}`}>
              <div className="challenge-card-title">
                {c.solved && <span title="Solved">&#9989;</span>}
                {c.title}
              </div>
              <div className="row row-wrap">
                <DifficultyBadge difficulty={c.difficulty} />
                <span className="badge badge-neutral">{c.categoryName}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
