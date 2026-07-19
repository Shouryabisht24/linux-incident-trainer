import { useState } from "react";
import { AuthForm } from "./components/AuthForm";
import { ChallengeDetail } from "./components/ChallengeDetail";
import { ChallengeList } from "./components/ChallengeList";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { user, loading } = useAuth();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  if (loading) return null;
  if (!user) return <AuthForm />;

  return selectedSlug ? (
    <ChallengeDetail slug={selectedSlug} onBack={() => setSelectedSlug(null)} />
  ) : (
    <ChallengeList onSelect={setSelectedSlug} />
  );
}
