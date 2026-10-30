import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export type OrgEvent = components["schemas"]["Event"];

export const orgEventsQuery = queryOptions({
  queryKey: ["org", "events"],
  queryFn: () => unwrap(api.GET("/api/org/events/")),
});
