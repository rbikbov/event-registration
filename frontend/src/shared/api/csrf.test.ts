import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { server } from "@/shared/lib/test/msw";

import { api } from "./client";
import { readCookie } from "./csrf";

afterEach(() => {
  document.cookie = "csrftoken=; Max-Age=0";
});

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("csrftoken", "a=1; csrftoken=tok; b=2")).toBe("tok");
  });

  it("does not match a cookie whose name only ends with the wanted one", () => {
    expect(readCookie("csrftoken", "xcsrftoken=bad")).toBeUndefined();
  });
});

describe("CSRF header", () => {
  it("is sent on unsafe requests with the value of the csrftoken cookie", async () => {
    document.cookie = "csrftoken=tok123";
    let header: string | null = null;
    server.use(
      http.post("*/api/auth/logout/", ({ request }) => {
        header = request.headers.get("X-CSRFToken");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.POST("/api/auth/logout/");

    expect(header).toBe("tok123");
  });

  it("is not sent on safe requests", async () => {
    document.cookie = "csrftoken=tok123";
    let header: string | null = "unset";
    server.use(
      http.get("*/api/auth/me/", ({ request }) => {
        header = request.headers.get("X-CSRFToken");
        return HttpResponse.json({ id: 1, email: "a@b.co" });
      }),
    );

    await api.GET("/api/auth/me/");

    expect(header).toBeNull();
  });

  it("is omitted when there is no cookie yet", async () => {
    let header: string | null = "unset";
    server.use(
      http.post("*/api/auth/logout/", ({ request }) => {
        header = request.headers.get("X-CSRFToken");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.POST("/api/auth/logout/");

    expect(header).toBeNull();
  });
});
