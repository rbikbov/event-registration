import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, RouterView } from "vue-router";

import { checkinPath, eventPath, orgEventPath, routes } from "@/shared/config";
import { createAppI18n } from "@/shared/lib/i18n";
import { server } from "@/shared/lib/test/msw";

import { createAppRouter } from "./router";

const user = { id: 1, email: "demo@example.com" };

function signedIn(): void {
  server.use(http.get("*/api/auth/me/", () => HttpResponse.json(user)));
}

function guest(): void {
  server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 401 })));
}

function setup() {
  return createAppRouter(new QueryClient(), createMemoryHistory());
}

describe("route guard", () => {
  it("sends a guest from an organizer page to /login", async () => {
    guest();
    const router = setup();

    await router.push(routes.orgEvents);

    expect(router.currentRoute.value.path).toBe(routes.login);
  });

  it("sends a guest from an event panel to /login with the way back", async () => {
    guest();
    const router = setup();

    await router.push(`${orgEventPath(7)}?status=waitlisted`);

    expect(router.currentRoute.value.path).toBe(routes.login);
    expect(router.currentRoute.value.query.next).toBe(`${orgEventPath(7)}?status=waitlisted`);
  });

  // The check-in is a tab of the event layout: it is guarded by the layout's route.
  it("sends a guest from the check-in to /login", async () => {
    guest();
    const router = setup();

    await router.push(checkinPath(7));

    expect(router.currentRoute.value.path).toBe(routes.login);
  });

  it("lets a signed-in user open an organizer page", async () => {
    signedIn();
    const router = setup();

    await router.push(routes.orgEvents);

    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
  });

  it("sends a signed-in user from /login to the organizer page", async () => {
    signedIn();
    const router = setup();

    await router.push(routes.login);

    expect(router.currentRoute.value.path).toBe(routes.orgEvents);
  });

  it("sends a signed-in user from /login to the page they were going to", async () => {
    signedIn();
    const router = setup();

    await router.push({ path: routes.login, query: { next: checkinPath(7) } });

    expect(router.currentRoute.value.fullPath).toBe(checkinPath(7));
  });

  it.each([
    ["another site", "//evil.example"],
    ["the sign-in page itself", "/login"],
  ])("sends a signed-in user to the organizer page when next is %s", async (_, next) => {
    signedIn();
    const router = setup();

    await router.push({ path: routes.login, query: { next } });

    expect(router.currentRoute.value.fullPath).toBe(routes.orgEvents);
  });

  it("does not ask the server about the session on every navigation", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/auth/me/", () => {
        calls += 1;
        return HttpResponse.json(user);
      }),
    );
    const router = setup();

    await router.push(routes.orgEvents);
    await router.push(routes.home);
    await router.push(routes.orgEvents);

    expect(calls).toBe(1);
  });

  it("fails loudly when the session check hits a server error", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 500 })));
    const router = setup();

    await expect(router.push(routes.orgEvents)).rejects.toMatchObject({ kind: "server" });
  });

  it("opens a public page without asking who is signed in", async () => {
    // No handler for `me`: the request would fail the test as unhandled.
    const router = setup();

    await router.push(eventPath(1));

    expect(router.currentRoute.value.path).toBe(eventPath(1));
  });
});

// Addresses no route of the app matches, so they are typed here rather than taken from `routes`.
describe("an address no route matches", () => {
  it.each([
    ["an unknown path", "/no-such-page"],
    ["an event id that is not a number", "/events/abc"],
    // Not an organizer route, so not guarded: no detour through /login. No handler for `me`:
    // asking it would fail the test as unhandled.
    ["an unknown path under /org", "/org/no-such-page"],
  ])("shows 'page not found' for %s and keeps the address", async (_case, path) => {
    const queryClient = new QueryClient();
    const router = setup();
    await router.push(path);
    const wrapper = mount(RouterView, {
      global: { plugins: [router, [VueQueryPlugin, { queryClient }], createAppI18n()] },
    });

    await vi.waitFor(() =>
      expect(wrapper.get('[role="alert"] h1').text()).toBe("Страница не найдена"),
    );
    expect(router.currentRoute.value.fullPath).toBe(path);
    expect(wrapper.get(`[role="alert"] a[href="${routes.home}"]`).text()).toBe("К событиям");
  });
});
