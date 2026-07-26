import { useEffect } from "react";
import { MarketingLayout } from "../components/MarketingLayout";
import { Reveal } from "../components/ui";

function SelfHostSection() {
  return (
    <section className="section" aria-labelledby="self-host-heading">
      <div className="marketing-page-header marketing-page-header--self-hosting">
        <Reveal>
          <div className="self-host-card">
            <div>
              <span className="section-kicker">
                <span className="kicker-prompt">~/</span>self-host
              </span>
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
      </div>
    </section>
  );
}

export function SelfHostingPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Self-hosting — Linux Incident Trainer";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <MarketingLayout>
      <SelfHostSection />
    </MarketingLayout>
  );
}
