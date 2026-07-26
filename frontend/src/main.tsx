import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
// Self-hosted, @fontsource-packaged webfonts (real .woff2 files bundled by Vite at build time,
// no runtime Google Fonts CDN dependency) — only the weights actually used by styles.css's
// --font-display/--font-body/--font-mono token rules. Side-effect imports, same pattern as the
// styles.css import below, so the same "consistent with how the project already loads CSS" rule
// applies to fonts too. See decisions/0018-visual-identity-pass.md for the sourcing rationale.
import "@fontsource/overpass/latin-700.css";
import "@fontsource/overpass/latin-800.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
