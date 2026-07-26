import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function LandingNav() {
  const { user } = useAuth();
  const [condensed, setCondensed] = useState(false);

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

  return (
    <header className={`landing-nav${condensed ? " condensed" : ""}`}>
      <div className="landing-nav-inner">
        <Link to="/" className="landing-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Linux Incident Trainer
        </Link>
        <nav className="landing-nav-links" aria-label="Page sections">
          <Link to="/features">Features</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/self-hosting">Self-hosting</Link>
          <Link to="/faq">FAQ</Link>
        </nav>
        <div className="landing-nav-cta">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link to="/login?mode=signup" className="btn btn-primary btn-sm">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function LandingFooter() {
  const { user } = useAuth();
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <span className="landing-brand">Linux Incident Trainer</span>
        <p className="faint">A self-hosted way to practice fixing real Linux incidents before they happen on call.</p>
        <Link to={user ? "/dashboard" : "/login"} className="nav-link">
          {user ? "Back to your dashboard" : "Already have an account? Log in"}
        </Link>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Shared shell for every public marketing route (/about, /features,
// /how-it-works, /self-hosting, /faq) — the nav + footer used to live only in
// LandingPage.tsx; now every marketing page gets the identical chrome via this
// wrapper instead of duplicating it four more times.
// ---------------------------------------------------------------------------

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <LandingNav />
      <main id="main-content">{children}</main>
      <LandingFooter />
    </div>
  );
}
