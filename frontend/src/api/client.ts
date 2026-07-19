export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface ChallengeSummary {
  slug: string;
  title: string;
  category: string;
  categoryName: string;
  difficulty: string;
  solved: boolean;
}

export interface ChallengeDetail {
  slug: string;
  title: string;
  category: string;
  categoryName: string;
  difficulty: string;
  descriptionMd: string;
  timeLimitMinutes: number | null;
  hintCount: number;
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  signup: (email: string, password: string, displayName?: string) =>
    request<{ user: AuthUser; token: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<{ user: AuthUser; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
  listChallenges: () => request<{ challenges: ChallengeSummary[] }>("/api/challenges"),
  getChallenge: (slug: string) => request<ChallengeDetail>(`/api/challenges/${slug}`),
  startSession: (slug: string) =>
    request<{ sessionId: string; wsTicket: string; expiresInSeconds: number }>(`/api/challenges/${slug}/sessions`, {
      method: "POST",
    }),
  stopSession: (id: string) => request<{ ok: true }>(`/api/sessions/${id}/stop`, { method: "POST" }),
  refreshWsTicket: (id: string) =>
    request<{ wsTicket: string; expiresInSeconds: number }>(`/api/sessions/${id}/ws-ticket`, { method: "POST" }),
  checkSession: (id: string) =>
    request<{ passed: boolean; output: string }>(`/api/sessions/${id}/check`, { method: "POST" }),
  heartbeat: (id: string) => request<{ ok: true }>(`/api/sessions/${id}/heartbeat`, { method: "POST" }),
  getHints: (id: string) => request<{ revealed: string[]; totalHints: number }>(`/api/sessions/${id}/hints`),
  revealHint: (id: string) =>
    request<{ hint: string | null; hintsUsed: number; totalHints: number }>(`/api/sessions/${id}/hints/reveal`, {
      method: "POST",
    }),
  getSolution: (id: string) => request<{ solutionMd: string }>(`/api/sessions/${id}/solution`),
};
