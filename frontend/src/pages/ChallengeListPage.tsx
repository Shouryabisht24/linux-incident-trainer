import { useMemo, useRef, useState, type KeyboardEvent, type SVGProps } from "react";
import { Link } from "react-router-dom";
import type { ChallengeSummary } from "../api/client";
import { useCategories, useChallenges } from "../api/queries";
import { DifficultyBadge, ErrorBanner } from "../components/ui";
import { useScrollReveal } from "../hooks/useScrollReveal";

type SolvedFilter = "all" | "solved" | "unsolved";
type DifficultyFilter = "all" | "beginner" | "intermediate" | "hard";

const DIFFICULTY_OPTIONS: { value: DifficultyFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "hard", label: "Hard" },
];

const SOLVED_OPTIONS: { value: SolvedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unsolved", label: "Unsolved" },
  { value: "solved", label: "Solved" },
];

// ---------------------------------------------------------------------------
// Icons — same hand-authored 22x22 stroke-glyph convention as LandingPage/
// AuthForm (no icon package, no emoji), kept local to this page since nothing
// else currently needs them.
// ---------------------------------------------------------------------------

function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="9.5" cy="9.5" r="6.5" />
      <path d="M18.5 18.5l-4.2-4.2" />
    </svg>
  );
}

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)} width={14} height={14} viewBox="0 0 16 16">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)} width={13} height={13}>
      <path d="M4.5 11.3l3.6 3.6 9.4-9.8" />
    </svg>
  );
}

function EmptyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)} width={30} height={30}>
      <circle cx="9.5" cy="9.5" r="6.5" />
      <path d="M18.5 18.5l-4.2-4.2" />
      <path d="M7 9.5h5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ChipGroup — a segmented single-select control standing in for the old
// native <select> for the two filters with only a handful of fixed options
// (difficulty, solved status). Implemented as a real ARIA radiogroup with
// roving tabindex rather than a row of plain buttons: Tab enters/exits the
// group at the checked option, and Left/Right/Up/Down/Home/End move both
// selection and focus together, matching native radio-group behavior instead
// of only working with a mouse.
// ---------------------------------------------------------------------------

function ChipGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());

  function focusOption(v: T) {
    buttonRefs.current.get(v)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = options.findIndex((o) => o.value === value);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = options.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const next = options[nextIdx];
    onChange(next.value);
    focusOption(next.value);
  }

  return (
    <div className="chip-group" role="radiogroup" aria-label={legend} onKeyDown={handleKeyDown}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(o.value, el);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`chip${checked ? " chip-active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton — mirrors the real grid layout (rather than the generic
// PageLoading spinner used on the detail/progress pages) since this page's
// content *is* a grid; a shape-matched placeholder reads calmer here and
// avoids the layout jumping once data arrives. `aria-hidden` on the
// decorative grid plus a single live-region announcement covers screen
// readers without the visual pulse needing to “talk”.
// ---------------------------------------------------------------------------

function SkeletonGrid() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading challenges…
      </span>
      <div className="challenge-grid" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="challenge-card-skeleton">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-row">
              <div className="skeleton-pill" />
              <div className="skeleton-pill" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasActiveFilters, onClear }: { hasActiveFilters: boolean; onClear: () => void }) {
  return (
    <div className="empty-state-card">
      <EmptyIcon className="empty-state-icon" />
      <h3>No challenges match these filters</h3>
      <p className="muted">
        {hasActiveFilters
          ? "Try a different category or difficulty, or clear everything to see the full list."
          : "There aren't any challenges available yet."}
      </p>
      {hasActiveFilters && (
        <button className="btn btn-ghost btn-sm" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid — a single shared scroll-reveal trigger for the whole grid (one
// IntersectionObserver, not one per card), with each card's entrance staggered
// by index via a capped transition-delay. Reuses the exact `.reveal`/
// `.reveal.is-visible` classes and reduced-motion contract already
// established on the landing page.
// ---------------------------------------------------------------------------

function ChallengeGrid({ challenges }: { challenges: ChallengeSummary[] }) {
  const [ref, visible] = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={ref} className="challenge-grid">
      {challenges.map((c, i) => (
        <Link
          key={c.slug}
          to={`/challenges/${c.slug}`}
          className={`challenge-card reveal${visible ? " is-visible" : ""}${c.solved ? " solved" : ""}`}
          style={{ transitionDelay: visible ? `${Math.min(i, 12) * 35}ms` : "0ms" }}
        >
          {c.solved && (
            <span className="challenge-card-solved-pill">
              <CheckIcon /> Solved
            </span>
          )}
          <div className="challenge-card-title">{c.title}</div>
          <div className="row row-wrap">
            <DifficultyBadge difficulty={c.difficulty} />
            <span className="badge badge-neutral">{c.categoryName}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ChallengeListPage() {
  const challengesQuery = useChallenges();
  const categoriesQuery = useCategories();
  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [solved, setSolved] = useState<SolvedFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const challenges = challengesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return challenges.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (difficulty !== "all" && c.difficulty !== difficulty) return false;
      if (solved === "solved" && !c.solved) return false;
      if (solved === "unsolved" && c.solved) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [challengesQuery.data, category, difficulty, solved, search]);

  const isLoading = challengesQuery.isLoading || categoriesQuery.isLoading;
  const error = challengesQuery.error ?? categoriesQuery.error;

  const hasActiveFilters = category !== "all" || difficulty !== "all" || solved !== "all" || search.trim() !== "";

  function clearFilters() {
    setCategory("all");
    setDifficulty("all");
    setSolved("all");
    setSearch("");
  }

  const total = challengesQuery.data?.length ?? 0;
  const solvedCount = challengesQuery.data?.filter((c) => c.solved).length ?? 0;
  const solvedPct = total > 0 ? (solvedCount / total) * 100 : 0;

  return (
    <div className="page">
      <div className="challenges-header">
        <div>
          <span className="eyebrow">Practice queue</span>
          <h1>Challenges</h1>
          <p className="muted challenges-header-sub">
            Browse every incident, filter by category or difficulty, and jump back into one you haven't cracked yet.
          </p>
        </div>
        {challengesQuery.data && (
          <div className="challenges-progress">
            <span className="challenges-progress-count">
              <span className="tabular">{solvedCount}</span>
              <span className="muted"> / {total} solved</span>
            </span>
            <div className="progress-bar-track challenges-progress-track">
              <div className="progress-bar-fill" style={{ width: `${solvedPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "failed to load challenges"} />}

      {!isLoading && !error && (
        <div className="challenges-toolbar">
          <div className="challenges-toolbar-top">
            <label className="search-field" htmlFor="challenge-search">
              <SearchIcon className="search-field-icon" />
              <input
                id="challenge-search"
                type="search"
                placeholder="Search challenges by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <label className="select-field" htmlFor="category-filter">
              <span className="select-field-label">Category</span>
              <span className="select-wrap">
                <select
                  id="category-filter"
                  className="filter-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categoriesQuery.data?.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="select-arrow" />
              </span>
            </label>
          </div>

          <div className="challenges-toolbar-bottom">
            <div className="chip-field">
              <span className="chip-field-label" id="difficulty-filter-label">
                Difficulty
              </span>
              <ChipGroup legend="Filter by difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
            </div>
            <div className="chip-field">
              <span className="chip-field-label" id="solved-filter-label">
                Status
              </span>
              <ChipGroup legend="Filter by solved status" options={SOLVED_OPTIONS} value={solved} onChange={setSolved} />
            </div>
            {hasActiveFilters && (
              <button className="btn btn-ghost btn-sm challenges-clear-btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading && <SkeletonGrid />}

      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState hasActiveFilters={hasActiveFilters} onClear={clearFilters} />
      )}

      {!isLoading && !error && filtered.length > 0 && <ChallengeGrid challenges={filtered} />}
    </div>
  );
}
