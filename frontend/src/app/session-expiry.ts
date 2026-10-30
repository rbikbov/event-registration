import type { QueryClient } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { meQuery } from "@/entities/session";
import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";

// The guard asks `me` once and caches the answer. If the session ends afterwards (expiry, logout
// in another tab), the next organizer request gets 401: forget the user and go to /login,
// instead of showing an error page whose retry button cannot help.
export function redirectOnExpiredSession(queryClient: QueryClient, router: Router): void {
  function onError(error: unknown): void {
    if (!(error instanceof AppError) || error.kind !== "unauthorized") return;
    if (!router.currentRoute.value.meta.requiresAuth) return;
    queryClient.setQueryData(meQuery.queryKey, null);
    void router.replace(routes.login);
  }
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
  });
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
  });
}
