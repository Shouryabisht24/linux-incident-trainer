import { Link, useLocation } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { useAuth } from "../context/AuthContext";

// ---------------------------------------------------------------------------
// Catch-all route (any path App.tsx's <Routes> doesn't otherwise match).
// Sits outside <RequireAuth> — reachable regardless of login state, same tier
// as /about — so it renders <NavBar/> directly rather than relying on
// RequireAuth to do it; NavBar already no-ops (returns null) when logged out.
//
// Themed as a real systemctl/curl transcript reporting the 404, reusing the
// existing dark "real terminal" chrome (.hero-terminal*, --term-mock-*
// tokens) rather than inventing a second terminal look — see the CSS comment
// above .notfound-page in styles.css.
// ---------------------------------------------------------------------------

export function NotFoundPage() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <>
      <NavBar />
      <div className="page notfound-page">
        <span className="eyebrow">404</span>
        <h1>Nothing running on that route</h1>

        <div className="hero-terminal notfound-terminal">
          <div className="hero-terminal-bar">
            <span className="hero-terminal-dot" style={{ background: "var(--term-mock-danger)" }} />
            <span className="hero-terminal-dot" style={{ background: "var(--term-mock-warning)" }} />
            <span className="hero-terminal-dot" style={{ background: "var(--term-mock-success)" }} />
            <span className="hero-terminal-title">~ systemctl status {location.pathname}</span>
          </div>
          <pre className="hero-terminal-body notfound-terminal-body">
            <span className="t-danger">● {location.pathname}.route</span> - Requested Page{"\n"}
            {"   "}
            <span className="t-faint">Loaded:</span> not-found (no unit file installed){"\n"}
            {"   "}
            <span className="t-faint">Active:</span> <span className="t-danger">failed</span> (Result:
            exit-code) since just now{"\n"}
            {"  "}
            <span className="t-faint">Process:</span> GET {location.pathname} (code=exited, status=404){"\n\n"}
            <span className="t-prompt">$</span> <span className="t-cmd">curl -sD - {location.pathname}</span>
            {"\n"}
            HTTP/1.1 <span className="t-danger">404 Not Found</span>
            {"\n"}
            content-type: text/plain{"\n\n"}
            no incident is broken here — you're the one who found something broken.
          </pre>
        </div>

        <p className="muted notfound-copy">
          That route doesn't exist. Whatever you were looking for isn't here — but there's a full queue of things
          that are genuinely broken waiting on the other side of this link.
        </p>

        <Link to={user ? "/dashboard" : "/"} className="btn btn-primary">
          {user ? "Back to dashboard" : "Back to home"}
        </Link>
      </div>
    </>
  );
}
