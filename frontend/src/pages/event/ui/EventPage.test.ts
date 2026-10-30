import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import EventPage from "./EventPage.vue";

import { publicEventsQuery } from "@/entities/event";
import { eventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

const event = {
  id: 7,
  title: "Meetup",
  description: "Talks and pizza",
  starts_at: "2030-05-01T15:00:00Z",
  capacity: 5,
  free_seats: 2,
};

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.event, component: EventPage },
      { path: routes.home, component: { template: "<div />" } },
    ],
  });
  await router.push(eventPath(7));
  const wrapper = mount(EventPage, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false));
  return { wrapper, queryClient };
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>["wrapper"];

async function fill(wrapper: Wrapper, values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) await wrapper.get(`#${id}`).setValue(value);
  await wrapper.get("form").trigger("submit");
  await settled(wrapper);
}

// The request goes through the network layer, so it takes more than one flush: wait until the
// submit button is no longer disabled (or the form gave way to the result).
async function settled(wrapper: Wrapper) {
  await vi.waitFor(() => expect(wrapper.find("button[disabled]").exists()).toBe(false));
}

function eventLoaded(): void {
  server.use(http.get("*/api/events/7/", () => HttpResponse.json(event)));
}

describe("EventPage", () => {
  it("shows the event with its free seats and the form", async () => {
    eventLoaded();

    const { wrapper } = await mountPage();

    const text = wrapper.text();
    expect(text).toContain("Meetup");
    expect(text).toContain("Talks and pizza");
    expect(text).toContain("Свободно 2 места");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("says there are no seats at 0", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({ ...event, free_seats: 0 })));

    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain("Свободных мест нет");
  });

  it("shows 'not found' for an unknown event", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({}, { status: 404 })));

    const { wrapper } = await mountPage();

    expect(wrapper.get('[role="alert"]').text()).toBe("Такого события нет");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("shows a load error with a retry", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({}, { status: 500 })));
    const { wrapper } = await mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить событие");

    eventLoaded();
    await wrapper.get('[role="alert"] button').trigger("click");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Talks and pizza"));
  });

  it("registers, shows the result and refreshes the lists", async () => {
    eventLoaded();
    let body: unknown;
    server.use(
      http.post("*/api/events/7/registrations/", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: "confirmed" }, { status: 201 });
      }),
    );
    const { wrapper, queryClient } = await mountPage();
    queryClient.setQueryData(publicEventsQuery.queryKey, []);

    await fill(wrapper, { email: " a@x.io ", name: "Ann" });

    expect(body).toEqual({ email: "a@x.io", name: "Ann" });
    expect(wrapper.get('[role="status"]').text()).toBe("Место подтверждено");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(queryClient.getQueryState(publicEventsQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("shows the same result for a repeated registration", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () => HttpResponse.json({ status: "confirmed" })),
    );
    const { wrapper } = await mountPage();

    await fill(wrapper, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="status"]').text()).toBe("Место подтверждено");
  });

  it("flags empty fields without sending a request", async () => {
    eventLoaded();
    const { wrapper } = await mountPage();

    await fill(wrapper, { email: "", name: "" });

    expect(wrapper.text()).toContain("Обязательное поле");
    expect(wrapper.get("#email").attributes("aria-invalid")).toBe("true");
    expect(wrapper.get("#name").attributes("aria-invalid")).toBe("true");
  });

  it("flags a malformed email", async () => {
    eventLoaded();
    const { wrapper } = await mountPage();

    await fill(wrapper, { email: "nope", name: "Ann" });

    expect(wrapper.text()).toContain("Некорректное значение");
    expect(wrapper.get("#name").attributes("aria-invalid")).toBe("false");
  });

  it("shows server field errors under their field", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () =>
        HttpResponse.json({ errors: { email: ["invalid"] } }, { status: 400 }),
      ),
    );
    const { wrapper } = await mountPage();

    await fill(wrapper, { email: "a@x.io", name: "Ann" });

    expect(wrapper.text()).toContain("Некорректное значение");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("says the seats ran out on a 409 and keeps the form", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () =>
        HttpResponse.json({ detail: "No free seats." }, { status: 409 }),
      ),
    );
    const { wrapper } = await mountPage();

    await fill(wrapper, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="alert"]').text()).toBe("Свободных мест не осталось");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("shows a general error when the server fails", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () => HttpResponse.json({}, { status: 500 })),
    );
    const { wrapper } = await mountPage();

    await fill(wrapper, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Не удалось зарегистрироваться, попробуйте позже",
    );
  });

  it("disables the submit button while the request is in flight", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ status: "confirmed" }, { status: 201 });
      }),
    );
    const { wrapper } = await mountPage();
    await wrapper.get("#email").setValue("a@x.io");
    await wrapper.get("#name").setValue("Ann");

    await wrapper.get("form").trigger("submit");

    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    await settled(wrapper);
  });
});
