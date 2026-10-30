import { QueryClient } from "@tanstack/vue-query";

import { AppError } from "@/shared/api";

// A retry can fix only a lost connection or a server failure, never a 4xx.
function shouldRetry(failureCount: number, error: unknown): boolean {
  const retryable =
    error instanceof AppError && (error.kind === "network" || error.kind === "server");
  return retryable && failureCount < 2;
}

// "always": by default a request made while the browser reports offline is paused, never sent,
// and the form hangs on "sending" with no error. Sent, it fails and the page shows the error.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, networkMode: "always" },
    mutations: { networkMode: "always" },
  },
});
