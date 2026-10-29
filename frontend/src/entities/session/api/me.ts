import { queryOptions } from "@tanstack/vue-query";

import { AppError, api, unwrap } from "@/shared/api";
import type { components } from "@/shared/api";

export type SessionUser = components["schemas"]["User"];

// `null` means nobody is signed in: for a guest the server answers 403, which is a
// state of the page, not a failure.
export const meQuery = queryOptions({
  queryKey: ["session", "me"],
  queryFn: async (): Promise<SessionUser | null> => {
    try {
      return await unwrap(api.GET("/api/auth/me/"));
    } catch (error) {
      if (error instanceof AppError && ["unauthorized", "forbidden"].includes(error.kind)) {
        return null;
      }
      throw error;
    }
  },
});
