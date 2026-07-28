import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "./client";

export const queryKeys = {
  challenges: ["challenges"] as const,
  challenge: (slug: string) => ["challenge", slug] as const,
  categories: ["categories"] as const,
  activeSession: ["activeSession"] as const,
  hints: (sessionId: string) => ["hints", sessionId] as const,
  progress: ["progress"] as const,
  publicStats: ["publicStats"] as const,
  helpRequests: ["helpRequests"] as const,
};

export function useChallenges() {
  return useQuery({
    queryKey: queryKeys.challenges,
    queryFn: () => api.listChallenges().then((r) => r.challenges),
  });
}

export function useChallenge(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.challenge(slug ?? ""),
    queryFn: () => api.getChallenge(slug!),
    enabled: !!slug,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.listCategories().then((r) => r.categories),
  });
}

export function useProgress() {
  return useQuery({
    queryKey: queryKeys.progress,
    queryFn: () => api.getProgress(),
  });
}

/** Unauthenticated challenge/category counts for the public landing page's stats section. */
export function usePublicStats() {
  return useQuery({
    queryKey: queryKeys.publicStats,
    queryFn: () => api.getPublicStats(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** The current user's still-running session, if any — used to resume on mount/refresh. */
export function useActiveSession(options?: Partial<UseQueryOptions<Awaited<ReturnType<typeof api.getActiveSession>>>>) {
  return useQuery({
    queryKey: queryKeys.activeSession,
    queryFn: () => api.getActiveSession(),
    ...options,
  });
}

export function useHints(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.hints(sessionId ?? ""),
    queryFn: () => api.getHints(sessionId!),
    enabled: !!sessionId,
  });
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.startSession(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
    },
  });
}

export function useStopSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
    },
  });
}

export function useCheckSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.checkSession(sessionId),
    onSuccess: (_result, sessionId) => {
      // A check may flip solved state and touches per-category counts.
      qc.invalidateQueries({ queryKey: queryKeys.challenges });
      qc.invalidateQueries({ queryKey: queryKeys.progress });
      qc.invalidateQueries({ queryKey: queryKeys.activeSession });
      void sessionId;
    },
  });
}

export function useRevealHint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.revealHint(sessionId),
    onSuccess: (_result, sessionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.hints(sessionId) });
    },
  });
}

export function useSolution() {
  return useMutation({
    mutationFn: (sessionId: string) => api.getSolution(sessionId),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.changePassword(currentPassword, newPassword),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => api.requestPasswordReset(email),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
      api.resetPassword(token, newPassword),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (currentPassword: string) => api.deleteAccount(currentPassword),
  });
}

export function useUpdateDisplayName() {
  return useMutation({
    mutationFn: (displayName: string | null) => api.updateDisplayName(displayName),
  });
}

export function useRefreshWsTicket() {
  return useMutation({
    mutationFn: (sessionId: string) => api.refreshWsTicket(sessionId),
  });
}

export function useHelpRequests() {
  return useQuery({
    queryKey: queryKeys.helpRequests,
    queryFn: () => api.listHelpRequests().then((r) => r.helpRequests),
  });
}

export function useSubmitHelpRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subject, message }: { subject: string; message: string }) =>
      api.submitHelpRequest(subject, message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.helpRequests });
    },
  });
}
