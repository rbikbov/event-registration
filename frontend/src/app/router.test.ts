import { QueryClient } from "@tanstack/vue-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";

import { server } from "@/shared/lib/test/msw";

import { createAppRouter } from "./router";

const user = { id: 1, email: "demo@example.com" };

function signedIn(): void {
  server.use(http.get("*/api/auth/me/", () => HttpResponse.json(user)));
}

function guest(): void {
  server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 403 })));
}

function setup() {
  return createAppRouter(new QueryClient(), createMemoryHistory());
}

describe("route guard", () => {
  it("sends a guest from an organizer page to /login", async () => {
    guest();
    const router = setup();

    await router.push("/org/events");

    expect(router.currentRoute.value.path).toBe("/login");
  });

  it("lets a signed-in user open an organizer page", async () => {
    signedIn();
    const router = setup();

    await router.push("/org/events");

    expect(router.currentRoute.value.path).toBe("/org/events");
  });

  it("sends a signed-in user from /login to the organizer page", async () => {
    signedIn();
    const router = setup();

    await router.push("/login");

    expect(router.currentRoute.value.path).toBe("/org/events");
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

    await router.push("/org/events");
    await router.push("/");
    await router.push("/org/events");

    expect(calls).toBe(1);
  });

  it("fails loudly when the session check hits a server error", async () => {
    server.use(http.get("*/api/auth/me/", () => HttpResponse.json({}, { status: 500 })));
    const router = setup();

    await expect(router.push("/org/events")).rejects.toMatchObject({ kind: "server" });
  });
});
