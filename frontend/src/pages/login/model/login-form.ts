import { z } from "zod";

export type LoginField = "email" | "password";
export type LoginFieldError = "required" | "invalid_email";

const loginSchema = z.object({
  email: z.string().trim().min(1, "required").pipe(z.email("invalid_email")),
  password: z.string().min(1, "required"),
});

export type LoginValues = z.infer<typeof loginSchema>;

export type LoginFormResult =
  | { ok: true; values: LoginValues }
  | { ok: false; errors: Partial<Record<LoginField, LoginFieldError>> };

export function parseLoginForm(input: { email: string; password: string }): LoginFormResult {
  const parsed = loginSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const errors: Partial<Record<LoginField, LoginFieldError>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "email" || field === "password") {
      errors[field] ??= issue.message as LoginFieldError;
    }
  }
  return { ok: false, errors };
}
