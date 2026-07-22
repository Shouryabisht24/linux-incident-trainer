import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageLoading } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./routes/RequireAuth";
import { RootRoute } from "./routes/RootRoute";

// Route-level code splitting: ChallengeDetailPage pulls in xterm.js (the
// terminal bridge), which is only ever needed once a user opens a specific
// challenge — no reason to ship it in the initial bundle for the list/login/
// progress pages. LandingPage (lazy-loaded inside RootRoute, not here — see
// that file) gets the same treatment in the other direction: its scroll/
// count-up interactions are only relevant to logged-out visitors, so the
// authenticated app's bundle shouldn't pay for it either.
const ChallengeListPage = lazy(() => import("./pages/ChallengeListPage").then((m) => ({ default: m.ChallengeListPage })));
const ChallengeDetailPage = lazy(() =>
  import("./pages/ChallengeDetailPage").then((m) => ({ default: m.ChallengeDetailPage })),
);
const ProgressDashboardPage = lazy(() =>
  import("./pages/ProgressDashboardPage").then((m) => ({ default: m.ProgressDashboardPage })),
);

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRoute />} />
        <Route element={<RequireAuth />}>
          <Route path="/challenges" element={<ChallengeListPage />} />
          <Route path="/challenges/:slug" element={<ChallengeDetailPage />} />
          <Route path="/progress" element={<ProgressDashboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
