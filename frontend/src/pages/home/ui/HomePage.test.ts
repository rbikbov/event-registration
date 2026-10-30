import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import HomePage from "./HomePage.vue";

import { eventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  const wrapper = mount(HomePage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false));
  return wrapper;
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
    server.use(http.get("*/api/events/", () => HttpResponse.json([item(1, 3), item(2, 0)])));

    const wrapper = await mountPage();

    const text = wrapper.text();
    expect(text).toContain("Meetup 1");
    expect(text).toContain("свободно 3 места");
    expect(text).toContain("мест нет");
    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toEqual([routes.login, eventPath(1), eventPath(2)]);
  });

  it("says so when there are no events", async () => {
    server.use(http.get("*/api/events/", () => HttpResponse.json([])));

    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("Ближайших событий пока нет");
  });

  it("shows an error with a retry that loads the list", async () => {
    server.use(http.get("*/api/events/", () => HttpResponse.json({}, { status: 500 })));
    const wrapper = await mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить события");

    server.use(http.get("*/api/events/", () => HttpResponse.json([item(1, 1)])));
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
});
