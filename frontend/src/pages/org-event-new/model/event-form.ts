import { z } from "zod";

import type { FieldErrors } from "@/shared/api";

export const EVENT_FIELDS = ["title", "description", "starts_at", "capacity"] as const;
export type EventField = (typeof EVENT_FIELDS)[number];

// The codes are the ones the server answers with (backend/events), so a client-side and a
// server-side error of the same kind show the same text.
const ERROR_CODES = [
  "required",
  "blank",
  "max_length",
  "min_value",
  "max_value",
  "invalid",
  "past",
] as const;
export type EventFieldError = (typeof ERROR_CODES)[number];
export type EventFormErrors = Partial<Record<EventField, EventFieldError>>;

export interface EventFormInput {
  title: string;
  description: string;
  // `datetime-local` value: local time without a zone, "2030-05-01T18:00".
  starts_at: string;
  // `undefined` while the number field is empty.
  capacity: number | undefined;
}

export interface EventFormValues {
  title: string;
  description: string;
  starts_at: string;
  capacity: number;
}

export type EventFormResult =
  { ok: true; values: EventFormValues } | { ok: false; errors: EventFormErrors };

function eventSchema(now: Date) {
  return z.object({
    title: z.string().trim().min(1, "blank").max(200, "max_length"),
    description: z.string().max(2000, "max_length"),
    starts_at: z
      .string()
      .min(1, "required")
      .transform((value, ctx) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          ctx.addIssue({ code: "custom", message: "invalid" });
          return z.NEVER;
        }
        if (date <= now) {
          ctx.addIssue({ code: "custom", message: "past" });
          return z.NEVER;
        }
        return date.toISOString();
      }),
    capacity: z
      .number({ error: (issue) => (issue.input === undefined ? "required" : "invalid") })
      .int("invalid")
      .min(1, "min_value")
      .max(10000, "max_value"),
  });
}

export function parseEventForm(input: EventFormInput, now: Date): EventFormResult {
  const parsed = eventSchema(now).safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const errors: EventFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (isEventField(field)) errors[field] ??= toErrorCode(issue.message);
  }
  return { ok: false, errors };
}

// First code per known field; a code this client has no text for reads as "invalid".
export function serverFormErrors(fields: FieldErrors | undefined): EventFormErrors {
  const errors: EventFormErrors = {};
  for (const field of EVENT_FIELDS) {
    const code = fields?.[field]?.[0];
    if (code !== undefined) errors[field] = toErrorCode(code);
  }
  return errors;
}

function isEventField(value: unknown): value is EventField {
  return EVENT_FIELDS.some((field) => field === value);
}

function toErrorCode(code: string): EventFieldError {
  return ERROR_CODES.find((known) => known === code) ?? "invalid";
}
