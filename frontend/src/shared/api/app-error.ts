// The only error type above shared/api. Code decides by `kind`, never by message text.
export type AppErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "server"
  | "unknown";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status: number | undefined;
  // Error codes per form field from a 400 body; the form maps them to its own texts.
  readonly fields: FieldErrors | undefined;

  constructor(
    kind: AppErrorKind,
    options: { status?: number; cause?: unknown; fields?: FieldErrors } = {},
  ) {
    super(options.status === undefined ? kind : `${kind} (HTTP ${options.status})`, {
      cause: options.cause,
    });
    this.name = "AppError";
    this.kind = kind;
    this.status = options.status;
    this.fields = options.fields;
  }

  static fromStatus(status: number, body?: unknown): AppError {
    return new AppError(kindForStatus(status), { status, fields: fieldErrorsFrom(body) });
  }
}

export type FieldErrors = Record<string, string[]>;

// The 400 body is `{"errors": {field: [code]}}` (backend/config/exceptions.py); anything
// else, including a malformed body, gives no field errors.
function fieldErrorsFrom(body: unknown): FieldErrors | undefined {
  if (typeof body !== "object" || body === null || !("errors" in body)) return undefined;
  const { errors } = body;
  if (typeof errors !== "object" || errors === null) return undefined;
  const fields: FieldErrors = {};
  for (const [field, codes] of Object.entries(errors)) {
    if (Array.isArray(codes) && codes.every((code) => typeof code === "string")) {
      fields[field] = codes;
    }
  }
  return fields;
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "unknown";
}
