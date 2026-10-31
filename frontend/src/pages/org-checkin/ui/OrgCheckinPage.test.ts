import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
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
});

async function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: routes.orgCheckin, component: OrgCheckinPage },
      { path: routes.login, component: { template: "<div />" } },
    ],
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

describe("OrgCheckinPage", () => {
  it("puts the cursor into the code field when the screen opens", async () => {
    const wrapper = await mountPage();
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get("#code").element);
  });

  it("lets a confirmed ticket in, shows who it is and is ready for the next code", async () => {
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
    const field = wrapper.get<HTMLInputElement>("#code");
    expect(field.element.value).toBe("");
    expect(document.activeElement).toBe(field.element);
  });

  it("says the ticket is not found", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 404 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ZZZZZZZZ");

    expect(wrapper.get('[data-answer="not_found"]').text()).toBe("Билет не найден");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows an error when the check-in fails", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 500 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось отметить");
  });

  it("asks to sign in again when the session has ended", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 401 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain("Сессия истекла");
    expect(alert.get(`a[href="${routes.login}"]`).text()).toBe("Войти");
  });

  it("says the event belongs to another organizer", async () => {
    server.use(http.post(CHECKIN, () => HttpResponse.json({}, { status: 403 })));
    const wrapper = await mountPage();

    await enter(wrapper, "ABCD2345");

    expect(wrapper.get('[role="alert"]').text()).toBe("Это событие другого организатора");
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
