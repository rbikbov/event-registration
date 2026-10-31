import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { fakeEventSource } from "@/shared/lib/test/fake-event-source";
import { server } from "@/shared/lib/test/msw";

import OrgEventPage from "./OrgEventPage.vue";

const EVENT = "*/api/org/events/7/";
const REGISTRATIONS = "*/api/org/events/7/registrations/";
const event = {
  id: 7,
  title: "Meetup",
  description: "",
  starts_at: "2030-05-01T18:00:00Z",
  capacity: 2,
  confirmed: 2,
  waitlisted: 1,
  checked_in: 1,
  free_seats: 0,
};
const ann = {
  id: 1,
  name: "Ann",
  email: "ann@example.com",
  status: "confirmed",
  checked_in_at: "2030-05-01T17:55:00Z",
};
const bob = {
  id: 2,
  name: "Bob",
  email: "bob@example.com",
  status: "confirmed",
  checked_in_at: null,
};
const cid = {
  id: 3,
  name: "Cid",
  email: "cid@example.com",
  status: "waitlisted",
  position: 1,
  checked_in_at: null,
};

async function mountPage(query: Record<string, string> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.orgEvents, component: OrgEventPage },
      { path: routes.orgEvent, component: OrgEventPage },
      { path: routes.orgCheckin, component: OrgEventPage },
    ],
  });
  await router.push({ path: orgEventPath(7), query });
  const wrapper = mount(OrgEventPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

function counter(wrapper: Awaited<ReturnType<typeof mountPage>>["wrapper"], key: string) {
  return wrapper.get(`[data-counter="${key}"] dd`).text();
}

// jsdom has no EventSource; every test sees the page's stream through the fake.
let streams: ReturnType<typeof fakeEventSource>;

beforeEach(() => {
  streams = fakeEventSource();
  vi.stubGlobal("EventSource", streams.EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrgEventPage", () => {
  it("shows a loading state until the event arrives", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () => HttpResponse.json([])),
    );

    const { wrapper } = await mountPage();

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    await flushPromises();
  });

  it("shows the event, its counters and a link to the check-in", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () => HttpResponse.json([ann, bob, cid])),
    );

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(
      ["capacity", "confirmed", "waitlisted", "checkedIn", "freeSeats"].map((key) =>
        counter(wrapper, key),
      ),
    ).toEqual(["2", "2", "1", "1", "0"]);
    expect(wrapper.get(`a[href="${checkinPath(7)}"]`).text()).toBe("Чекин");
  });

  it("lists the participants with the status, waitlist place and check-in time", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () => HttpResponse.json([ann, bob, cid])),
    );

    const { wrapper } = await mountPage();
    await flushPromises();

    const rows = wrapper.findAll("tbody tr").map((row) => row.findAll("td").map((c) => c.text()));
    const time = new Intl.DateTimeFormat("ru", { timeStyle: "short" }).format(
      new Date(ann.checked_in_at),
    );
    expect(rows).toEqual([
      ["Ann", "ann@example.com", "Подтверждён", time],
      ["Bob", "bob@example.com", "Подтверждён", "—"],
      ["Cid", "cid@example.com", "В листе ожидания, №1", "—"],
    ]);
  });

  it("asks the server for the status from the URL and marks that filter", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("status"));
        return HttpResponse.json([cid]);
      }),
    );

    const { wrapper } = await mountPage({ status: "waitlisted" });
    await flushPromises();

    expect(asked).toEqual(["waitlisted"]);
    expect(wrapper.get('nav a[aria-current="true"]').text()).toBe("Лист ожидания");
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("switches the filter through the URL", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("status"));
        return HttpResponse.json([]);
      }),
    );
    const { wrapper, router } = await mountPage();
    await flushPromises();

    const cancelled = wrapper.findAll("nav a").find((a) => a.text() === "Отказались");
    await cancelled?.trigger("click");
    // The new query key starts its request after the navigation, later than one flush.
    await vi.waitFor(() => expect(wrapper.text()).toContain("С таким статусом никого нет"));

    expect(router.currentRoute.value.query).toEqual({ status: "cancelled" });
    expect(asked).toEqual([null, "cancelled"]);
  });

  it("says there are no registrations yet", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json({ ...event, confirmed: 0, waitlisted: 0 })),
      http.get(REGISTRATIONS, () => HttpResponse.json([])),
    );

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Регистраций пока нет");
    expect(wrapper.find("table").exists()).toBe(false);
  });

  it("says a missing event is not found", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json({}, { status: 404 })),
      http.get(REGISTRATIONS, () => HttpResponse.json({}, { status: 404 })),
    );

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Событие не найдено");
  });

  it("says someone else's event is foreign", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json({}, { status: 403 })),
      http.get(REGISTRATIONS, () => HttpResponse.json({}, { status: 403 })),
    );

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Это событие другого организатора");
  });

  it("offers a retry when the event fails to load", async () => {
    let fail = true;
    server.use(
      http.get(EVENT, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(event),
      ),
      http.get(REGISTRATIONS, () => HttpResponse.json([])),
    );
    const { wrapper } = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить событие");

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Meetup");
  });

  it("keeps the counters when the participants fail to load, with a retry", async () => {
    let fail = true;
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([ann]),
      ),
    );
    const { wrapper } = await mountPage();
    await flushPromises();
    expect(counter(wrapper, "checkedIn")).toBe("1");
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить участников");

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("keeps the counters and the table when a refetch of the event fails", async () => {
    let fail = false;
    server.use(
      http.get(EVENT, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(event),
      ),
      http.get(REGISTRATIONS, () => HttpResponse.json([ann])),
    );
    const { wrapper, queryClient } = await mountPage();
    await flushPromises();

    fail = true;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить событие");
    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(counter(wrapper, "checkedIn")).toBe("1");
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("keeps the table when a refetch of the participants fails", async () => {
    let fail = false;
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([ann, bob]),
      ),
    );
    const { wrapper, queryClient } = await mountPage();
    await flushPromises();

    fail = true;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить участников");
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
  });

  it("updates the counters from a snapshot of the stream", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () => HttpResponse.json([ann])),
    );
    const { wrapper } = await mountPage();
    await flushPromises();

    expect(streams.opened.map((stream) => stream.url)).toEqual([`/api/org/events/7/stream/`]);
    streams.opened[0]?.emit("stats", { confirmed: 2, waitlisted: 0, checked_in: 2, free_seats: 0 });
    await flushPromises();

    expect(
      ["capacity", "confirmed", "waitlisted", "checkedIn", "freeSeats"].map((key) =>
        counter(wrapper, key),
      ),
    ).toEqual(["2", "2", "0", "2", "0"]);
    expect(wrapper.get("h1").text()).toBe("Meetup");
  });

  it("closes the stream when the page is left", async () => {
    server.use(
      http.get(EVENT, () => HttpResponse.json(event)),
      http.get(REGISTRATIONS, () => HttpResponse.json([])),
    );
    const { wrapper } = await mountPage();
    await flushPromises();

    wrapper.unmount();

    expect(streams.opened[0]?.closed).toBe(true);
  });

  // The server's counts at the moment it reads them. A held answer waits for `release`, so a
  // GET can answer after a snapshot it read before; `read` resolves once the held GET has read.
  function heldEvent() {
    let current = event;
    let held: { read: () => void; gate: Promise<void> } | null = null;
    let open = () => {};
    const handler = http.get(EVENT, async () => {
      const counts = current;
      if (held) {
        held.read();
        await held.gate;
      }
      return HttpResponse.json(counts);
    });
    return {
      handler,
      hold(): Promise<void> {
        return new Promise((read) => {
          held = { read, gate: new Promise((resolve) => (open = resolve)) };
        });
      },
      change(counts: Partial<typeof event>) {
        current = { ...current, ...counts };
      },
      release() {
        held = null;
        open();
      },
    };
  }

  // A refetch started by the snapshot goes through MSW in more than one tick.
  async function settled(queryClient: QueryClient) {
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
    await flushPromises();
  }

  const snapshot = { confirmed: 2, waitlisted: 1, checked_in: 2, free_seats: 0 };

  it("keeps a snapshot that came while an older GET of the event was in flight", async () => {
    const backend = heldEvent();
    server.use(
      backend.handler,
      http.get(REGISTRATIONS, () => HttpResponse.json([])),
    );
    const { wrapper, queryClient } = await mountPage();
    await flushPromises();

    const read = backend.hold();
    void queryClient.refetchQueries({ queryKey: ["org", "events", 7] });
    await read;
    backend.change(snapshot);
    streams.opened[0]?.emit("stats", snapshot);
    backend.release();
    await settled(queryClient);

    expect(counter(wrapper, "checkedIn")).toBe("2");
  });

  it("keeps a snapshot that came before the event loaded", async () => {
    const backend = heldEvent();
    const read = backend.hold();
    server.use(
      backend.handler,
      http.get(REGISTRATIONS, () => HttpResponse.json([])),
    );
    const { wrapper, queryClient } = await mountPage();
    await read;

    backend.change(snapshot);
    streams.opened[0]?.emit("stats", snapshot);
    backend.release();
    await settled(queryClient);

    expect(counter(wrapper, "checkedIn")).toBe("2");
  });
});
