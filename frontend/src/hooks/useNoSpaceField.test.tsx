import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { stripWhitespace, useNoSpaceField } from "./useNoSpaceField";

/** Minimal controlled input wired straight to the hook's handlers — mirrors exactly how
 * `AuthForm`/the profile page's password fields consume it, so firing real DOM events against this
 * exercises the same three code paths the hook documents (keydown block, paste-strip, change
 * backstop) rather than calling the handlers in isolation. */
function NoSpaceInput() {
  const { value, onChange, onKeyDown, onPaste } = useNoSpaceField();
  return <input aria-label="credential" value={value} onChange={onChange} onKeyDown={onKeyDown} onPaste={onPaste} />;
}

describe("stripWhitespace", () => {
  it("removes spaces, tabs, and newlines", () => {
    expect(stripWhitespace("a b\tc\nd e")).toBe("abcde");
  });

  it("leaves whitespace-free strings untouched", () => {
    expect(stripWhitespace("abcde")).toBe("abcde");
  });
});

describe("useNoSpaceField", () => {
  it("blocks a typed space via keydown (preventDefault called, value unchanged)", () => {
    render(<NoSpaceInput />);
    const input = screen.getByLabelText("credential") as HTMLInputElement;

    // fireEvent.* returns false when preventDefault() was called on a cancelable event — the
    // hook's onKeyDown does exactly that for the spacebar.
    const notPrevented = fireEvent.keyDown(input, { key: " " });
    expect(notPrevented).toBe(false);

    // No change event follows a blocked keydown in a real browser either — the space never lands
    // in the DOM value, so the hook's own state stays exactly as it started.
    expect(input.value).toBe("");
  });

  it("does not block a non-space key via keydown", () => {
    render(<NoSpaceInput />);
    const input = screen.getByLabelText("credential") as HTMLInputElement;

    const notPrevented = fireEvent.keyDown(input, { key: "a" });
    expect(notPrevented).toBe(true);
  });

  it("strips whitespace from pasted text while preserving the rest, at the paste site", () => {
    render(<NoSpaceInput />);
    const input = screen.getByLabelText("credential") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "hunter" } });
    input.setSelectionRange(3, 3); // caret between "hun" and "ter"

    fireEvent.paste(input, {
      clipboardData: { getData: () => " 2 " },
    });

    // "hun" + stripped("  2  ") + "ter" -> "hun2ter"
    expect(input.value).toBe("hun2ter");
  });

  it("strips whitespace on a programmatic change event as a backstop", () => {
    render(<NoSpaceInput />);
    const input = screen.getByLabelText("credential") as HTMLInputElement;

    // Simulates a path that bypasses both keydown and paste (autofill, drag-and-drop, IME commit)
    // by firing `change` directly with a value that already contains whitespace.
    fireEvent.change(input, { target: { value: "hu nt er" } });

    expect(input.value).toBe("hunter");
  });
});
