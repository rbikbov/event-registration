import createClient from "openapi-fetch";

import { AppError } from "./app-error";
import type { paths } from "./schema";

// Typed from backend/openapi.yaml: a path, method or field missing from the contract
// fails vue-tsc. Regenerate with `make schema`.
export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  // Resolve fetch per call: openapi-fetch otherwise keeps the fetch it saw at import time,
  // and request interception set up later (MSW in tests) would be bypassed.
  fetch: (request) => globalThis.fetch(request),
});

interface ApiResult<Data> {
  data?: Data;
  response: Response;
}

// Turns an openapi-fetch result into data or an AppError, so callers never look at
// statuses or Response objects.
export async function unwrap<Data>(request: Promise<ApiResult<Data>>): Promise<Data> {
  let result: ApiResult<Data>;
  try {
    result = await request;
  } catch (cause) {
    throw new AppError("network", { cause });
  }
  if (!result.response.ok) throw AppError.fromStatus(result.response.status);
  if (result.data === undefined) throw new AppError("unknown", { status: result.response.status });
  return result.data;
}
