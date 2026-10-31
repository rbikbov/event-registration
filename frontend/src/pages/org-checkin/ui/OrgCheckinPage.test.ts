import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { checkinPath, orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgCheckinPage from "./OrgCheckinPage.vue";

const CHECKIN = "*/api/org/events/7/checkin/";
const EVENT = "*/api/org/events/7/";
const event = {
  id: 7,
  title: "Meetup",
  description: "",
  starts_at: "2030-05-01T18:00:00Z",
  capacity: 10,
  confirmed: 3,
  waitlisted: 0,
  checked_in: 1,
  free_seats: 7,
};
const checkedIn = {
  result: "checked_in",
  name: "Ivan",
  masked_email: "iv***@gmail.com",
  checked_in_at: "2030-05-01T15:42:00Z",
};

let mounted: { unmount(): void } | undefined;

// Mounted into the document for focus checks: a failed test must not leave its field behind.
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

// The screen loads its event for the title; a test about the event passes its own answer.
async function mountPage(eventResponse: () => Response = () => HttpResponse.json(event)) {
  server.use(http.get(EVENT, eventResponse));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routes.orgCheckin, component: OrgCheckinPage }],
  });
  await router.push(checkinPath(7));
  const wrapper = mount(OrgCheckinPage, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
  });
  mounted = wrapper;
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>;

async function enter(wrapper: Wrapper, code: string): Promise<void> {
  await wrapper.get("#code").setValue(code);
  await wrapper.get("form").trigger("submit");
  await flushPromises();
}

function nextButton(wrapper: Wrapper) {
  const found = wrapper.findAll("button").find((b) => b.text() === "Следующий");
  if (found === undefined) throw new Error('No button "Следующий"');
  return found;
}

describe("OrgCheckinPage", () => {
  it("puts the cursor into the code field when the screen opens", async () => {
    const wrapper = await mountPage();
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get("#code").element);
  });

  it("lets a confirmed ticket in and shows who it is instead of the form", async () => {
    let sent: unknown;
    server.use(
      http.post(CHECKIN, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(checkedIn);
      }),
    );
    const wrapper = await mountPage();

    await enter(wrapper, "abcd2345");

    expect(sent).toEqual({ code: "abcd2345" });
    const answer = wrapper.get('[data-answer="checked_in"]');
    expect(answer.text()).toContain("Пропущен");
    expect(answer.text()).toContain("Ivan");
    expect(answer.text()).toContain("iv***@gmail.com");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(nextButton(wrapper).element);
  });

  it("brings back an empty, focused field for the next participant", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json(checkedIn)));
    const wrapper = await mountPage();
    await enter(wrapper, "ABCD2345");

    await nextButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-answer]").exists()).toBe(false);
    const field = wrapper.get<HTMLInputElement>("#code");
    expect(field.element.value).toBe("");
    expect(document.activeElement).toBe(field.element);
  });

  it("says the ticket is not found until the organizer moves on", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 404 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ZZZZZZZZ");

    expect(wrapper.get('[data-answer="not_found"]').text()).toContain("Билет не найден");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("says a repeat ticket was already let in, and when", async () => {
    server.use(
      http.post(CHECKIN, () => HttpResponse.json({ ...checkedIn, result: "already_checked_in" })),
    );
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    // The time is shown in the browser's time zone, like the rest of the app.
    const time = new Intl.DateTimeFormat("ru", { timeStyle: "short" }).format(
      new Date(checkedIn.checked_in_at),
    );
    const answer = wrapper.get('[data-answer="already_checked_in"]');
    expect(answer.text()).toContain(`Уже отмечен в ${time}`);
    expect(answer.text()).toContain("Ivan");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(nextButton(wrapper).element);
  });

  it("says a waitlisted or cancelled ticket is not confirmed", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 409 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    expect(wrapper.get('[data-answer="not_confirmed"]').text()).toContain(
      "Билет не подтверждён: лист ожидания или отказ",
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("says there is no connection and keeps the code for a retry", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.error()));
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    expect(wrapper.get('[role="alert"]').text()).toBe("Нет связи, повторите");
    expect(wrapper.find("[data-answer]").exists()).toBe(false);
    expect(wrapper.get<HTMLInputElement>("#code").element.value).toBe("ABCD2345");
  });

  it("sends one request for a double Enter", async () => {
    let requests = 0;
    let answer: () => void = () => undefined;
    server.use(
      http.post(CHECKIN, () => {
        requests += 1;
        return new Promise<Response>((resolve) => {
          answer = () => resolve(HttpResponse.json(checkedIn));
        });
      }),
    );
    const wrapper = await mountPage();

    await wrapper.get("#code").setValue("ABCD2345");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    answer();
    await flushPromises();

    expect(requests).toBe(1);
    expect(wrapper.find('[data-answer="checked_in"]').exists()).toBe(true);
  });

  it("keeps the code for a retry when the check-in fails", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json(checkedIn)));
    const wrapper = await mountPage();
    await enter(wrapper, "ABCD2345");
    await nextButton(wrapper).trigger("click");
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 500 })));

    await enter(wrapper, "EFGH6789");

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось отметить");
    expect(wrapper.find("[data-answer]").exists()).toBe(false);
    expect(wrapper.get<HTMLInputElement>("#code").element.value).toBe("EFGH6789");
  });

  it("says the event belongs to another organizer", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 403 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    expect(wrapper.get('[role="alert"]').text()).toBe("Это событие другого организатора");
  });

  it("keeps the field read-only while the code is being checked", async () => {
    let answer: () => void = () => undefined;
    server.use(
      http.post(
        CHECKIN,
        () =>
          new Promise<Response>((resolve) => {
            answer = () => resolve(HttpResponse.json(checkedIn));
          }),
      ),
    );
    const wrapper = await mountPage();

    await wrapper.get("#code").setValue("ABCD2345");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("#code").attributes("readonly")).toBeDefined();

    answer();
    await flushPromises();
    await nextButton(wrapper).trigger("click");
    expect(wrapper.get("#code").attributes("readonly")).toBeUndefined();
  });

  it("does not send an empty code", async () => {
    let requests = 0;
    server.use(
      http.post(CHECKIN, () => {
        requests += 1;
        return HttpResponse.json(checkedIn);
      }),
    );
    const wrapper = await mountPage();

    await enter(wrapper, "   ");

    expect(requests).toBe(0);
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
  });

  it("names the event in the title and links back to its panel", async () => {
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Чекин: Meetup");
    expect(wrapper.get(`a[href="${orgEventPath(7)}"]`).text()).toBe("Панель события");
  });

  it("says a missing event is not found instead of taking codes", async () => {
    const wrapper = await mountPage(() => HttpResponse.json({}, { status: 404 }));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Событие не найдено");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("says someone else's event is foreign instead of taking codes", async () => {
    const wrapper = await mountPage(() => HttpResponse.json({}, { status: 403 }));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Это событие другого организатора");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("keeps checking codes in when the event title fails to load", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json(checkedIn)));
    const wrapper = await mountPage(() => HttpResponse.json({}, { status: 500 }));
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось загрузить событие");
    expect(wrapper.get("h1").text()).toBe("Чекин");
    await enter(wrapper, "abcd2345");

    expect(wrapper.find('[data-answer="checked_in"]').exists()).toBe(true);
  });
});
