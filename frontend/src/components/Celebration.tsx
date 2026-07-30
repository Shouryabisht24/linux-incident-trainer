import { useEffect, type SVGProps } from "react";

// ---------------------------------------------------------------------------
// A milestone banner for two triggers ChallengeDetailPage detects purely from
// existing progress data (no new backend endpoint): the very first challenge
// a user ever solves, and a category reaching 100% solved for the first time.
// Deliberately its own component rather than a new `ToastContext` kind — see
// the CSS comment above `.celebration-wrap` in styles.css for the reasoning.
// ---------------------------------------------------------------------------

export type CelebrationKind = "first-solve" | "category-complete";

interface CelebrationProps {
  kind: CelebrationKind;
  /** Required when kind === "category-complete"; ignored otherwise. */
  categoryName?: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 6000;

// Same hand-authored 22x22 stroke-glyph convention as every other icon in
// this app (see DashboardPage.tsx/ChallengeListPage.tsx) — no icon package,
// no emoji.
function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

function CheckBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8.5" />
      <path d="M7 11.3l2.8 2.8 5.2-5.6" />
    </svg>
  );
}

function StarBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 3.3l2.1 4.6 5 .6-3.7 3.4.9 5-4.3-2.5-4.3 2.5.9-5-3.7-3.4 5-.6z" />
    </svg>
  );
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)} width={13} height={13} strokeWidth={1.8}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

const COPY: Record<CelebrationKind, (categoryName?: string) => { title: string; body: string }> = {
  "first-solve": () => ({
    title: "First incident solved.",
    body: "That one's fixed. The rest of the queue is still broken — go pick another.",
  }),
  "category-complete": (categoryName) => ({
    title: `${categoryName ?? "Category"}: cleared.`,
    body: `Every challenge in ${categoryName ?? "this category"} is now solved. Move on to another category, or revisit one for practice.`,
  }),
};

export function Celebration({ kind, categoryName, onDismiss }: CelebrationProps) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
    // onDismiss identity isn't guaranteed stable across renders, but re-arming the
    // same fixed-length timer on every render is harmless here (there's nothing
    // else to lose by resetting it) and keeps this effect simple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { title, body } = COPY[kind](categoryName);

  return (
    <div className="celebration-wrap">
      <div className="celebration" role="status" aria-live="polite">
        <span className="celebration-icon-chip">
          {kind === "first-solve" ? <CheckBadgeIcon /> : <StarBadgeIcon />}
        </span>
        <div className="celebration-copy">
          <div className="celebration-title text-shine">{title}</div>
          <p className="celebration-body">{body}</p>
        </div>
        <button className="celebration-close" onClick={onDismiss} aria-label="Dismiss">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
