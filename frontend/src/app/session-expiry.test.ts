import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, RouterView } from "vue-router";

import { AppError } from "@/shared/api";
import { meQuery } from "@/entities/session";
import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { fakeEventSource } from "@/shared/lib/test/fake-event-source";
import { server } from "@/shared/lib/test/msw";

import App from "./App.vue";
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
  it("sends the organizer to /login and back here when a query gets 401", async () => {
    const { queryClient, router } = await setup(`${orgEventPath(7)}?page=2`);

    await queryClient
      .fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(unauthorized) })
      .catch(() => undefined);

    await expect.poll(() => router.currentRoute.value.path).toBe(routes.login);
    expect(router.currentRoute.value.query.next).toBe(`${orgEventPath(7)}?page=2`);
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
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

// The header asks `me` on every screen, and a guest gets 401. The guest stays on a public page:
// only the guard sends to /login, and it lets public pages through — not the header, not the 401
// handling.
describe("a guest on a public page", () => {
  it("stays there and is offered to sign in", async () => {
    server.use(
      http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 401 })),
      http.get("*/api/events/", () => HttpResponse.json([])),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createAppRouter(queryClient, createMemoryHistory());
    redirectOnExpiredSession(queryClient, router);
    await router.push(routes.home);
    const wrapper = mount(App, {
      global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
    });

    await vi.waitFor(() => expect(wrapper.get("header").text()).toContain("Вход для организатора"));
    await settle();

    expect(router.currentRoute.value.path).toBe(routes.home);
  });
});

// The whole way, with the app's router: EventSource does not tell a 401 from a 502, so the
// event layout reads the event again for its status on each refusal, and a 401 leads to /login.
const EVENT = {
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
};

describe("a refused live stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function openPanel() {
    const streams = fakeEventSource();
    vi.stubGlobal("EventSource", streams.EventSource);
    server.use(http.get("*/api/org/events/7/", () => HttpResponse.json(EVENT)));
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
    server.use(http.get("*/api/org/events/7/", () => new HttpResponse(null, { status: 401 })));

    streams.opened[0]?.fail({ closed: true });

    await expect.poll(() => router.currentRoute.value.path).toBe(routes.login);
  });

  it("stays and opens the stream again while the event still answers", async () => {
    const { router, streams } = await openPanel();
    let probes = 0;
    server.use(
      http.get("*/api/org/events/7/", () => {
        probes += 1;
        return HttpResponse.json(EVENT);
      }),
    );
    vi.useFakeTimers();

    streams.opened[0]?.fail({ closed: true });
    await vi.waitFor(() => expect(probes).toBe(1));
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();

    expect(streams.opened).toHaveLength(2);
    expect(router.currentRoute.value.path).toBe(checkinPath(7));
  });
});
