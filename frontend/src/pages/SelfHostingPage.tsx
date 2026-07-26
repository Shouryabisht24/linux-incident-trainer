import { useEffect } from "react";
import { MarketingLayout } from "../components/MarketingLayout";
import { Reveal } from "../components/ui";

// The real repo this project lives in — used both for the clone command below and the "View
// source" link, so there's exactly one place to update if the repo ever moves.
const REPO_URL = "https://github.com/Shouryabisht24/linux-incident-trainer";

// Replaces the prior pass's annotated docker-compose.yml excerpt (decisions/0023) with the actual
// thing a self-hoster needs first: where to get the code and the exact commands to run it. Reuses
// the same terminal-chrome header as the walkthrough/compose panels elsewhere on this page family,
// and `.walkthrough-cmd`'s existing inline-command-chip styling for each step, rather than
// inventing a third visual language for "here is a shell command."
function InstallPanel() {
  return (
    <div className="compose-panel" aria-label="How to install and run this project">
      <div className="walkthrough-terminal-bar">
        <span className="walkthrough-terminal-dot" />
        <span className="walkthrough-terminal-dot" />
        <span className="walkthrough-terminal-dot" />
        <span className="walkthrough-terminal-title">install.sh</span>
      </div>
      <div className="install-steps">
        <p className="install-step-label">Get the code</p>
        <code className="walkthrough-cmd install-cmd">$ git clone {REPO_URL}.git</code>
        <code className="walkthrough-cmd install-cmd">$ cd linux-incident-trainer</code>

        <p className="install-step-label">Configure secrets</p>
        <code className="walkthrough-cmd install-cmd">$ cp .env.example .env</code>
        <p className="faint install-step-note">Then edit POSTGRES_PASSWORD and JWT_SECRET in .env.</p>

        <p className="install-step-label">Build and start everything</p>
        <code className="walkthrough-cmd install-cmd">$ docker compose up --build</code>
      </div>
      <div className="compose-panel-footer">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
          View source on GitHub
        </a>
      </div>
    </div>
  );
}

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
              <h2 id="self-host-heading" className="gradient-heading">
                Free. Self-hosted. Yours.
              </h2>
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
            <InstallPanel />
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
