import { useEffect, type SVGProps } from "react";
import { MarketingLayout } from "../components/MarketingLayout";
import { Reveal } from "../components/ui";

// Local copy of the same 22x22 stroke-glyph helper used across every marketing/app page (no icon
// package, no emoji) — ChevronIcon below is the only icon this page needs.
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

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...IconProps(props)} width={16} height={16} viewBox="0 0 16 16">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

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

function FaqSection() {
  return (
    <section className="section" aria-labelledby="faq-heading">
      <div className="marketing-page-header marketing-page-header--faq">
        <Reveal>
          <div className="section-head">
            <span className="section-kicker">
              <span className="kicker-prompt">~/</span>faq
            </span>
            <h2 id="faq-heading" className="gradient-heading">
              Frequently asked questions
            </h2>
          </div>
        </Reveal>
      </div>
      <div className="faq-list">
        {FAQS.map((item, i) => (
          <Reveal as="details" key={item.q} delayMs={(i % 3) * 60} className="faq-item">
            <summary>
              <span>
                <span className="kicker-prompt" aria-hidden="true">
                  &gt;
                </span>
                {item.q}
              </span>
              <ChevronIcon className="faq-chevron" />
            </summary>
            <p className="muted">{item.a}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function FaqPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "FAQ — Linux Incident Trainer";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <MarketingLayout>
      <FaqSection />
    </MarketingLayout>
  );
}
