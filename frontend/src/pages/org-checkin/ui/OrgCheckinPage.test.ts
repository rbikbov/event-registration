import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { checkinPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import OrgCheckinPage from "./OrgCheckinPage.vue";

const CHECKIN = "*/api/org/events/7/checkin/";
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
  vi.useRealTimers();
});

// The page reads the clock to tell today's check-in from an earlier one; timers stay real.
function nowIs(moment: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(moment);
}

function dayAfter(iso: string): Date {
  return new Date(new Date(iso).getTime() + 24 * 60 * 60 * 1000);
}

// The event and its title belong to the layout (pages/org-event): the screen reads no event,
// and an unhandled GET of one would fail the test.
async function mountPage() {
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

// "Next" waits a second after an answer; a test that moves on runs that second on fake timers.
function fakePause(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

async function moveOn(wrapper: Wrapper): Promise<void> {
  vi.advanceTimersByTime(1000);
  await flushPromises();
  await nextButton(wrapper).trigger("click");
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

  // A stray Enter or a held key must not take the answer away unread.
  it("keeps the next button inactive, and focused, for a second after the answer", async () => {
    fakePause();
    server.use(http.post(CHECKIN, () => HttpResponse.json(checkedIn)));
    const wrapper = await mountPage();
    await enter(wrapper, "ABCD2345");

    expect(nextButton(wrapper).attributes("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(nextButton(wrapper).element);
    await nextButton(wrapper).trigger("click");
    vi.advanceTimersByTime(999);
    await nextButton(wrapper).trigger("click");
    expect(wrapper.find('[data-answer="checked_in"]').exists()).toBe(true);

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(nextButton(wrapper).attributes("aria-disabled")).toBeUndefined();
    await nextButton(wrapper).trigger("click");
    expect(wrapper.find("[data-answer]").exists()).toBe(false);
  });

  it("brings back an empty, focused field for the next participant", async () => {
    fakePause();
    server.use(http.post(CHECKIN, () => HttpResponse.json(checkedIn)));
    const wrapper = await mountPage();
    await enter(wrapper, "ABCD2345");

    await moveOn(wrapper);

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
    nowIs(new Date(checkedIn.checked_in_at));
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

  it("gives the date of a check-in made on another day", async () => {
    nowIs(dayAfter(checkedIn.checked_in_at));
    server.use(
      http.post(CHECKIN, () => HttpResponse.json({ ...checkedIn, result: "already_checked_in" })),
    );
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    const moment = new Intl.DateTimeFormat("ru", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(checkedIn.checked_in_at));
    const answer = wrapper.get('[data-answer="already_checked_in"]');
    expect(answer.text()).toContain(`Уже отмечен ${moment}`);
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
    fakePause();
    server.use(http.post(CHECKIN, () => HttpResponse.json(checkedIn)));
    const wrapper = await mountPage();
    await enter(wrapper, "ABCD2345");
    await moveOn(wrapper);
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
    fakePause();
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
    await moveOn(wrapper);
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
});
