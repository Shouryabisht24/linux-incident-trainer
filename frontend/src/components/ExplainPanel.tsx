import { useState, type SVGProps } from "react";
import type { ExplainStep } from "../api/client";

// ---------------------------------------------------------------------------
// Explain panel — a lightweight, always-available, step-by-step walkthrough of
// the REASONING behind a challenge's fix, distinct from both Hints (progressive,
// tracked against the user via hints_used) and Solution (the full fix, gated
// behind a "this ends the challenge" confirm in ChallengeDetailPage.tsx). This
// panel costs nothing, never ends the challenge, and can be opened/closed
// freely at any point while a session is running — plain local component
// state, no query invalidation or session mutation involved.
//
// Same hand-authored 20x20 stroke-glyph convention as ChallengeDetailPage's
// CheckCircleIcon/XCircleIcon (no icon package, no emoji), kept local to this
// file since the ones in ChallengeDetailPage.tsx aren't exported.
// ---------------------------------------------------------------------------

function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 16,
    height: 16,
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg {...iconProps({ className: `explain-toggle-chevron${open ? " is-open" : ""}` })}>
      <path d="M6 8.5l5 5 5-5" />
    </svg>
  );
}

function CompassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8.5" />
      <path d="M14.2 7.8l-2 4.4-4.4 2 2-4.4z" />
    </svg>
  );
}

interface ExplainPanelProps {
  steps: ExplainStep[];
}

/**
 * Renders nothing at all — not even the toggle button — when the challenge has no explain.json
 * yet (most of them, for now; see decisions/00NN-*.md). This is the "graceful absence" the spec
 * calls for: an empty panel would read as broken, so the whole feature just doesn't appear.
 */
export function ExplainPanel({ steps }: ExplainPanelProps) {
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className="explain-panel">
      <button
        type="button"
        className="btn explain-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CompassIcon />
        {open ? "Hide walkthrough" : "Walk me through it"}
        <ChevronIcon open={open} />
      </button>

      <div className={`explain-collapse${open ? " is-open" : ""}`}>
        <div className="explain-collapse-inner">
          <div className="card explain-steps-card">
            <span className="kicker-line">$ explain --reasoning</span>
            <h3>How to think about this one</h3>
            <p className="explain-panel-note">
              The reasoning behind the fix, not the exact commands — reading this doesn't cost
              anything and won't end your session.
            </p>
            <ol className="explain-steps">
              {steps.map((step) => (
                <li key={step.order_index} className="explain-step">
                  <span className="explain-step-index">{step.order_index}</span>
                  <div className="explain-step-body">
                    <h4>{step.title}</h4>
                    <p>{step.explanation}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
