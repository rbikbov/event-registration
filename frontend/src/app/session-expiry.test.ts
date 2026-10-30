import { QueryClient } from "@tanstack/vue-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";

import { AppError } from "@/shared/api";
import { routes } from "@/shared/config";
import { server } from "@/shared/lib/test/msw";

import { createAppRouter } from "./router";
import { redirectOnExpiredSession } from "./session-expiry";

async function setup(path: string) {
  server.use(
    http.get("*/api/auth/me/", () => HttpResponse.json({ id: 1, email: "demo@example.com" })),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory());
  redirectOnExpiredSession(queryClient, router);
  await router.push(path);
  return { queryClient, router };
}

// A redirect that must NOT happen cannot be awaited: give a wrong one time to show up.
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const unauthorized = new AppError("unauthorized", { status: 401 });

describe("expired session", () => {
  it("sends the organizer to /login when a query gets 401", async () => {
    const { queryClient, router } = await setup(routes.orgEvents);

    await queryClient
      .fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(unauthorized) })
      .catch(() => undefined);

    await expect.poll(() => router.currentRoute.value.path).toBe(routes.login);
  });

  it("sends the organizer to /login when a mutation gets 401", async () => {
    const { queryClient, router } = await setup(routes.orgEventsNew);

    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(unauthorized) })
      .execute(undefined)
      .catch(() => undefined);

    await expect.poll(() => router.currentRoute.value.path).toBe(routes.login);
  });

  it("stays on a public page", async () => {
    const { queryClient, router } = await setup(routes.home);

    await queryClient
      .fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(unauthorized) })
      .catch(() => undefined);

    await settle();
    expect(router.currentRoute.value.path).toBe(routes.home);
  });

  it("ignores other failures", async () => {
    const { queryClient, router } = await setup(routes.orgEvents);

    await queryClient
      .fetchQuery({
        queryKey: ["x"],
        queryFn: () => Promise.reject(new AppError("server", { status: 500 })),
      })
      .catch(() => undefined);

    await settle();
    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
  });
});
