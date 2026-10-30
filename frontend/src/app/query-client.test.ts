import { MutationObserver, QueryObserver, onlineManager } from "@tanstack/vue-query";
import { afterEach, describe, expect, it } from "vitest";

import { queryClient } from "./query-client";

describe("queryClient without a network", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it("fails a mutation instead of pausing it while the browser is offline", async () => {
    onlineManager.setOnline(false);
    const observer = new MutationObserver(queryClient, {
      mutationFn: () => Promise.reject(new Error("offline")),
    });

    await expect(observer.mutate()).rejects.toThrow("offline");

    expect(observer.getCurrentResult().status).toBe("error");
  });

  it("fails a query instead of pausing it while the browser is offline", async () => {
    onlineManager.setOnline(false);
    const observer = new QueryObserver(queryClient, {
      queryKey: ["offline-check"],
      queryFn: () => Promise.reject(new Error("offline")),
      retry: false,
    });

    await observer.refetch().catch(() => undefined);

    expect(observer.getCurrentResult().status).toBe("error");
  });
});
