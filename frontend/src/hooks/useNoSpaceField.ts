import { useCallback, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";

/** Strips every whitespace character (space, tab, newline) — used both as the paste-time filter
 * and as a change-time backstop, so no whitespace can end up in the field regardless of how it got
 * there (typed, pasted, dragged in, autofilled). */
export function stripWhitespace(value: string): string {
  return value.replace(/\s/g, "");
}

/**
 * Backs a single-line credential input (email/password) that must never contain a space:
 * - `onKeyDown` blocks the spacebar outright, so a space never visibly appears while typing.
 * - `onPaste` strips whitespace from the pasted text specifically (rather than blocking the paste
 *   entirely) and re-inserts the cleaned text at the cursor, preserving caret position.
 * - `onChange` re-applies the same stripping as a backstop for any other path text can arrive by
 *   (IME composition, drag-and-drop, browser autofill).
 *
 * Shared by every credential-style field in the app (login/signup in `AuthForm`, the password
 * fields on the profile page's change-password form) so the no-whitespace behavior stays identical
 * everywhere rather than drifting across separate copies.
 */
export function useNoSpaceField(initial = "") {
  const [value, setValue] = useState(initial);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(stripWhitespace(e.target.value));
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") e.preventDefault();
  }, []);

  const onPaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const input = e.currentTarget;
    const cleaned = stripWhitespace(e.clipboardData.getData("text"));
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + cleaned + input.value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const pos = start + cleaned.length;
      input.setSelectionRange(pos, pos);
    });
  }, []);

  return { value, setValue, onChange, onKeyDown, onPaste };
}
