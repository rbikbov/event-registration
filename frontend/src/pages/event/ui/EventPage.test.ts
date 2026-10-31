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
  return { wrapper, queryClient, router };
}

type Page = Awaited<ReturnType<typeof mountPage>>;

async function fill(page: Page, values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) {
    await page.wrapper.get(`#${id}`).setValue(value);
  }
  await page.wrapper.get("form").trigger("submit");
  await settled(page);
}

// The request goes through the network layer, so it takes more than one flush. The mutation is
// in the client from the submit on, while the disabled button shows up only after a render:
// waiting for the button alone may pass before the request has started.
async function settled({ wrapper, queryClient }: Page) {
  await vi.waitFor(() => {
    expect(queryClient.isMutating()).toBe(0);
    expect(wrapper.find("button[disabled]").exists()).toBe(false);
  });
}

function eventLoaded(): void {
  server.use(http.get("*/api/events/7/", () => HttpResponse.json(event)));
}

describe("EventPage", () => {
  it("shows the event with its free seats and the form", async () => {
    eventLoaded();

    const page = await mountPage();
    const { wrapper } = page;

    const text = wrapper.text();
    expect(text).toContain("Meetup");
    expect(text).toContain("Talks and pizza");
    expect(text).toContain("Свободно 2 места");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("says there are no seats at 0", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({ ...event, free_seats: 0 })));

    const page = await mountPage();
    const { wrapper } = page;

    expect(wrapper.text()).toContain("Свободных мест нет");
  });

  it("shows 'not found' for an unknown event", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({}, { status: 404 })));

    const page = await mountPage();
    const { wrapper } = page;

    expect(wrapper.get('[role="alert"]').text()).toBe("Такого события нет");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("shows a load error with a retry", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({}, { status: 500 })));
    const page = await mountPage();
    const { wrapper } = page;
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
    const page = await mountPage();
    const { wrapper, queryClient } = page;
    queryClient.setQueryData(publicEventsQuery.queryKey, []);

    await fill(page, { email: " a@x.io ", name: "Ann" });

    expect(body).toEqual({ email: "a@x.io", name: "Ann" });
    expect(wrapper.get('[role="status"]').text()).toBe("Место подтверждено");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(queryClient.getQueryState(publicEventsQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("forgets the result when the route moves to another event", async () => {
    eventLoaded();
    server.use(
      http.get("*/api/events/8/", () => HttpResponse.json({ ...event, id: 8, title: "Other" })),
      http.post("*/api/events/7/registrations/", () =>
        HttpResponse.json({ status: "confirmed" }, { status: 201 }),
      ),
    );
    const page = await mountPage();
    const { wrapper, router } = page;
    await fill(page, { email: "a@x.io", name: "Ann" });
    expect(wrapper.get('[role="status"]').text()).toBe("Место подтверждено");

    await router.push(eventPath(8));

    await vi.waitFor(() => expect(wrapper.text()).toContain("Other"));
    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("shows the same result for a repeated registration", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () => HttpResponse.json({ status: "confirmed" })),
    );
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="status"]').text()).toBe("Место подтверждено");
  });

  it("flags empty fields without sending a request", async () => {
    eventLoaded();
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "", name: "" });

    expect(wrapper.text()).toContain("Обязательное поле");
    expect(wrapper.get("#email").attributes("aria-invalid")).toBe("true");
    expect(wrapper.get("#name").attributes("aria-invalid")).toBe("true");
  });

  it("flags a malformed email", async () => {
    eventLoaded();
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "nope", name: "Ann" });

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
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "a@x.io", name: "Ann" });

    expect(wrapper.text()).toContain("Некорректное значение");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows the waitlist position", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () =>
        HttpResponse.json({ status: "waitlisted", position: 3 }, { status: 201 }),
      ),
    );
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="status"]').text()).toBe("Вы в листе ожидания, №3");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("does not claim a seat when a waitlisted result has no position", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () =>
        HttpResponse.json({ status: "waitlisted" }, { status: 201 }),
      ),
    );
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="status"]').text()).toBe("Вы в листе ожидания");
  });

  it("offers the waitlist when no seats are left", async () => {
    server.use(http.get("*/api/events/7/", () => HttpResponse.json({ ...event, free_seats: 0 })));
    const page = await mountPage();
    const { wrapper } = page;

    expect(wrapper.text()).toContain("Свободных мест нет, можно встать в лист ожидания");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("shows a general error when the server fails", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", () => HttpResponse.json({}, { status: 500 })),
    );
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "a@x.io", name: "Ann" });

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Не удалось зарегистрироваться, попробуйте позже",
    );
  });

  it("keeps the form and the loaded event when a registration fails", async () => {
    let loads = 0;
    server.use(
      http.get("*/api/events/7/", () => {
        loads += 1;
        // Only the first load works: a reload after the failure must not be what keeps the form.
        return loads === 1 ? HttpResponse.json(event) : HttpResponse.error();
      }),
      http.post("*/api/events/7/registrations/", () => HttpResponse.error()),
    );
    const page = await mountPage();
    const { wrapper } = page;

    await fill(page, { email: "a@x.io", name: "Ann" });

    expect(loads).toBe(1);
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Не удалось зарегистрироваться, попробуйте позже",
    );
    expect(wrapper.get("#email").element).toHaveProperty("value", "a@x.io");
  });

  it("disables the submit button while the request is in flight", async () => {
    eventLoaded();
    server.use(
      http.post("*/api/events/7/registrations/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ status: "confirmed" }, { status: 201 });
      }),
    );
    const page = await mountPage();
    const { wrapper } = page;
    await wrapper.get("#email").setValue("a@x.io");
    await wrapper.get("#name").setValue("Ann");

    await wrapper.get("form").trigger("submit");

    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    await settled(page);
  });

  it("keeps the event and the typed values when a refetch fails", async () => {
    let fail = false;
    server.use(
      http.get("*/api/events/7/", () => (fail ? HttpResponse.error() : HttpResponse.json(event))),
    );
    const { wrapper, queryClient } = await mountPage();
    await wrapper.get("#email").setValue("a@x.io");

    fail = true;
    await queryClient.refetchQueries();
    await vi.waitFor(() =>
      expect(wrapper.find('[role="alert"]').text()).toContain("Не удалось обновить событие"),
    );

    expect(wrapper.get("h1").text()).toBe("Meetup");
    expect(wrapper.get("#email").element).toHaveProperty("value", "a@x.io");
  });
});
