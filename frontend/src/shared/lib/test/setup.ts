import { onlineManager } from "@tanstack/vue-query";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  // TanStack Query follows the `offline` event of goOnline app-wide: back online for the next test.
  onlineManager.setOnline(true);
});
afterAll(() => server.close());
