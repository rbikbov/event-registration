import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import type { OrgEvent } from "@/entities/event";
import { orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgEventParticipantsPage from "./OrgEventParticipantsPage.vue";

const REGISTRATIONS = "*/api/org/events/7/registrations/";
const event: OrgEvent = {
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

afterEach(() => vi.useRealTimers());

// The page reads the clock to tell today's check-in from an earlier one; timers stay real.
function nowIs(moment: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(moment);
}

// The event comes from the layout (pages/org-event), which reads it and keeps it live.
// A snapshot of the stream reaches the page as a new `event` prop.
async function mountPage(query: Record<string, string> = {}, shown: OrgEvent = event) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.orgEvent, component: OrgEventParticipantsPage }],
  });
  await router.push({ path: orgEventPath(7), query });
  const wrapper = mount(OrgEventParticipantsPage, {
    props: { event: shown },
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

describe("OrgEventParticipantsPage", () => {
  it("shows a loading state until the participants arrive", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([])));

    const { wrapper } = await mountPage();

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    await flushPromises();
  });

  it("lists the participants with the status, waitlist place and check-in time", async () => {
    nowIs(new Date(ann.checked_in_at));
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann, bob, cid])));

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

  it("gives the date of a check-in made on another day", async () => {
    nowIs(new Date(new Date(ann.checked_in_at).getTime() + 24 * 60 * 60 * 1000));
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann])));

    const { wrapper } = await mountPage();
    await flushPromises();

    const moment = new Intl.DateTimeFormat("ru", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ann.checked_in_at));
    expect(wrapper.findAll("tbody td").at(-1)?.text()).toBe(moment);
  });

  it("asks the server for the status from the URL and marks that filter", async () => {
    const asked: (string | null)[] = [];
    server.use(
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
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([])));

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Регистраций пока нет");
    expect(wrapper.find("table").exists()).toBe(false);
  });

  it("offers a retry when the participants fail to load", async () => {
    let fail = true;
    server.use(
      http.get(REGISTRATIONS, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([ann]),
      ),
    );
    const { wrapper } = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить участников");

    fail = false;
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("keeps the table when a refetch of the participants fails", async () => {
    let fail = false;
    server.use(
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

  // 120 registrations in all: three pages of 50.
  const crowded: OrgEvent = {
    ...event,
    capacity: 100,
    confirmed: 100,
    waitlisted: 15,
    cancelled: 5,
  };

  function pageNav(wrapper: Awaited<ReturnType<typeof mountPage>>["wrapper"]) {
    return wrapper.get('nav[aria-label="Страницы участников"]');
  }

  // The page numbers of the bar, the current one in brackets.
  function pageNumbers(wrapper: Awaited<ReturnType<typeof mountPage>>["wrapper"]) {
    return pageNav(wrapper)
      .findAll("[data-type='page']")
      .map((b) => (b.attributes("aria-current") === "page" ? `[${b.text()}]` : b.text()));
  }

  it("asks the server for the page from the URL and goes to the next one", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(REGISTRATIONS, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("page"));
        return HttpResponse.json([ann]);
      }),
    );

    const { wrapper, router } = await mountPage({ page: "2" }, crowded);
    await vi.waitFor(() => expect(asked).toEqual(["2"]));
    expect(pageNumbers(wrapper)).toEqual(["1", "[2]", "3"]);

    await pageNav(wrapper).get('button[aria-label="Следующая страница"]').trigger("click");

    await vi.waitFor(() => expect(asked).toEqual(["2", "3"]));
    expect(router.currentRoute.value.fullPath).toBe(`${orgEventPath(7)}?page=3`);
  });

  it("counts the pages of the filter and keeps it on another page", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann])));

    const { wrapper, router } = await mountPage({ status: "confirmed" }, crowded);
    await vi.waitFor(() => expect(pageNumbers(wrapper)).toEqual(["[1]", "2"]));

    await pageNav(wrapper).get('button[aria-label="Страница 2"]').trigger("click");

    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(`${orgEventPath(7)}?status=confirmed&page=2`),
    );
  });

  it("has no page links when everything fits on one page", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann, bob, cid])));

    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.find('nav[aria-label="Страницы участников"]').exists()).toBe(false);
  });

  it("starts a filter from its first page", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann])));

    const { wrapper } = await mountPage({ page: "3" }, crowded);
    await flushPromises();

    const filter = wrapper.findAll("nav a").find((a) => a.text() === "Лист ожидания");
    expect(filter?.attributes("href")).toBe(`${orgEventPath(7)}?status=waitlisted`);
  });

  it("says a page past the end is empty and links the last one", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([])));

    const { wrapper } = await mountPage({ page: "9" }, crowded);
    await flushPromises();

    expect(wrapper.text()).toContain("На этой странице никого нет.");
    const last = wrapper.findAll("a").find((a) => a.text() === "К последней странице");
    expect(last?.attributes("href")).toBe(`${orgEventPath(7)}?page=3`);
  });

  it("offers a refresh when a snapshot brings other counts, and reads the page again", async () => {
    let rows = [ann, bob];
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json(rows)));
    const { wrapper } = await mountPage();
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    await wrapper.setProps({ event: { ...event, checked_in: 2 } });
    rows = [ann, { ...bob, checked_in_at: "2030-05-01T18:05:00Z" }];

    expect(wrapper.get('[role="status"]').text()).toContain("Есть обновления");
    expect(wrapper.findAll("tbody tr")[1]?.text()).toContain("—");
    await wrapper.get('[role="status"] button').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.findAll("tbody tr")[1]?.text()).not.toContain("—");
  });

  it("does not offer a refresh for a snapshot with the same counts", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann])));
    const { wrapper } = await mountPage();
    await flushPromises();

    await wrapper.setProps({ event: { ...event, title: "Meetup, room 2" } });

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  // The page may have been read before that change: only a new read can say.
  it("offers a refresh for a snapshot that came while the page was read", async () => {
    let answer = () => {};
    server.use(
      http.get(
        REGISTRATIONS,
        () =>
          new Promise<Response>((resolve) => (answer = () => resolve(HttpResponse.json([ann])))),
      ),
    );
    const { wrapper } = await mountPage();
    await flushPromises();

    await wrapper.setProps({ event: { ...event, confirmed: 3 } });
    answer();
    await flushPromises();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(wrapper.get('[role="status"]').text()).toContain("Есть обновления");
  });

  it("blocks the refresh while the page is being read", async () => {
    server.use(http.get(REGISTRATIONS, () => HttpResponse.json([ann])));
    const { wrapper } = await mountPage();
    await flushPromises();
    await wrapper.setProps({ event: { ...event, waitlisted: 2 } });
    server.use(http.get(REGISTRATIONS, () => new Promise<Response>(() => {})));

    await wrapper.get('[role="status"] button').trigger("click");
    await flushPromises();

    const button = wrapper.get('[role="status"] button');
    expect(button.text()).toBe("Обновляем…");
    expect(button.attributes("disabled")).toBeDefined();
  });
});
