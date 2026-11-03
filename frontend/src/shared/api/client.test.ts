import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/shared/lib/test/msw";

import { AppError } from "./app-error";
import { api, unwrap, unwrapEmpty } from "./client";

describe("unwrap", () => {
  it("returns data of a successful response", async () => {
    server.use(
      http.get("*/api/health/", () => HttpResponse.json({ status: "ok", database: "ok" })),
    );

    await expect(unwrap(api.GET("/api/health/"))).resolves.toEqual({
      status: "ok",
      database: "ok",
    });
  });

  it("throws AppError with the kind derived from the status", async () => {
    server.use(
      http.get("*/api/health/", () =>
        HttpResponse.json({ status: "error", database: "error" }, { status: 503 }),
      ),
    );

    await expect(unwrap(api.GET("/api/health/"))).rejects.toMatchObject({
      kind: "server",
      status: 503,
    });
  });

  it("puts field error codes of a 400 into AppError.fields", async () => {
    server.use(
      http.post("*/api/org/events/", () =>
        HttpResponse.json({ errors: { capacity: ["min_value"] } }, { status: 400 }),
      ),
    );

    const error: unknown = await unwrap(
      api.POST("/api/org/events/", {
        body: { title: "t", starts_at: "2030-01-01T00:00:00Z", capacity: 0 },
      }),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "validation", fields: { capacity: ["min_value"] } });
  });

  it("throws a network AppError when the request does not reach the server", async () => {
    server.use(http.get("*/api/health/", () => HttpResponse.error()));

    const error: unknown = await unwrap(api.GET("/api/health/")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe("network");
  });
});

describe("unwrapEmpty", () => {
  it("resolves on 204 No Content", async () => {
    server.use(http.post("*/api/auth/logout/", () => new HttpResponse(null, { status: 204 })));

    await expect(unwrapEmpty(api.POST("/api/auth/logout/"))).resolves.toBeUndefined();
  });

  it("throws AppError with the kind derived from the status", async () => {
    server.use(http.post("*/api/auth/logout/", () => HttpResponse.json({}, { status: 401 })));

    await expect(unwrapEmpty(api.POST("/api/auth/logout/"))).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("throws a network AppError when the request does not reach the server", async () => {
    server.use(http.post("*/api/auth/logout/", () => HttpResponse.error()));

    await expect(unwrapEmpty(api.POST("/api/auth/logout/"))).rejects.toMatchObject({
      kind: "network",
    });
  });
});
