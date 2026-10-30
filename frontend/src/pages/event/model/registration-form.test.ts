import { describe, expect, it } from "vitest";

import { parseRegistrationForm, serverRegistrationErrors } from "./registration-form";

describe("parseRegistrationForm", () => {
  it("trims the values", () => {
    expect(parseRegistrationForm({ email: " a@x.io ", name: " Ann " })).toEqual({
      ok: true,
      values: { email: "a@x.io", name: "Ann" },
    });
  });

  it.each([
    [{ email: "", name: "Ann" }, { email: "blank" }],
    [{ email: "nope", name: "Ann" }, { email: "invalid" }],
    [{ email: "a@x.io", name: "   " }, { name: "blank" }],
    [{ email: "a@x.io", name: "x".repeat(201) }, { name: "max_length" }],
    [
      { email: "", name: "" },
      { email: "blank", name: "blank" },
    ],
  ])("flags %j", (input, errors) => {
    expect(parseRegistrationForm(input)).toEqual({ ok: false, errors });
  });
});

describe("serverRegistrationErrors", () => {
  it("takes the first code per known field and reads an unknown code as invalid", () => {
    expect(
      serverRegistrationErrors({
        email: ["max_length", "invalid"],
        name: ["strange"],
        other: ["x"],
      }),
    ).toEqual({ email: "max_length", name: "invalid" });
  });

  it("is empty without field errors", () => {
    expect(serverRegistrationErrors(undefined)).toEqual({});
  });
});
