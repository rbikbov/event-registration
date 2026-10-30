import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export type PublicEventListItem = components["schemas"]["PublicEventList"];
export type PublicEvent = components["schemas"]["PublicEvent"];

export const publicEventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: () => unwrap(api.GET("/api/events/")),
});

export function publicEventQuery(id: number) {
  return queryOptions({
    queryKey: ["events", id],
    queryFn: () => unwrap(api.GET("/api/events/{id}/", { params: { path: { id } } })),
  });
}
