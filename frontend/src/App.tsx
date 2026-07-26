import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageLoading } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./routes/RequireAuth";
import { RootRoute } from "./routes/RootRoute";

// Same chunk as the lazy import inside RootRoute.tsx (same module specifier), so this doesn't
// double-ship the landing page's JS — it's the one place a *logged-in* user can reach it, since
// RootRoute redirects "/" away from them. See NavBar's "About" link.
const LandingPage = lazy(() => import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })));

// Route-level code splitting: ChallengeDetailPage pulls in xterm.js (the
// terminal bridge), which is only ever needed once a user opens a specific
// challenge — no reason to ship it in the initial bundle for the list/login/
// progress pages. LandingPage (lazy-loaded inside RootRoute, not here — see
// that file) gets the same treatment in the other direction: its scroll/
// count-up interactions are only relevant to logged-out visitors, so the
// authenticated app's bundle shouldn't pay for it either.
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ChallengeListPage = lazy(() => import("./pages/ChallengeListPage").then((m) => ({ default: m.ChallengeListPage })));
const ChallengeDetailPage = lazy(() =>
  import("./pages/ChallengeDetailPage").then((m) => ({ default: m.ChallengeDetailPage })),
);
const ProgressDashboardPage = lazy(() =>
  import("./pages/ProgressDashboardPage").then((m) => ({ default: m.ProgressDashboardPage })),
);
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((m) => ({ default: m.HelpPage })));

// The four marketing sub-pages that used to be in-page anchor sections of LandingPage.tsx
// (Features/Walkthrough/SelfHost/Faq) — split into their own routes so each is directly
// linkable/shareable. Same tier as /about below: public, no auth redirect logic.
const FeaturesPage = lazy(() => import("./pages/FeaturesPage").then((m) => ({ default: m.FeaturesPage })));
const HowItWorksPage = lazy(() => import("./pages/HowItWorksPage").then((m) => ({ default: m.HowItWorksPage })));
const SelfHostingPage = lazy(() => import("./pages/SelfHostingPage").then((m) => ({ default: m.SelfHostingPage })));
const FaqPage = lazy(() => import("./pages/FaqPage").then((m) => ({ default: m.FaqPage })));

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRoute />} />
        <Route path="/about" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/self-hosting" element={<SelfHostingPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/challenges" element={<ChallengeListPage />} />
          <Route path="/challenges/:slug" element={<ChallengeDetailPage />} />
          <Route path="/progress" element={<ProgressDashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
