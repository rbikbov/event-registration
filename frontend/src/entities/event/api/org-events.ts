import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";

export const orgEventsQuery = queryOptions({
  queryKey: ["org", "events"],
  queryFn: () => unwrap(api.GET("/api/org/events/")),
});

// Under the list key: invalidating the list after a change refreshes the panel too.
export function orgEventQuery(id: number) {
  return queryOptions({
    queryKey: ["org", "events", id],
    queryFn: () =>
      unwrap(api.GET("/api/org/events/{event_id}/", { params: { path: { event_id: id } } })),
  });
}
