import { queryOptions } from "@tanstack/vue-query";

import { api, unwrap } from "@/shared/api";

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: () => unwrap(api.GET("/api/health/")),
});
