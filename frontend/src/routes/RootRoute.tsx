import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageLoading } from "../components/ui";

// Lazy-loaded here (not just wrapped in lazy() up in App.tsx) so the chunk is only ever fetched
// once we've actually decided to render it below — an authenticated visitor hitting "/" never
// triggers the request, and the authenticated app's own bundle never contains it either.
const LandingPage = lazy(() => import("../pages/LandingPage").then((m) => ({ default: m.LandingPage })));

/** `/` is the public marketing page for logged-out visitors, but an already-authenticated user
 * should never see it on a routine visit or refresh — send them straight into the app instead. */
export function RootRoute() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading />;
  if (user) return <Navigate to="/challenges" replace />;

  return (
    <Suspense fallback={<PageLoading />}>
      <LandingPage />
    </Suspense>
  );
}
