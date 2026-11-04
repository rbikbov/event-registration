import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgEventsPage from "./OrgEventsPage.vue";

const PAGE_NAV = 'nav[aria-label="Страницы событий"]';
const PERIOD_NAV = 'nav[aria-label="Какие события показать"]';

// A list answer: one page with all the events.
function page<T>(results: T[]) {
  return { count: results.length, results };
}

async function mountPage(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return (await mountAt(routes.orgEvents, queryClient)).wrapper;
}

async function mountAt(
  path: string,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.orgEvents, component: OrgEventsPage }],
  });
  await router.push(path);
  const wrapper = mount(OrgEventsPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router };
}

// Answers with one event per page, numbered by the page asked, of `count` in all; keeps the pages.
function pagedList(count: number) {
  const asked: (string | null)[] = [];
  server.use(
    http.get("*/api/org/events/", ({ request }) => {
      const pageAsked = new URL(request.url).searchParams.get("page");
      asked.push(pageAsked);
      const n = Number(pageAsked ?? 1);
      const event = {
        id: n,
        title: `Meetup ${n * 100}`,
        description: "",
        starts_at: "2030-05-01T18:00:00Z",
        capacity: 5,
        confirmed: 0,
        waitlisted: 0,
      };
      return HttpResponse.json({ count, results: n <= 3 ? [event] : [] });
    }),
  );
  return asked;
}

describe("OrgEventsPage", () => {
  it("shows a loading state until the list arrives", async () => {
    server.use(http.get("*/api/org/events/", () => HttpResponse.json({ count: 0, results: [] })));

    const wrapper = await mountPage();

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
    await flushPromises();
  });

  it("lists events with their capacity", async () => {
    server.use(
      http.get("*/api/org/events/", () =>
        HttpResponse.json(
          page([
            {
              id: 1,
              title: "Meetup",
              description: "",
              starts_at: "2030-05-01T18:00:00Z",
              capacity: 1,
              confirmed: 1,
              waitlisted: 0,
            },
            {
              id: 2,
              title: "Workshop",
              description: "",
              starts_at: "2030-06-01T18:00:00Z",
              capacity: 30,
              confirmed: 12,
              waitlisted: 3,
            },
          ]),
        ),
      ),
    );

    const wrapper = await mountPage();
    await flushPromises();

    const rows = wrapper.findAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain("Meetup");
    expect(rows[0]?.text()).toContain("Занято 1 из 1");
    // The list format of the app (shared/lib/i18n).
    expect(rows[0]?.text()).toContain(
      createAppI18n().global.d(new Date("2030-05-01T18:00:00Z"), "short"),
    );
    expect(rows[1]?.text()).toContain("Занято 12 из 30");
    expect(rows[1]?.text()).toContain("в листе ожидания 3");
    expect(rows[1]?.get(`a[href="${checkinPath(2)}"]`).text()).toBe("Чекин");
    expect(rows[1]?.get(`a[href="${orgEventPath(2)}"]`).text()).toBe("Workshop");
  });

  it("says there are no events yet and offers to create one", async () => {
    server.use(http.get("*/api/org/events/", () => HttpResponse.json({ count: 0, results: [] })));

    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Предстоящих событий нет");
    expect(wrapper.get(`a[href="${routes.orgEventsNew}"]`).text()).toBe("Создать событие");
  });

  it("shows an error and loads again on retry", async () => {
    server.use(http.get("*/api/org/events/", () => HttpResponse.json({}, { status: 500 })));
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить события");

    server.use(
      http.get("*/api/org/events/", () =>
        HttpResponse.json(
          page([
            {
              id: 1,
              title: "Meetup",
              description: "",
              starts_at: "2030-05-01T18:00:00Z",
              capacity: 5,
              confirmed: 0,
              waitlisted: 0,
            },
          ]),
        ),
      ),
    );
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Meetup");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("keeps the list when a refetch fails, with the error above it", async () => {
    let fail = false;
    server.use(
      http.get("*/api/org/events/", () =>
        fail
          ? HttpResponse.json({}, { status: 500 })
          : HttpResponse.json(
              page([
                {
                  id: 1,
                  title: "Meetup",
                  description: "",
                  starts_at: "2030-05-01T18:00:00Z",
                  capacity: 5,
                  confirmed: 0,
                  waitlisted: 0,
                },
              ]),
            ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = await mountPage(queryClient);
    await flushPromises();

    fail = true;
    await queryClient.refetchQueries();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось обновить события");
    expect(wrapper.findAll("li")).toHaveLength(1);
  });

  it("reads the page from the address and goes to the previous one", async () => {
    const asked = pagedList(45);
    const { wrapper, router } = await mountAt(`${routes.orgEvents}?page=3`);
    await vi.waitFor(() => expect(wrapper.text()).toContain("Meetup 300"));

    await wrapper.get(PAGE_NAV).get('button[aria-label="Предыдущая страница"]').trigger("click");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Meetup 200"));
    expect(router.currentRoute.value.query).toEqual({ page: "2" });
    expect(asked).toEqual(["3", "2"]);
  });

  it("past the end, says so and links to the last page", async () => {
    pagedList(45);
    const { wrapper } = await mountAt(`${routes.orgEvents}?page=4`);

    await vi.waitFor(() => expect(wrapper.text()).toContain("Здесь событий нет."));
    expect(wrapper.get(`a[href="${routes.orgEvents}?page=3"]`).text()).toBe("К последней странице");
    expect(wrapper.find(PAGE_NAV).exists()).toBe(false);
  });

  // Keeps the period and the page of each request; answers with `count` events in all.
  function recordedList(count: number) {
    const asked: string[] = [];
    server.use(
      http.get("*/api/org/events/", ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(`${query.get("period")} ${query.get("page")}`);
        return HttpResponse.json({ count, results: [] });
      }),
    );
    return asked;
  }

  type Wrapper = Awaited<ReturnType<typeof mountAt>>["wrapper"];

  // The tabs by their text, the chosen one in brackets.
  function tabs(wrapper: Wrapper) {
    return wrapper
      .findAll(`${PERIOD_NAV} a`)
      .map((a) => (a.attributes("aria-current") === "true" ? `[${a.text()}]` : a.text()));
  }

  function tab(wrapper: Wrapper, name: string) {
    const found = wrapper.findAll(`${PERIOD_NAV} a`).find((a) => a.text() === name);
    if (!found) throw new Error(`no tab "${name}"`);
    return found;
  }

  it("shows upcoming events by default", async () => {
    const asked = recordedList(0);
    const { wrapper } = await mountAt(routes.orgEvents);
    await vi.waitFor(() => expect(asked).toHaveLength(1));

    expect(tabs(wrapper)).toEqual(["[Предстоящие]", "Прошедшие"]);
    expect(asked).toEqual(["upcoming 1"]);
  });

  it("shows past events by the address, with their own empty text", async () => {
    const asked = recordedList(0);
    const { wrapper } = await mountAt(`${routes.orgEvents}?period=past`);

    await vi.waitFor(() => expect(wrapper.text()).toContain("Прошедших событий нет"));
    expect(tabs(wrapper)).toEqual(["Предстоящие", "[Прошедшие]"]);
    expect(asked).toEqual(["past 1"]);
  });

  it("opens another tab on its first page", async () => {
    const asked = recordedList(45);
    const { wrapper, router } = await mountAt(`${routes.orgEvents}?page=2`);
    await vi.waitFor(() => expect(asked).toEqual(["upcoming 2"]));

    await tab(wrapper, "Прошедшие").trigger("click");

    await vi.waitFor(() => expect(asked).toEqual(["upcoming 2", "past 1"]));
    expect(router.currentRoute.value.fullPath).toBe(`${routes.orgEvents}?period=past`);
  });

  it("keeps the tab when going to another page", async () => {
    const asked = recordedList(45);
    const { wrapper, router } = await mountAt(`${routes.orgEvents}?period=past`);
    await vi.waitFor(() => expect(wrapper.find(PAGE_NAV).exists()).toBe(true));

    await wrapper.get(PAGE_NAV).get('button[aria-label="Страница 2"]').trigger("click");

    await vi.waitFor(() => expect(asked).toEqual(["past 1", "past 2"]));
    expect(router.currentRoute.value.fullPath).toBe(`${routes.orgEvents}?period=past&page=2`);
  });
});
