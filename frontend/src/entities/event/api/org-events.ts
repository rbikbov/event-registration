import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";
import type { components, paths } from "@/shared/api";
import { sseSource, type LiveSource } from "@/shared/lib/live-source";

export type OrgEvent = components["schemas"]["OrgEvent"];
export type OrgEventStats = components["schemas"]["OrgEventStats"];

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

// EventSource is not openapi-fetch: the path is checked against the contract here instead.
const ORG_EVENT_STREAM = "/api/org/events/{event_id}/stream/" satisfies keyof paths;

// Live counts of the event panel.
export function orgEventLive(id: number): LiveSource<OrgEventStats> {
  return sseSource(ORG_EVENT_STREAM.replace("{event_id}", String(id)), "stats");
}
