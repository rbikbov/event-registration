import { z } from "zod";

import type { FieldErrors } from "@/shared/api";

export const REGISTRATION_FIELDS = ["email", "name"] as const;
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

// The codes are the ones the server answers with (backend/registrations), so a client-side and
// a server-side error of the same kind show the same text.
const ERROR_CODES = ["required", "blank", "max_length", "invalid"] as const;
export type RegistrationFieldError = (typeof ERROR_CODES)[number];
export type RegistrationFormErrors = Partial<Record<RegistrationField, RegistrationFieldError>>;

export interface RegistrationFormInput {
  email: string;
  name: string;
}

export type RegistrationFormResult =
  { ok: true; values: RegistrationFormInput } | { ok: false; errors: RegistrationFormErrors };

const registrationSchema = z.object({
  email: z.string().trim().min(1, "blank").max(254, "max_length").pipe(z.email("invalid")),
  name: z.string().trim().min(1, "blank").max(200, "max_length"),
});

export function parseRegistrationForm(input: RegistrationFormInput): RegistrationFormResult {
  const parsed = registrationSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const errors: RegistrationFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (isRegistrationField(field)) errors[field] ??= toErrorCode(issue.message);
  }
  return { ok: false, errors };
}

// First code per known field; a code this client has no text for reads as "invalid".
export function serverRegistrationErrors(fields: FieldErrors | undefined): RegistrationFormErrors {
  const errors: RegistrationFormErrors = {};
  for (const field of REGISTRATION_FIELDS) {
    const code = fields?.[field]?.[0];
    if (code !== undefined) errors[field] = toErrorCode(code);
  }
  return errors;
}

function isRegistrationField(value: unknown): value is RegistrationField {
  return REGISTRATION_FIELDS.some((field) => field === value);
}

function toErrorCode(code: string): RegistrationFieldError {
  return ERROR_CODES.find((known) => known === code) ?? "invalid";
}
