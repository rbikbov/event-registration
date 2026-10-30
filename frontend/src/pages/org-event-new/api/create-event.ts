import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export function createEvent(body: components["schemas"]["EventRequest"]) {
  return unwrap(api.POST("/api/org/events/", { body }));
}
