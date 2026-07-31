import { describe, expect, it } from "vitest";
import { detectCelebration, snapshotProgress, type ProgressSnapshot } from "./ChallengeDetailPage";

// Both functions are plain data-in/data-out (no React, no mocking needed) — `snapshotProgress` reads
// the react-query `useProgress()` shape, `detectCelebration` diffs a before/after pair of it.

type Progress = { solved: number; categories: { slug: string; solved: number; total: number }[] };
type ProgressWithNames = {
  solved: number;
  categories: { slug: string; name: string; solved: number; total: number }[];
};

describe("snapshotProgress", () => {
  it("returns null when progress data isn't loaded yet", () => {
    expect(snapshotProgress(undefined, "linux-basics")).toBeNull();
  });

  it("returns null when the category isn't present in progress data", () => {
    const progress: Progress = { solved: 2, categories: [{ slug: "networking", solved: 2, total: 3 }] };
    expect(snapshotProgress(progress, "linux-basics")).toBeNull();
  });

  it("captures the matching category's counts alongside the overall solved total", () => {
    const progress: Progress = {
      solved: 5,
      categories: [
        { slug: "networking", solved: 2, total: 3 },
        { slug: "linux-basics", solved: 1, total: 4 },
      ],
    };
    expect(snapshotProgress(progress, "linux-basics")).toEqual<ProgressSnapshot>({
      totalSolved: 5,
      categorySlug: "linux-basics",
      categorySolved: 1,
      categoryTotal: 4,
    });
  });
});

describe("detectCelebration", () => {
  const category = (overrides: Partial<{ slug: string; name: string; solved: number; total: number }> = {}) => ({
    slug: "linux-basics",
    name: "Linux Basics",
    solved: 1,
    total: 3,
    ...overrides,
  });

  it("returns null when there's no before snapshot (e.g. category not found pre-check)", () => {
    const after: ProgressWithNames = { solved: 1, categories: [category()] };
    expect(detectCelebration(null, after)).toBeNull();
  });

  it("returns null when there's no fresh after data", () => {
    const before: ProgressSnapshot = { totalSolved: 0, categorySlug: "linux-basics", categorySolved: 0, categoryTotal: 3 };
    expect(detectCelebration(before, undefined)).toBeNull();
  });

  it("detects a first-ever solve (totalSolved 0 -> 1)", () => {
    const before: ProgressSnapshot = { totalSolved: 0, categorySlug: "linux-basics", categorySolved: 0, categoryTotal: 3 };
    const after: ProgressWithNames = { solved: 1, categories: [category({ solved: 1, total: 3 })] };
    expect(detectCelebration(before, after)).toEqual({ kind: "first-solve" });
  });

  it("detects category-complete when the category's solved count reaches its total", () => {
    const before: ProgressSnapshot = { totalSolved: 4, categorySlug: "linux-basics", categorySolved: 2, categoryTotal: 3 };
    const after: ProgressWithNames = { solved: 5, categories: [category({ solved: 3, total: 3 })] };
    expect(detectCelebration(before, after)).toEqual({ kind: "category-complete", categoryName: "Linux Basics" });
  });

  it("fires neither on a re-check of an already-solved challenge (counts unchanged)", () => {
    const before: ProgressSnapshot = { totalSolved: 5, categorySlug: "linux-basics", categorySolved: 3, categoryTotal: 3 };
    const after: ProgressWithNames = { solved: 5, categories: [category({ solved: 3, total: 3 })] };
    expect(detectCelebration(before, after)).toBeNull();
  });

  it("does not fire category-complete for a category that was already fully solved before this check", () => {
    // before.categorySolved (3) is already == before.categoryTotal (3): the category-complete branch
    // requires `before.categorySolved < before.categoryTotal`, i.e. it must have been incomplete
    // *before* this check for completing it now to count as a fresh celebration.
    const before: ProgressSnapshot = { totalSolved: 3, categorySlug: "linux-basics", categorySolved: 3, categoryTotal: 3 };
    const after: ProgressWithNames = { solved: 4, categories: [category({ solved: 3, total: 3 })] };
    expect(detectCelebration(before, after)).toBeNull();
  });

  it("prioritizes first-solve over category-complete when both conditions are true at once", () => {
    // A user's very first solve, in a single-challenge category: totalSolved goes 0 -> 1 *and* the
    // category's solved count reaches its total in the same check. The implementation checks
    // first-solve first and returns immediately, so it wins the tie-break.
    const before: ProgressSnapshot = { totalSolved: 0, categorySlug: "linux-basics", categorySolved: 0, categoryTotal: 1 };
    const after: ProgressWithNames = { solved: 1, categories: [category({ solved: 1, total: 1 })] };
    expect(detectCelebration(before, after)).toEqual({ kind: "first-solve" });
  });
});
