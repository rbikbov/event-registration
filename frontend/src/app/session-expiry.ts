import type { QueryClient } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { meQuery } from "@/entities/session";
import { AppError } from "@/shared/api";

// The guard asks `me` once and caches the answer. If the session ends afterwards (expiry, logout
// in another tab), the next organizer request gets 401: forget the user and run the current
// navigation again, so the guard decides where to go (/login with the way back here), instead of
// an error page whose retry button cannot help.
export function redirectOnExpiredSession(queryClient: QueryClient, router: Router): void {
  function onError(error: unknown): void {
    if (!(error instanceof AppError) || error.kind !== "unauthorized") return;
    queryClient.setQueryData(meQuery.queryKey, null);
    const { path, query, hash } = router.currentRoute.value;
    void router.replace({ path, query, hash, force: true });
  }
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
  });
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
  });
}
