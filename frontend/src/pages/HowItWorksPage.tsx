import { useEffect } from "react";
import { MarketingLayout } from "../components/MarketingLayout";
import { Reveal } from "../components/ui";

// The "$ cmd" line per step is a real, literal call the app actually makes at that point in the
// flow (a documented API route, or a shell command genuinely run inside the challenge terminal —
// the same kind already shown in the hero transcript) — not an invented CLI, per this page's
// existing "no fake trust signals" rule (decisions/0012-*.md).
const WALKTHROUGH_STEPS = [
  {
    title: "Start a session",
    cmd: "POST /api/challenges/:slug/sessions",
    body: "Pick a challenge — say, a systemd unit that won't start — and a fresh container boots with the incident already live inside it.",
  },
  {
    title: "Get a live shell",
    cmd: "wss://…/ws/terminal?ticket=…",
    body: "A terminal streams straight into the box, running as an unprivileged trainee user, same as a real production host.",
  },
  {
    title: "Find the break",
    cmd: "systemctl status app.service",
    body: "Run the commands you'd actually reach for: journalctl -xe, ls -la, curl localhost. The failure is real, so the output is real too.",
  },
  {
    title: "Fix it for real",
    cmd: "vim /etc/systemd/system/app.service",
    body: "Edit the config, correct the permission, restart the service — whatever the incident actually requires. Nothing here is a fill-in-the-blank.",
  },
  {
    title: "Check your fix",
    cmd: "POST /api/sessions/:id/check",
    body: "Click \"Check my fix\" and a script inspects the container's live state. Pass, and it's marked solved. Fail, and you keep digging — or reveal a hint.",
  },
];

function WalkthroughSection() {
  return (
    <section className="section" aria-labelledby="walkthrough-heading">
      <div className="marketing-page-header marketing-page-header--how-it-works">
        <Reveal>
          <div className="section-head">
            <span className="section-kicker">
              <span className="kicker-prompt">~/</span>how-it-works
            </span>
            <h2 id="walkthrough-heading">What solving one incident actually looks like</h2>
            <p className="muted section-sub">The same five steps, every time — no two challenges break the same way.</p>
          </div>
        </Reveal>
      </div>
      {/* The second, distinct appearance of the terminal motif on the page (the first being the
          hero) — a real annotated-script presentation, not a numbered-card list. Kept light
          (unlike the hero/self-host code block, which stay dark by established convention) since
          this panel is a code-editor-style device for these five steps, not a depiction of the
          product's actual dark terminal — see decisions/0019-*.md and the CSS comment above
          `.walkthrough-terminal`. */}
      <Reveal className="walkthrough-terminal">
        <div className="walkthrough-terminal-bar">
          <span className="walkthrough-terminal-dot" />
          <span className="walkthrough-terminal-dot" />
          <span className="walkthrough-terminal-dot" />
          <span className="walkthrough-terminal-title">walkthrough.sh</span>
        </div>
        <ol className="walkthrough-list">
          {WALKTHROUGH_STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal as="div" delayMs={i * 70} className="walkthrough-step">
                <span className="walkthrough-index tabular" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="walkthrough-comment">
                  <span className="kicker-prompt">#</span>
                  {step.title}
                </p>
                <code className="walkthrough-cmd">$ {step.cmd}</code>
                <p className="muted">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

export function HowItWorksPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "How it works — Linux Incident Trainer";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <MarketingLayout>
      <WalkthroughSection />
    </MarketingLayout>
  );
}
