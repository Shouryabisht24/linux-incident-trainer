import { useEffect, type PointerEvent, type SVGProps } from "react";
import { MarketingLayout } from "../components/MarketingLayout";
import { Reveal } from "../components/ui";

// ---------------------------------------------------------------------------
// Icons — small hand-authored line icons (no icon package dependency, no
// emoji). Each is a plain 22x22 stroke glyph. Moved here verbatim from
// LandingPage.tsx — this is the only page that still needs them once Features
// moved out into its own route.
// ---------------------------------------------------------------------------

function IconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 22,
    height: 22,
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

function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)}>
      <rect x="2" y="3.5" width="18" height="15" rx="2" />
      <path d="M6 8.5l3 2.5-3 2.5" />
      <path d="M11.5 13.5h4.5" />
    </svg>
  );
}

function CheckShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)}>
      <path d="M11 2.5l7 2.6v5.2c0 4.4-3 7.3-7 9.2-4-1.9-7-4.8-7-9.2V5.1z" />
      <path d="M7.7 11.2l2.2 2.2 4.4-4.6" />
    </svg>
  );
}

function StepsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)}>
      <path d="M3 17.5h4v-4H3z" />
      <path d="M9 12.5h4v-8H9z" />
      <path d="M15 17.5h4v-10h-4z" />
    </svg>
  );
}

function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
      <rect x="12.5" y="2.5" width="7" height="7" rx="1.2" />
      <rect x="2.5" y="12.5" width="7" height="7" rx="1.2" />
      <rect x="12.5" y="12.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)}>
      <path d="M11 2.7l7.5 4.3v8L11 19.3l-7.5-4.3v-8z" />
      <path d="M3.5 7l7.5 4.3 7.5-4.3" />
      <path d="M11 11.3v8" />
    </svg>
  );
}

function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)}>
      <path d="M4 11a7 7 0 0 1 12-4.9l1.5 1.5" />
      <path d="M17.5 3.5v4.4H13" />
      <path d="M18 11a7 7 0 0 1-12 4.9l-1.5-1.5" />
      <path d="M4.5 18.5v-4.4H9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Moves the spotlight-glow's origin to the pointer position via a plain DOM
// style mutation, not React state — same pattern as LandingPage.tsx's
// `handleSpotlightMove` (duplicated here rather than extracted to a shared
// hook, per this codebase's existing convention for this bare pure function).
// ---------------------------------------------------------------------------

function handleSpotlightMove(e: PointerEvent<HTMLDivElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
}

// Each card names the real file in this codebase that actually backs its claim (every path below
// exists verbatim under challenges/*/ or backend/src/) — a small structural device that encodes
// something true about the product rather than decorating the card, extending the "monospace as
// visual language" idea past the single hero terminal into every card on the page.
//
// `perm` is that same file's real `ls -l` mode string: scripts a challenge author actually runs
// (seed.sh, check.sh) are executable (-rwxr-xr-x), everything else — TS source compiled/run by
// node rather than invoked directly, or plain JSON data — is not (-rw-r--r--). Rendered character
// by character in FeaturesSection below so the `x` bits alone pick up `--color-success`, matching
// how a real colorized `ls -l` highlights executables — a detail that only exists because these
// really are files on disk with real permission bits, not an invented badge.
const FEATURES = [
  {
    icon: BoxIcon,
    file: "seed.sh",
    perm: "-rwxr-xr-x",
    title: "A genuinely broken container",
    body: "Every challenge boots a real Docker container running a real service — nginx, systemd, cron, sshd — with an actual production-style fault baked in. There's no simulated filesystem pretending to be broken.",
  },
  {
    icon: TerminalIcon,
    file: "terminalSocket.ts",
    perm: "-rw-r--r--",
    title: "A live shell, not a video",
    body: "Your terminal streams over a WebSocket straight into the container via xterm.js. Run the same commands you'd run on call — ps, systemctl, journalctl, chmod — and get real output back.",
  },
  {
    icon: CheckShieldIcon,
    file: "check.sh",
    perm: "-rwxr-xr-x",
    title: "Verified, not multiple choice",
    body: "Each challenge ships an automated check that inspects the container's actual state after your fix. It passes because the service is really back up — not because you picked option B.",
  },
  {
    icon: StepsIcon,
    file: "hints.json",
    perm: "-rw-r--r--",
    title: "Hints, then the full solution",
    body: "Stuck? Reveal hints one at a time before falling back to a complete written solution. Nothing is spoiled up front.",
  },
  {
    icon: GridIcon,
    file: "challenge.json",
    perm: "-rw-r--r--",
    title: "Ten real incident categories",
    body: "Permissions, disk & filesystem, process & performance, networking & DNS, systemd, logs, package management, users & sudo, cron, and SSH — the categories that actually page people.",
  },
  {
    icon: RefreshIcon,
    file: "session.service.ts",
    perm: "-rw-r--r--",
    title: "Ephemeral, isolated, resumable",
    body: "Every container has its own CPU/memory/process limits and no outbound network by default, and tears itself down when you're done or idle. Refresh mid-challenge and your terminal reconnects right where you left off.",
  },
];

function FeaturesSection() {
  return (
    <section className="section" aria-labelledby="features-heading">
      <div className="marketing-page-header marketing-page-header--features">
        <Reveal>
          <div className="section-head">
            <span className="section-kicker">
              <span className="kicker-prompt">~/</span>features
            </span>
            <h2 id="features-heading" className="gradient-heading">
              What you're actually getting
            </h2>
            <p className="muted section-sub">Everything below is a real feature of the running app, not marketing shorthand.</p>
          </div>
        </Reveal>
      </div>
      <div className="features-grid">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delayMs={(i % 3) * 80} className="feature-card" onPointerMove={handleSpotlightMove}>
            <span className="feature-card-tab">
              <span className="feature-card-tab-perm" aria-hidden="true">
                {f.perm.split("").map((ch, chIdx) => (
                  <span key={chIdx} className={ch === "x" ? "feature-card-tab-perm-x" : undefined}>
                    {ch}
                  </span>
                ))}
              </span>
              <span className="feature-card-tab-dot" aria-hidden="true" />
              {f.file}
            </span>
            <span className="feature-icon-chip">
              <f.icon className="feature-icon" />
            </span>
            <div className="feature-copy">
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function FeaturesPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Features — Linux Incident Trainer";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <MarketingLayout>
      <FeaturesSection />
    </MarketingLayout>
  );
}
