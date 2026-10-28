import { describe, expect, it } from "vitest";

import { AppError } from "./app-error";

describe("AppError.fromStatus", () => {
  it.each([
    [400, "validation"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [422, "validation"],
    [500, "server"],
    [503, "server"],
    [418, "unknown"],
  ] as const)("maps %i to %s", (status, kind) => {
    const error = AppError.fromStatus(status);

    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });
});
