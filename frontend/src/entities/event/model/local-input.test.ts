import { describe, expect, it } from "vitest";

import { localInputValue } from "./local-input";

describe("localInputValue", () => {
  it("is the local time of the moment, as datetime-local reads it back", () => {
    const iso = "2030-05-01T18:05:00Z";

    const value = localInputValue(iso);

    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(value).toISOString()).toBe(new Date(iso).toISOString());
  });

  it("drops seconds: the field shows minutes", () => {
    expect(new Date(localInputValue("2030-05-01T18:05:42Z")).toISOString()).toBe(
      "2030-05-01T18:05:00.000Z",
    );
  });
});
