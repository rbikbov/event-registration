import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import HomePage from "./HomePage.vue";

import { eventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

// A list answer: one page with all the events.
function page<T>(results: T[]) {
  return { count: results.length, results };
}

async function mountPage(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return (await mountAt(routes.home, queryClient)).wrapper;
}

async function mountAt(
  path: string,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.home, component: HomePage }],
  });
  await router.push(path);
  const wrapper = mount(HomePage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false));
  return { wrapper, router };
}

// Answers with one event per page, numbered by the page asked, of `count` in all; keeps the pages.
function pagedList(count: number) {
  const asked: (string | null)[] = [];
  server.use(
    http.get("*/api/events/", ({ request }) => {
      const pageAsked = new URL(request.url).searchParams.get("page");
      asked.push(pageAsked);
      const n = Number(pageAsked ?? 1);
      return HttpResponse.json({ count, results: n <= 3 ? [item(n * 100, 1)] : [] });
    }),
  );
  return asked;
}

const item = (id: number, free_seats: number) => ({
  id,
  title: `Meetup ${id}`,
  starts_at: "2030-05-01T15:00:00Z",
  capacity: 5,
  free_seats,
});

describe("HomePage", () => {
  it("lists events with free seats and links to each", async () => {
    server.use(http.get("*/api/events/", () => HttpResponse.json(page([item(1, 3), item(2, 0)]))));

    const wrapper = await mountPage();

    const text = wrapper.text();
    expect(text).toContain("Meetup 1");
    expect(text).toContain("свободно 3 места");
    // The list format of the app (shared/lib/i18n).
    expect(text).toContain(createAppI18n().global.d(new Date(item(1, 3).starts_at), "short"));
    expect(text).toContain("мест нет");
    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toEqual([eventPath(1), eventPath(2)]);
  });

  it("says so when there are no events", async () => {
    server.use(http.get("*/api/events/", () => HttpResponse.json({ count: 0, results: [] })));

    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("Ближайших событий пока нет");
  });

  it("shows an error with a retry that loads the list", async () => {
    server.use(http.get("*/api/events/", () => HttpResponse.json({}, { status: 500 })));
    const wrapper = await mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить события");

    server.use(http.get("*/api/events/", () => HttpResponse.json(page([item(1, 1)]))));
    await wrapper.get('[role="alert"] button').trigger("click");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Meetup 1"));
  });

  it("shows loading before the answer", () => {
    server.use(http.get("*/api/events/", () => new Promise(() => undefined)));
    const queryClient = new QueryClient();
    const wrapper = mount(HomePage, {
      global: {
        plugins: [
          createRouter({ history: createMemoryHistory(), routes: [] }),
          [VueQueryPlugin, { queryClient }],
          createAppI18n(),
        ],
      },
    });

    expect(wrapper.get('[role="status"]').text()).toBe("Загружаем…");
  });

  it("keeps the list when a refetch fails, with the error above it", async () => {
    let fail = false;
    server.use(
      http.get("*/api/events/", () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(page([item(1, 3)])),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = await mountPage(queryClient);

    fail = true;
    await queryClient.refetchQueries();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').text()).toContain("Не удалось обновить события"),
    );

    expect(wrapper.text()).toContain("Meetup 1");
  });

  it("shows no page bar when the events fit on one page", async () => {
    server.use(http.get("*/api/events/", () => HttpResponse.json(page([item(1, 3)]))));
    const wrapper = await mountPage();

    expect(wrapper.find("nav").exists()).toBe(false);
  });

  it("reads the page from the address and goes to the next one", async () => {
    const asked = pagedList(45);
    const { wrapper, router } = await mountAt(`${routes.home}?page=2`);
    expect(wrapper.text()).toContain("Meetup 200");
    expect(wrapper.get("nav").attributes("aria-label")).toBe("Страницы событий");

    await wrapper.get('button[aria-label="Следующая страница"]').trigger("click");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Meetup 300"));
    expect(router.currentRoute.value.query).toEqual({ page: "3" });
    expect(asked).toEqual(["2", "3"]);
  });

  it("goes back to page 1 by the address without `page`", async () => {
    pagedList(45);
    const { wrapper, router } = await mountAt(`${routes.home}?page=2`);

    await wrapper.get('button[aria-label="Первая страница"]').trigger("click");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Meetup 100"));
    expect(router.currentRoute.value.fullPath).toBe(routes.home);
  });

  it("past the end, says so and links to the last page", async () => {
    pagedList(45);
    const { wrapper } = await mountAt(`${routes.home}?page=5`);

    expect(wrapper.text()).toContain("Здесь событий нет.");
    expect(wrapper.get(`a[href="${routes.home}?page=3"]`).text()).toBe("К последней странице");
    expect(wrapper.find("nav").exists()).toBe(false);
  });
});
