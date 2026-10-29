import type { Middleware } from "openapi-fetch";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

export function readCookie(name: string, cookies: string): string | undefined {
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

// Django checks the X-CSRFToken header against the csrftoken cookie on session-authenticated
// unsafe requests. One place for all calls: pages never set it themselves.
export const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    if (SAFE_METHODS.has(request.method)) return request;
    const token = readCookie("csrftoken", document.cookie);
    if (token !== undefined) request.headers.set("X-CSRFToken", token);
    return request;
  },
};
