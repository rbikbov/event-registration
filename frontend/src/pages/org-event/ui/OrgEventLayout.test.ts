import { focusManager, onlineManager, QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, type FunctionalComponent } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";

import type { OrgEvent } from "@/entities/event";
import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { fakeEventSource } from "@/shared/lib/test/fake-event-source";
import { server } from "@/shared/lib/test/msw";

import OrgEventLayout from "./OrgEventLayout.vue";

const EVENT = "*/api/org/events/7/";
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
  cancelled: 0,
};

// The tabs are other pages; here each one only shows what the layout gave it.
const Participants: FunctionalComponent<{ event: OrgEvent }> = (props) =>
  h("p", { "data-tab": "participants" }, props.event.title);
Participants.props = ["event"];
const Checkin: FunctionalComponent = () => h("form", { "data-tab": "checkin" });
// Without a name vue-router takes a function component for a lazy import.
Participants.displayName = "Participants";
Checkin.displayName = "Checkin";

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function mountLayout(path = orgEventPath(7), queryClient = newQueryClient()) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.orgEvents, component: { render: () => null } },
      {
        path: routes.orgEvent,
        component: OrgEventLayout,
        children: [
          { path: routes.orgEvent, component: Participants },
          { path: routes.orgCheckin, component: Checkin },
        ],
      },
    ],
  });
  await router.push(path);
  // Through the root RouterView, as in the app: the layout's own one renders the tab.
  const wrapper = mount(RouterView, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

type Wrapper = Awaited<ReturnType<typeof mountLayout>>["wrapper"];

function counter(wrapper: Wrapper, key: string) {
  return wrapper.get(`[data-counter="${key}"] dd`).text();
}

function currentTab(wrapper: Wrapper) {
  return wrapper.get('nav a[aria-current="page"]').text();
}

// Counts each GET of the event; while held, an answer waits for `release`.
function countedEvent(answer: () => Response = () => HttpResponse.json(event)) {
  let gets = 0;
  let open = () => {};
  let gate = Promise.resolve();
  const handler = http.get(EVENT, async () => {
    gets += 1;
    await gate;
    return answer();
  });
  return {
    handler,
    gets: () => gets,
    hold() {
      gate = new Promise((resolve) => (open = resolve));
    },
    release: () => open(),
  };
}

// jsdom has no EventSource; every test sees the layout's stream through the fake.
let streams: ReturnType<typeof fakeEventSource>;

beforeEach(() => {
  streams = fakeEventSource();
  vi.stubGlobal("EventSource", streams.EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrgEventLayout", () => {
  // Until the GET answers, the event may be someone else's: no tab, no form, not even the tabs.
  it.each([
    ["participants", orgEventPath(7)],
    ["check-in", checkinPath(7)],
  ])("shows only a loading state on the %s tab until the event arrives", async (_tab, path) => {
    const backend = countedEvent();
    backend.hold();
    server.use(backend.handler);

    const { wrapper } = await mountLayout(path);
    await vi.waitFor(() => expect(backend.gets()).toBe(1));

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    expect(wrapper.find("nav").exists()).toBe(false);
    expect(wrapper.find("[data-tab]").exists()).toBe(false);
    backend.release();
    await flushPromises();
  });

  it("shows the event, its counters and gives it to the participants tab", async () => {
    server.use(http.get(EVENT, () => HttpResponse.json(event)));

    const { wrapper } = await mountLayout();
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(
      ["capacity", "confirmed", "waitlisted", "checkedIn", "freeSeats"].map((key) =>
        counter(wrapper, key),
      ),
    ).toEqual(["2", "2", "1", "1", "0"]);
    expect(currentTab(wrapper)).toBe("Участники");
    expect(wrapper.get(`nav a[href="${checkinPath(7)}"]`).text()).toBe("Чекин");
    expect(wrapper.get('[data-tab="participants"]').text()).toBe("Meetup");
  });

  it.each([
    [404, "Событие не найдено"],
    [403, "Это событие другого организатора"],
  ])("answers %i in place of the tabs", async (status, text) => {
    server.use(http.get(EVENT, () => HttpResponse.json({}, { status })));

    const { wrapper } = await mountLayout(checkinPath(7));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(text);
    expect(wrapper.find("[data-tab]").exists()).toBe(false);
    expect(wrapper.find("nav").exists()).toBe(false);
  });

  it("offers a retry when the event fails to load", async () => {
    let fail = true;
    server.use(
      http.get(EVENT, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(event),
      ),
    );
    const { wrapper } = await mountLayout();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить событие");
    expect(wrapper.find('[data-tab="participants"]').exists()).toBe(false);

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(wrapper.find('[data-tab="participants"]').exists()).toBe(true);
  });

  it("keeps the header and the tab when a refetch of the event fails", async () => {
    let fail = false;
    server.use(
      http.get(EVENT, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(event),
      ),
    );
    const { wrapper, queryClient } = await mountLayout();
    await flushPromises();

    fail = true;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить событие");
    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(counter(wrapper, "checkedIn")).toBe("1");
    expect(wrapper.find('[data-tab="participants"]').exists()).toBe(true);
  });

  it("opens the stream once the event has loaded", async () => {
    const backend = countedEvent();
    backend.hold();
    server.use(backend.handler);
    await mountLayout();
    await vi.waitFor(() => expect(backend.gets()).toBe(1));

    expect(streams.opened).toEqual([]);
    backend.release();
    await vi.waitFor(() => expect(streams.opened).toHaveLength(1));

    expect(streams.opened[0]?.url).toBe("/api/org/events/7/stream/");
  });

  it("takes the whole event from a snapshot, for the header and the tab", async () => {
    server.use(http.get(EVENT, () => HttpResponse.json(event)));
    const { wrapper } = await mountLayout();
    await flushPromises();

    streams.opened[0]?.emit("snapshot", {
      ...event,
      title: "Meetup, room 2",
      waitlisted: 0,
      checked_in: 2,
    });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Meetup, room 2");
    expect(
      ["capacity", "confirmed", "waitlisted", "checkedIn", "freeSeats"].map((key) =>
        counter(wrapper, key),
      ),
    ).toEqual(["2", "2", "0", "2", "0"]);
    expect(wrapper.get('[data-tab="participants"]').text()).toBe("Meetup, room 2");
  });

  it("keeps the stream and the event when the organizer switches tabs", async () => {
    const backend = countedEvent();
    server.use(backend.handler);
    const { wrapper, router } = await mountLayout();
    await flushPromises();

    await wrapper.get(`nav a[href="${checkinPath(7)}"]`).trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(checkinPath(7));
    expect(wrapper.find('[data-tab="checkin"]').exists()).toBe(true);
    await wrapper.get(`nav a[href="${orgEventPath(7)}"]`).trigger("click");
    await flushPromises();

    expect(currentTab(wrapper)).toBe("Участники");
    expect(backend.gets()).toBe(1);
    expect(streams.opened).toHaveLength(1);
    expect(streams.opened[0]?.closed).toBe(false);
  });

  // A GET that read the event before a snapshot could answer after it and put older counts
  // back: while the stream is open, the layout does not read the event itself.
  it("does not read the event again when the window regains focus", async () => {
    const backend = countedEvent();
    server.use(backend.handler);
    await mountLayout();
    await flushPromises();

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await flushPromises();
    focusManager.setFocused(undefined);

    expect(backend.gets()).toBe(1);
  });

  it("does not read the event again when the network comes back", async () => {
    const backend = countedEvent();
    server.use(backend.handler);
    await mountLayout();
    await flushPromises();

    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await flushPromises();

    expect(backend.gets()).toBe(1);
  });

  it("shows a cached event at once and leaves its refresh to the stream", async () => {
    const backend = countedEvent();
    server.use(backend.handler);
    const queryClient = newQueryClient();
    queryClient.setQueryData(["org", "events", 7], event);
    await queryClient.invalidateQueries();

    const { wrapper } = await mountLayout(orgEventPath(7), queryClient);
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(backend.gets()).toBe(0);
    expect(streams.opened).toHaveLength(1);
  });

  it("closes the stream when the event is left", async () => {
    server.use(http.get(EVENT, () => HttpResponse.json(event)));
    const { wrapper } = await mountLayout();
    await flushPromises();

    wrapper.unmount();

    expect(streams.opened[0]?.closed).toBe(true);
  });

  describe("on the check-in tab", () => {
    it("shows the title and every counter in a short header", async () => {
      server.use(http.get(EVENT, () => HttpResponse.json(event)));

      const { wrapper } = await mountLayout(checkinPath(7));
      await flushPromises();

      const header = wrapper.get('[data-header="compact"]');
      expect(header.get("h1").text()).toBe("Meetup");
      expect(
        ["capacity", "confirmed", "waitlisted", "checkedIn", "freeSeats"].map((key) =>
          counter(wrapper, key),
        ),
      ).toEqual(["2", "2", "1", "1", "0"]);
      expect(header.find("p").exists()).toBe(false);
      expect(currentTab(wrapper)).toBe("Чекин");
    });

    it("updates the arrivals from a snapshot", async () => {
      server.use(http.get(EVENT, () => HttpResponse.json(event)));
      const { wrapper } = await mountLayout(checkinPath(7));
      await flushPromises();

      streams.opened[0]?.emit("snapshot", { ...event, checked_in: 2 });
      await flushPromises();

      expect(counter(wrapper, "checkedIn")).toBe("2");
    });

    it("keeps the form when the event fails to load", async () => {
      server.use(http.get(EVENT, () => HttpResponse.json({}, { status: 500 })));

      const { wrapper } = await mountLayout(checkinPath(7));
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toContain(
        "Не удалось загрузить событие, чекин работает",
      );
      expect(wrapper.find('[data-tab="checkin"]').exists()).toBe(true);
    });

    it("keeps the title and the form when a refetch of the event fails", async () => {
      let fail = false;
      server.use(
        http.get(EVENT, () =>
          fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(event),
        ),
      );
      const { wrapper, queryClient } = await mountLayout(checkinPath(7));
      await flushPromises();

      fail = true;
      await queryClient.refetchQueries();
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toContain(
        "Не удалось обновить событие, чекин работает",
      );
      expect(wrapper.get("h1").text()).toBe("Meetup");
      expect(wrapper.find('[data-tab="checkin"]').exists()).toBe(true);
    });
  });
});
