import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { orgEventsQuery, publicEventsQuery } from "@/entities/event";
import { routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgEventNewPage from "./OrgEventNewPage.vue";

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.orgEventsNew, component: OrgEventNewPage },
      { path: routes.orgEvents, component: { template: "<div />" } },
    ],
  });
  await router.push(routes.orgEventsNew);
  const wrapper = mount(OrgEventNewPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  return { wrapper, router, queryClient };
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>["wrapper"];

async function fill(wrapper: Wrapper, values: Record<string, string>) {
  await type(wrapper, values);
  await wrapper.get("form").trigger("submit");
  await flushPromises();
}

// The number field applies what was typed on blur or Enter, not on every keystroke.
async function type(wrapper: Wrapper, values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) {
    await wrapper.get(`#${id}`).setValue(value);
    await wrapper.get(`#${id}`).trigger("blur");
  }
}

function nextYear(): string {
  return `${new Date().getFullYear() + 1}-05-01T18:00`;
}

const valid = () => ({ title: "Meetup", starts_at: nextYear(), capacity: "30" });

describe("OrgEventNewPage", () => {
  it("creates the event, refreshes the list and returns to it", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/org/events/", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 1, ...(body as object) }, { status: 201 });
      }),
    );
    const { wrapper, router, queryClient } = await mountPage();
    queryClient.setQueryData(orgEventsQuery.queryKey, []);
    queryClient.setQueryData(publicEventsQuery.queryKey, []);

    await fill(wrapper, { ...valid(), description: "Talks" });

    expect(body).toMatchObject({ title: "Meetup", description: "Talks", capacity: 30 });
    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
    expect(queryClient.getQueryState(orgEventsQuery.queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(publicEventsQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("shows field errors without sending a request", async () => {
    const { wrapper } = await mountPage();

    await fill(wrapper, { title: "", starts_at: "", capacity: "0" });

    const text = wrapper.text();
    expect(text).toContain("Обязательное поле");
    expect(text).toContain("Должно быть не меньше 1");
  });

  it("shows server field errors under the field they belong to", async () => {
    server.use(
      http.post("*/api/org/events/", () =>
        HttpResponse.json({ errors: { starts_at: ["past"] } }, { status: 400 }),
      ),
    );
    const { wrapper, router } = await mountPage();

    await fill(wrapper, valid());

    expect(wrapper.text()).toContain("Начало должно быть в будущем");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(router.currentRoute.value.path).toBe(routes.orgEventsNew);
  });

  it("drops the server error of a field once the field is edited", async () => {
    server.use(
      http.post("*/api/org/events/", () =>
        HttpResponse.json({ errors: { starts_at: ["past"] } }, { status: 400 }),
      ),
    );
    const { wrapper } = await mountPage();
    await fill(wrapper, valid());
    expect(wrapper.text()).toContain("Начало должно быть в будущем");

    await type(wrapper, { starts_at: `${new Date().getFullYear() + 2}-05-01T18:00` });

    expect(wrapper.text()).not.toContain("Начало должно быть в будущем");
    expect(wrapper.get("#starts_at").attributes("aria-invalid")).toBe("false");
  });

  it("shows a general error when the server fails", async () => {
    server.use(http.post("*/api/org/events/", () => HttpResponse.json({}, { status: 500 })));
    const { wrapper } = await mountPage();

    await fill(wrapper, valid());

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Не удалось создать событие, попробуйте позже",
    );
  });

  it("disables the submit button while the request is in flight", async () => {
    server.use(
      http.post("*/api/org/events/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );
    const { wrapper } = await mountPage();
    await type(wrapper, valid());

    await wrapper.get("form").trigger("submit");

    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    await flushPromises();
  });
});
