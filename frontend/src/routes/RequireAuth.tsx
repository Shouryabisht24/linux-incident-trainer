import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { CommandPalette } from "../components/CommandPalette";
import { NavBar } from "../components/NavBar";
import { useAuth } from "../context/AuthContext";
import { PageLoading } from "../components/ui";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global Cmd+K / Ctrl+K listener — this component is the single mount point every authenticated
  // route already renders through (NavBar + Outlet), so the palette's open state lives here rather
  // than in a new Context nothing outside this tree needs.
  useEffect(() => {
    if (!user) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user]);

  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <NavBar />
      <Outlet />
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
