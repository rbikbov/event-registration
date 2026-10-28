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

  constructor(kind: AppErrorKind, options: { status?: number; cause?: unknown } = {}) {
    super(options.status === undefined ? kind : `${kind} (HTTP ${options.status})`, {
      cause: options.cause,
    });
    this.name = "AppError";
    this.kind = kind;
    this.status = options.status;
  }

  static fromStatus(status: number): AppError {
    return new AppError(kindForStatus(status), { status });
  }
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
