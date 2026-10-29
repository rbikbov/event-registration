import { describe, expect, it } from "vitest";

import { parseLoginForm } from "./login-form";

describe("parseLoginForm", () => {
  it("accepts an email and a password and trims the email", () => {
    expect(parseLoginForm({ email: "  demo@example.com ", password: "demo" })).toEqual({
      ok: true,
      values: { email: "demo@example.com", password: "demo" },
    });
  });

  it("reports empty fields", () => {
    expect(parseLoginForm({ email: "", password: "" })).toEqual({
      ok: false,
      errors: { email: "required", password: "required" },
    });
  });

  it("reports a malformed email", () => {
    expect(parseLoginForm({ email: "not-an-email", password: "x" })).toEqual({
      ok: false,
      errors: { email: "invalid_email" },
    });
  });
});
