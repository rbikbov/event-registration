import { hashKey, type QueryClient } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { meQuery } from "@/entities/session";
import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";

// The guard asks `me` once and caches the answer. If the session ends afterwards (expiry, logout
// in another tab), the next organizer request gets 401: forget the user and go to /login,
// instead of showing an error page whose retry button cannot help. A page that cannot see the
// 401 itself (a live stream refused) reads `me` again: nobody signed in leads to /login too.
export function redirectOnExpiredSession(queryClient: QueryClient, router: Router): void {
  function onError(error: unknown): void {
    if (!(error instanceof AppError) || error.kind !== "unauthorized") return;
    if (!router.currentRoute.value.meta.requiresAuth) return;
    queryClient.setQueryData(meQuery.queryKey, null);
  }
  function onSignedOut(): void {
    if (!router.currentRoute.value.meta.requiresAuth) return;
    void router.replace(routes.login);
  }
  const meHash = hashKey(meQuery.queryKey);
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.action.type === "error") onError(event.action.error);
    if (event.action.type === "success" && event.query.queryHash === meHash) {
      if (event.query.state.data === null) onSignedOut();
    }
  });
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
  });
}
