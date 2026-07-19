import { useEffect, useState } from "react";
import { api, type ChallengeSummary } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function ChallengeList({ onSelect }: { onSelect: (slug: string) => void }) {
  const { user, logout } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listChallenges()
      .then((res) => setChallenges(res.challenges))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ maxWidth: 700, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Linux Incident Trainer</h1>
        <div>
          <span>{user?.email}</span>{" "}
          <button onClick={logout}>Log out</button>
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {challenges.length === 0 && !error && <p>No challenges yet.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {challenges.map((c) => (
          <li
            key={c.slug}
            style={{
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: "0.75rem 1rem",
              marginBottom: "0.5rem",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
            }}
            onClick={() => onSelect(c.slug)}
          >
            <span>
              {c.solved ? "✅ " : ""}
              <strong>{c.title}</strong> &middot; {c.categoryName} &middot; {c.difficulty}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
