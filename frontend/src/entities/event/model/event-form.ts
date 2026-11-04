import { z } from "zod";

import type { FieldErrors } from "@/shared/api";

import { localInputValue } from "./local-input";

export const EVENT_FIELDS = ["title", "description", "starts_at", "capacity"] as const;
export type EventField = (typeof EVENT_FIELDS)[number];

// The longest text the server keeps (backend/events), counted trimmed. The form shows a counter
// against it.
export const EVENT_TEXT_MAX = { title: 200, description: 2000 } as const;

// The codes are the ones the server answers with (backend/events), so a client-side and a
// server-side error of the same kind show the same text. `below_confirmed` is the server's only:
// the count of confirmed seats changes under the form.
const ERROR_CODES = [
  "required",
  "blank",
  "max_length",
  "min_value",
  "max_value",
  "invalid",
  "past",
  "below_confirmed",
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

export type EventChangesResult =
  { ok: true; changes: Partial<EventFormValues> } | { ok: false; errors: EventFormErrors };

// `checkPast: false` keeps a start that is already past: an event under way keeps its start.
function eventSchema(now: Date, checkPast = true) {
  return z.object({
    title: z.string().trim().min(1, "blank").max(EVENT_TEXT_MAX.title, "max_length"),
    description: z.string().trim().max(EVENT_TEXT_MAX.description, "max_length"),
    starts_at: z
      .string()
      .min(1, "required")
      .transform((value, ctx) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          ctx.addIssue({ code: "custom", message: "invalid" });
          return z.NEVER;
        }
        if (checkPast && date <= now) {
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
  return { ok: false, errors: issueErrors(parsed.error.issues) };
}

// The form of an existing event, filled with its values.
export function eventFormInput(event: EventFormValues): EventFormInput {
  return { ...event, starts_at: localInputValue(event.starts_at) };
}

// The fields the organizer has changed against `initial`, in form order. Text is compared as it is
// sent and as the server keeps it, trimmed.
export function changedFields(input: EventFormInput, initial: EventFormInput): EventField[] {
  return EVENT_FIELDS.filter((field) => comparable(input, field) !== comparable(initial, field));
}

function comparable(form: EventFormInput, field: EventField) {
  const value = form[field];
  return typeof value === "string" && field !== "starts_at" ? value.trim() : value;
}

// The changed fields ready to send, each checked as on creation; the start is checked for the
// past only when it changes.
export function parseEventChanges(
  input: EventFormInput,
  initial: EventFormInput,
  now: Date,
): EventChangesResult {
  const changed = changedFields(input, initial);
  const parsed = eventSchema(now, changed.includes("starts_at")).safeParse(input);
  if (!parsed.success) return { ok: false, errors: issueErrors(parsed.error.issues) };
  const changes: Partial<EventFormValues> = {};
  for (const field of changed) copyField(changes, parsed.data, field);
  return { ok: true, changes };
}

function copyField<K extends EventField>(
  to: Partial<EventFormValues>,
  from: EventFormValues,
  field: K,
): void {
  to[field] = from[field];
}

function issueErrors(issues: z.core.$ZodIssue[]): EventFormErrors {
  const errors: EventFormErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (isEventField(field)) errors[field] ??= toErrorCode(issue.message);
  }
  return errors;
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
