import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";
import type { components, paths } from "@/shared/api";
import { sseSource, type LiveSource } from "@/shared/lib/live-source";

import type { EventPeriod } from "../model/event-period";

export type PublicEventListItem = components["schemas"]["PublicEventList"];
export type PublicEvent = components["schemas"]["PublicEvent"];

// Every page of the list: what to invalidate when the events change. Not a prefix of the
// event's own key, `["events", id]`.
export const publicEventListsKey = ["events", "list"] as const;

export function publicEventsQuery(period: EventPeriod, page: number) {
  return queryOptions({
    queryKey: [...publicEventListsKey, period, page],
    queryFn: () => unwrap(api.GET("/api/events/", { params: { query: { period, page } } })),
  });
}

function readPublicEvent(id: number) {
  return unwrap(api.GET("/api/events/{id}/", { params: { path: { id } } }));
}

export function publicEventQuery(id: number) {
  return queryOptions({ queryKey: ["events", id], queryFn: () => readPublicEvent(id) });
}

// As orgEventProbe: what the server answers for the event now, without touching its data.
export function publicEventProbe(id: number) {
  return queryOptions({
    queryKey: ["event-probe", id],
    queryFn: () => readPublicEvent(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

// EventSource is not openapi-fetch: the path is checked against the contract here instead.
const PUBLIC_EVENT_STREAM = "/api/events/{event_id}/stream/" satisfies keyof paths;

// The public event, live: the whole event, as publicEventQuery has it, after each change.
export function publicEventLive(id: number): LiveSource<PublicEvent> {
  return sseSource(PUBLIC_EVENT_STREAM.replace("{event_id}", String(id)), "snapshot");
}
