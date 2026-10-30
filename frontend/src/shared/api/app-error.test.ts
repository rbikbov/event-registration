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

describe("AppError.fromStatus field errors", () => {
  it("reads codes per field from a 400 body", () => {
    const error = AppError.fromStatus(400, {
      errors: { capacity: ["min_value"], title: ["blank"] },
    });

    expect(error.fields).toEqual({ capacity: ["min_value"], title: ["blank"] });
  });

  it.each([undefined, null, "text", {}, { errors: "x" }, { detail: "no" }])(
    "gives no fields for body %j",
    (body) => {
      expect(AppError.fromStatus(400, body).fields).toBeUndefined();
    },
  );

  it("skips fields whose codes are not strings", () => {
    const error = AppError.fromStatus(400, { errors: { title: [1], capacity: ["invalid"] } });

    expect(error.fields).toEqual({ capacity: ["invalid"] });
  });
});
