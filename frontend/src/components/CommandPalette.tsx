import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useChallenges } from "../api/queries";
import { useAuth } from "../context/AuthContext";

interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * Cmd+K / Ctrl+K command palette. Mounted once inside RequireAuth (the single place every
 * authenticated route already renders through), so its open/close state lives there — no separate
 * Context needed since nothing outside that tree can trigger it.
 *
 * Keyboard model is a standard ARIA combobox-listbox: DOM focus never leaves the text input (so
 * typing always keeps working), while `aria-activedescendant` + `role="option"`/`aria-selected`
 * track the highlighted row for assistive tech. This is deliberately different from
 * ChallengeListPage's `ChipGroup`, which moves literal DOM focus between a small fixed set of
 * radio-style buttons — that pattern fits a handful of static options, not a live-filtered search
 * list where the input must stay focused while the list churns underneath it.
 */
export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const challengesQuery = useChallenges();

  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions = useMemo<CommandAction[]>(() => {
    const nav: CommandAction[] = [
      { id: "nav-dashboard", label: "Dashboard", run: () => navigate("/dashboard") },
      { id: "nav-challenges", label: "Challenges", run: () => navigate("/challenges") },
      { id: "nav-progress", label: "Progress", run: () => navigate("/progress") },
      { id: "nav-profile", label: "Profile", run: () => navigate("/profile") },
      { id: "nav-help", label: "Help", run: () => navigate("/help") },
    ];
    const challenges: CommandAction[] = (challengesQuery.data ?? []).map((c) => ({
      id: `challenge-${c.slug}`,
      label: c.title,
      hint: c.categoryName,
      run: () => navigate(`/challenges/${c.slug}`),
    }));
    const account: CommandAction[] = [{ id: "logout", label: "Log out", run: () => logout() }];
    return [...nav, ...challenges, ...account];
  }, [challengesQuery.data, navigate, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  // Reset to the first result whenever the filtered set changes shape (typing, or the palette
  // reopening) so the highlight never points past the end of a shorter list.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement;
    setQuery("");
    setHighlightedIndex(0);
    // Focus after the panel actually mounts/paints.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  function close() {
    onClose();
    const prev = previousActiveElement.current;
    if (prev instanceof HTMLElement) prev.focus();
  }

  function activate(action: CommandAction | undefined) {
    if (!action) return;
    close();
    action.run();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setHighlightedIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setHighlightedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      activate(filtered[highlightedIndex]);
      return;
    }
    if (e.key === "Tab") {
      // Focus trap: the input is the only focusable element in the panel (list rows activate via
      // click/Enter, not Tab), so keep focus pinned here rather than letting it escape to whatever
      // sits behind the backdrop.
      e.preventDefault();
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`#cmdk-option-${highlightedIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  if (!isOpen) return null;

  const activeId = filtered.length > 0 ? `cmdk-option-${highlightedIndex}` : undefined;

  return (
    <div className="cmdk-backdrop" onMouseDown={close}>
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="cmdk-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          placeholder="Jump to a page or challenge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div id="cmdk-list" className="cmdk-list" role="listbox" aria-label="Actions" ref={listRef}>
          {filtered.length === 0 && <div className="cmdk-empty">No matches.</div>}
          {filtered.map((action, i) => (
            <div
              key={action.id}
              id={`cmdk-option-${i}`}
              role="option"
              aria-selected={i === highlightedIndex}
              className={`cmdk-option${i === highlightedIndex ? " cmdk-option-active" : ""}`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                activate(action);
              }}
            >
              <span>{action.label}</span>
              {action.hint && <span className="cmdk-option-hint">{action.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
