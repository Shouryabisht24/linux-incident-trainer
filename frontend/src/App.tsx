import { useEffect, useState } from "react";

type BackendStatus = "checking" | "ok" | "error";

export default function App() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    fetch("/health")
      .then((res) => (res.ok ? setStatus("ok") : setStatus("error")))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>DevOps Troubleshooting Trainer</h1>
      <p>Backend status: {status}</p>
    </main>
  );
}
