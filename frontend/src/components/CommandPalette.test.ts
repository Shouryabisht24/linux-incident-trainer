import { describe, expect, it } from "vitest";
import { filterActions, type CommandAction } from "./CommandPalette";

// `filterActions` was pulled out of CommandPalette's inline `useMemo` body specifically so this
// substring-filter logic — the part of the palette most likely to grow real bugs (case-sensitivity,
// whitespace-only queries, etc.) — can be tested as a plain function, without needing to mount the
// component (which requires a router + react-query context to render at all).

function action(id: string, label: string): CommandAction {
  return { id, label, run: () => {} };
}

const actions: CommandAction[] = [
  action("nav-dashboard", "Dashboard"),
  action("nav-challenges", "Challenges"),
  action("nav-progress", "Progress"),
  action("challenge-disk-full", "disk-full-var-log"),
  action("logout", "Log out"),
];

describe("filterActions", () => {
  it("returns every action, unfiltered, for an empty query", () => {
    expect(filterActions(actions, "")).toEqual(actions);
  });

  it("returns every action for a whitespace-only query", () => {
    expect(filterActions(actions, "   ")).toEqual(actions);
  });

  it("filters to labels containing the query as a substring, preserving original order", () => {
    const result = filterActions(actions, "log");
    expect(result.map((a) => a.id)).toEqual(["challenge-disk-full", "logout"]);
  });

  it("is case-insensitive", () => {
    const result = filterActions(actions, "DASHBOARD");
    expect(result.map((a) => a.id)).toEqual(["nav-dashboard"]);
  });

  it("trims surrounding whitespace from the query before matching", () => {
    const result = filterActions(actions, "  progress  ");
    expect(result.map((a) => a.id)).toEqual(["nav-progress"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterActions(actions, "zzz-no-match")).toEqual([]);
  });
});
