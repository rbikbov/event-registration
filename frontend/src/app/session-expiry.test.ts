import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, RouterView } from "vue-router";

import { meQuery } from "@/entities/session";
import { AppError } from "@/shared/api";
import { checkinPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { fakeEventSource } from "@/shared/lib/test/fake-event-source";
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

  // What a page does when it cannot tell a 401 from other refusals, as with a live stream.
  it("sends the organizer to /login when a reread of me finds nobody signed in", async () => {
    const { queryClient, router } = await setup(routes.orgEvents);
    server.use(http.get("*/api/auth/me/", () => new HttpResponse(null, { status: 401 })));

    await queryClient.prefetchQuery({ ...meQuery, staleTime: 0 });

    await expect.poll(() => router.currentRoute.value.path).toBe(routes.login);
  });

  it("stays when a reread of me finds the organizer still signed in", async () => {
    const { queryClient, router } = await setup(routes.orgEvents);

    await queryClient.prefetchQuery({ ...meQuery, staleTime: 0 });

    await settle();
    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
  });
});

// The whole way, with the app's router: EventSource does not tell a 401 from a 502, so the
// event layout reads the session again on each refusal, and an ended one leads to /login.
describe("a refused live stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function openPanel() {
    const streams = fakeEventSource();
    vi.stubGlobal("EventSource", streams.EventSource);
    server.use(
      http.get("*/api/org/events/7/", () =>
        HttpResponse.json({
          id: 7,
          title: "Meetup",
          description: "",
          starts_at: "2030-05-01T18:00:00Z",
          capacity: 2,
          confirmed: 0,
          waitlisted: 0,
          checked_in: 0,
          free_seats: 2,
          cancelled: 0,
        }),
      ),
    );
    // The check-in tab: the layout is all there is to read.
    const { queryClient, router } = await setup(checkinPath(7));
    mount(RouterView, {
      global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
    });
    await vi.waitFor(() => expect(streams.opened).toHaveLength(1));
    streams.opened[0]?.open();
    return { router, streams };
  }

  it("sends the organizer to /login when the session has ended", async () => {
    const { router, streams } = await openPanel();
    server.use(http.get("*/api/auth/me/", () => new HttpResponse(null, { status: 401 })));

    streams.opened[0]?.fail({ closed: true });

    await expect.poll(() => router.currentRoute.value.path).toBe(routes.login);
  });

  it("stays and opens the stream again while the organizer is signed in", async () => {
    const { router, streams } = await openPanel();
    let meReads = 0;
    server.use(
      http.get("*/api/auth/me/", () => {
        meReads += 1;
        return HttpResponse.json({ id: 1, email: "demo@example.com" });
      }),
    );
    vi.useFakeTimers();

    streams.opened[0]?.fail({ closed: true });
    await vi.waitFor(() => expect(meReads).toBe(1));
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();

    expect(streams.opened).toHaveLength(2);
    expect(router.currentRoute.value.path).toBe(checkinPath(7));
  });
});
