import { useEffect, useState, type MouseEvent, type ReactNode, type RefObject, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { useCountUp } from "../hooks/useCountUp";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { usePublicStats } from "../api/queries";

// ---------------------------------------------------------------------------
// Icons — small hand-authored line icons (no icon package dependency, no
// emoji). Each is a plain 22x22 stroke glyph.
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

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)} width={16} height={16} viewBox="0 0 16 16">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Reveal — scroll-triggered fade/rise wrapper. Purely presentational; the
// visibility bookkeeping lives in useScrollReveal so every section can share
// the exact same animation contract (and the exact same reduced-motion
// escape hatch).
// ---------------------------------------------------------------------------

function Reveal({
  children,
  delayMs = 0,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  as?: "div" | "li" | "details";
}) {
  const [ref, visible] = useScrollReveal<HTMLElement>();
  const Tag = as as "div";
  return (
    <Tag
      ref={ref as unknown as RefObject<HTMLDivElement>}
      className={`reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface StatDef {
  value: number;
  suffix: string;
  label: string;
}

function StatTile({ stat, start, staggerMs }: { stat: StatDef; start: boolean; staggerMs: number }) {
  // Each tile counts up over a slightly longer duration than the last, so they finish in a gentle
  // cascade rather than all landing on their final value in the same instant.
  const count = useCountUp(stat.value, start, 1200 + staggerMs);
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">
        <span className="tabular">{count}</span>
        {stat.suffix}
      </div>
      <div className="stat-tile-label">{stat.label}</div>
    </div>
  );
}

function StatsSection() {
  // Fall back to the last-known-real counts (27 challenges / 10 categories, as of this build) if
  // the endpoint is briefly unreachable — never blocks the section, never shows a broken "0".
  const { data } = usePublicStats();
  const challengeCount = data?.challengeCount ?? 27;
  const categoryCount = data?.categoryCount ?? 10;
  const [ref, visible] = useScrollReveal<HTMLDivElement>();

  const stats: StatDef[] = [
    { value: challengeCount, suffix: "", label: "hands-on incidents" },
    { value: categoryCount, suffix: "", label: "failure categories" },
    { value: 100, suffix: "%", label: "real containers, zero simulations" },
  ];

  return (
    <section className="stats-section" aria-label="By the numbers">
      <div ref={ref} className={`stats-grid reveal${visible ? " is-visible" : ""}`}>
        {stats.map((s, i) => (
          <StatTile key={s.label} stat={s} start={visible} staggerMs={i * 220} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: BoxIcon,
    title: "A genuinely broken container",
    body: "Every challenge boots a real Docker container running a real service — nginx, systemd, cron, sshd — with an actual production-style fault baked in. There's no simulated filesystem pretending to be broken.",
  },
  {
    icon: TerminalIcon,
    title: "A live shell, not a video",
    body: "Your terminal streams over a WebSocket straight into the container via xterm.js. Run the same commands you'd run on call — ps, systemctl, journalctl, chmod — and get real output back.",
  },
  {
    icon: CheckShieldIcon,
    title: "Verified, not multiple choice",
    body: "Each challenge ships an automated check that inspects the container's actual state after your fix. It passes because the service is really back up — not because you picked option B.",
  },
  {
    icon: StepsIcon,
    title: "Hints, then the full solution",
    body: "Stuck? Reveal hints one at a time before falling back to a complete written solution. Nothing is spoiled up front.",
  },
  {
    icon: GridIcon,
    title: "Ten real incident categories",
    body: "Permissions, disk & filesystem, process & performance, networking & DNS, systemd, logs, package management, users & sudo, cron, and SSH — the categories that actually page people.",
  },
  {
    icon: RefreshIcon,
    title: "Ephemeral, isolated, resumable",
    body: "Every container has its own CPU/memory/process limits and no outbound network by default, and tears itself down when you're done or idle. Refresh mid-challenge and your terminal reconnects right where you left off.",
  },
];

const WALKTHROUGH_STEPS = [
  {
    title: "Start a session",
    body: "Pick a challenge — say, a systemd unit that won't start — and a fresh container boots with the incident already live inside it.",
  },
  {
    title: "Get a live shell",
    body: "A terminal streams straight into the box, running as an unprivileged trainee user, same as a real production host.",
  },
  {
    title: "Find the break",
    body: "Run the commands you'd actually reach for: systemctl status, journalctl -xe, ls -la, curl localhost. The failure is real, so the output is real too.",
  },
  {
    title: "Fix it for real",
    body: "Edit the config, correct the permission, restart the service — whatever the incident actually requires. Nothing here is a fill-in-the-blank.",
  },
  {
    title: "Check your fix",
    body: "Click \"Check my fix\" and a script inspects the container's live state. Pass, and it's marked solved. Fail, and you keep digging — or reveal a hint.",
  },
];

const FAQS = [
  {
    q: "Does this touch my actual machine?",
    a: "No. Every incident runs inside an ephemeral, resource-limited Docker container — capped CPU, memory, and process count, no outbound network by default. Nothing you do inside a challenge reaches the host.",
  },
  {
    q: "Do I need Docker installed?",
    a: "Only if you're the one self-hosting the app. As someone using an already-running instance, all you need is a browser — the terminal streams over WebSocket, no local Docker required on your end.",
  },
  {
    q: "Is my progress saved?",
    a: "Yes. Solved challenges, hints used, and best attempts are tracked per account, and an in-progress session automatically resumes if you refresh the page or come back later.",
  },
  {
    q: "What if I get stuck?",
    a: "Reveal hints one at a time, and if you're still stuck, reveal the full written solution as a last resort. Neither counts against you beyond showing up in your own history.",
  },
  {
    q: "Is this free?",
    a: "Yes — it's a free, self-hosted, single-instance tool. No billing, no tiers, no seat limits. Just the Docker Compose stack.",
  },
  {
    q: "Can I run more than one challenge at once?",
    a: "No, deliberately — one live session per account at a time. Starting a new one automatically tears down whatever you had running.",
  },
];

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function LandingNav() {
  const [condensed, setCondensed] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setCondensed(window.scrollY > 24);
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToId(id: string) {
    return (e: MouseEvent) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    };
  }

  return (
    <header className={`landing-nav${condensed ? " condensed" : ""}`}>
      <div className="landing-nav-inner">
        <a href="#top" className="landing-brand" onClick={scrollToId("top")}>
          Linux Incident Trainer
        </a>
        <nav className="landing-nav-links" aria-label="Page sections">
          <a href="#features" onClick={scrollToId("features")}>
            Features
          </a>
          <a href="#walkthrough" onClick={scrollToId("walkthrough")}>
            How it works
          </a>
          <a href="#self-host" onClick={scrollToId("self-host")}>
            Self-hosting
          </a>
          <a href="#faq" onClick={scrollToId("faq")}>
            FAQ
          </a>
        </nav>
        <div className="landing-nav-cta">
          <Link to="/login" className="btn btn-ghost btn-sm">
            Log in
          </Link>
          <Link to="/login?mode=signup" className="btn btn-primary btn-sm">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroTerminal() {
  return (
    <div className="hero-terminal" role="img" aria-label="Terminal session diagnosing and fixing a failed systemd service">
      <div className="hero-terminal-bar">
        <span className="hero-terminal-dot" style={{ background: "var(--color-danger)" }} />
        <span className="hero-terminal-dot" style={{ background: "var(--color-warning)" }} />
        <span className="hero-terminal-dot" style={{ background: "var(--color-success)" }} />
        <span className="hero-terminal-title">trainee@systemd-crashloop</span>
      </div>
      <pre className="hero-terminal-body">
        <span className="t-prompt">trainee@systemd-crashloop:~$ </span>
        <span className="t-cmd">systemctl status app.service</span>
        {"\n"}
        <span className="t-danger">● app.service - Demo Application</span>
        {"\n"}
        {"   Active: "}
        <span className="t-danger">failed (Result: exit-code)</span>
        {"\n"}
        {"   Process: ExecStart=/usr/bin/demo-app-typo (code=exited, status=203/EXEC)"}
        {"\n\n"}
        <span className="t-prompt">trainee@systemd-crashloop:~$ </span>
        <span className="t-cmd">sudo sed -i 's/demo-app-typo/demo-app/' /etc/systemd/system/app.service</span>
        {"\n"}
        <span className="t-prompt">trainee@systemd-crashloop:~$ </span>
        <span className="t-cmd">sudo systemctl daemon-reload && sudo systemctl restart app.service</span>
        {"\n"}
        <span className="t-prompt">trainee@systemd-crashloop:~$ </span>
        <span className="t-cmd">systemctl is-active app.service</span>
        {"\n"}
        <span className="t-success">active</span>
        <span className="hero-terminal-cursor" aria-hidden="true" />
      </pre>
    </div>
  );
}

function Hero() {
  const reducedMotion = useReducedMotion();

  function scrollToWalkthrough(e: MouseEvent) {
    e.preventDefault();
    document.getElementById("walkthrough")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="eyebrow">Not a quiz. Not a video course.</span>
        <h1>Practice production incidents on a Linux box that's actually broken.</h1>
        <p className="hero-sub">
          Linux Incident Trainer drops you into a live terminal inside a genuinely broken Docker container —
          misconfigured services, full disks, masked units, bad sudoers — and checks whether you actually fixed
          it.
        </p>
        <div className="hero-cta-row">
          <Link to="/login?mode=signup" className="btn btn-primary btn-lg">
            Get started
          </Link>
          <a href="#walkthrough" className="btn btn-ghost btn-lg" onClick={scrollToWalkthrough}>
            See how it works
          </a>
        </div>
      </div>
      <div className="hero-visual">
        <HeroTerminal />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function FeaturesSection() {
  return (
    <section className="section" id="features" aria-labelledby="features-heading">
      <Reveal>
        <div className="section-head">
          <h2 id="features-heading">What you're actually getting</h2>
          <p className="muted section-sub">Everything below is a real feature of the running app, not marketing shorthand.</p>
        </div>
      </Reveal>
      <div className="features-grid">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delayMs={(i % 3) * 80} className="feature-card">
            <f.icon className="feature-icon" />
            <h3>{f.title}</h3>
            <p className="muted">{f.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function WalkthroughSection() {
  return (
    <section className="section" id="walkthrough" aria-labelledby="walkthrough-heading">
      <Reveal>
        <div className="section-head">
          <h2 id="walkthrough-heading">What solving one incident actually looks like</h2>
          <p className="muted section-sub">The same five steps, every time — no two challenges break the same way.</p>
        </div>
      </Reveal>
      <ol className="walkthrough-list">
        {WALKTHROUGH_STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} delayMs={i * 70} className="walkthrough-step">
            <span className="walkthrough-index tabular" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p className="muted">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

function SelfHostSection() {
  return (
    <section className="section" id="self-host" aria-labelledby="self-host-heading">
      <Reveal>
        <div className="self-host-card">
          <div>
            <h2 id="self-host-heading">Free. Self-hosted. Yours.</h2>
            <p className="muted">
              This isn't a hosted product — it's a Docker Compose stack you run yourself, on your own machine or
              homelab. Postgres, the backend, and the frontend all come up with one command; challenge containers
              are built and torn down on demand.
            </p>
            <p className="faint">
              It mounts the Docker socket to manage challenge containers, so keep it on a private network — see the
              project README's security notes before exposing it beyond localhost.
            </p>
          </div>
          <pre className="code-block" aria-label="Setup commands">
            <code>{"cp .env.example .env\ndocker compose up --build"}</code>
          </pre>
        </div>
      </Reveal>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-heading">
      <Reveal>
        <div className="section-head">
          <h2 id="faq-heading">Frequently asked questions</h2>
        </div>
      </Reveal>
      <div className="faq-list">
        {FAQS.map((item, i) => (
          <Reveal as="details" key={item.q} delayMs={(i % 3) * 60} className="faq-item">
            <summary>
              <span>{item.q}</span>
              <ChevronIcon className="faq-chevron" />
            </summary>
            <p className="muted">{item.a}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="section final-cta-section" aria-labelledby="final-cta-heading">
      <Reveal className="final-cta">
        <h2 id="final-cta-heading">Ready to fix something that's actually broken?</h2>
        <p className="muted">Create an account and your first broken container is one click away.</p>
        <Link to="/login?mode=signup" className="btn btn-primary btn-lg">
          Get started
        </Link>
      </Reveal>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <span className="landing-brand">Linux Incident Trainer</span>
        <p className="faint">A self-hosted way to practice fixing real Linux incidents before they happen on call.</p>
        <Link to="/login" className="nav-link">
          Already have an account? Log in
        </Link>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------

export function LandingPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Linux Incident Trainer — practice real Linux production incidents";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <div className="landing">
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <LandingNav />
      <main>
        <Hero />
        <StatsSection />
        <FeaturesSection />
        <WalkthroughSection />
        <SelfHostSection />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
