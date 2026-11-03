import type { QueryClient } from "@tanstack/vue-query";

// Drops what the previous user saw: on sign-in, which is where another user can appear (after a
// 401 the cache still holds the organizer's events and participants), and on sign-out. Only
// queries no screen shows are dropped: one still observed would stay on screen detached from the
// cache. The caller leaves the previous screen first; on /login nothing of the user is shown.
export function forgetUserData(queryClient: QueryClient): void {
  queryClient.removeQueries({ type: "inactive" });
}
