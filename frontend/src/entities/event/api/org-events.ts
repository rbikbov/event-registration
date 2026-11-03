import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";
import type { components, paths } from "@/shared/api";
import { sseSource, type LiveSource } from "@/shared/lib/live-source";

export type OrgEvent = components["schemas"]["OrgEvent"];

// Every organizer query key starts with this: signing out drops them all by this prefix.
export const orgQueryKey = ["org"] as const;

export const orgEventsQuery = queryOptions({
  queryKey: [...orgQueryKey, "events"],
  queryFn: () => unwrap(api.GET("/api/org/events/")),
});

function readOrgEvent(id: number) {
  return unwrap(api.GET("/api/org/events/{event_id}/", { params: { path: { event_id: id } } }));
}

// Under the list key: invalidating the list after a change refreshes the panel too.
export function orgEventQuery(id: number) {
  return queryOptions({
    queryKey: [...orgQueryKey, "events", id],
    queryFn: () => readOrgEvent(id),
  });
}

// The event read only for what the server answers now, to tell why its stream was refused: under
// a key of its own, so the answer never replaces the counts of a fresher snapshot, and not kept.
// Not retried: the stream is opened again in 3 s, and its next refusal brings the next probe.
export function orgEventProbe(id: number) {
  return queryOptions({
    queryKey: [...orgQueryKey, "event-probe", id],
    queryFn: () => readOrgEvent(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

// EventSource is not openapi-fetch: the path is checked against the contract here instead.
const ORG_EVENT_STREAM = "/api/org/events/{event_id}/stream/" satisfies keyof paths;

// The event of the panel, live: the whole event, as orgEventQuery has it, after each change.
export function orgEventLive(id: number): LiveSource<OrgEvent> {
  return sseSource(ORG_EVENT_STREAM.replace("{event_id}", String(id)), "snapshot");
}
