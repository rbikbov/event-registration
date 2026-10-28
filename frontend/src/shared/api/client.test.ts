import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/shared/lib/test/msw";

import { AppError } from "./app-error";
import { api, unwrap } from "./client";

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

  it("throws a network AppError when the request does not reach the server", async () => {
    server.use(http.get("*/api/health/", () => HttpResponse.error()));

    const error: unknown = await unwrap(api.GET("/api/health/")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe("network");
  });
});
