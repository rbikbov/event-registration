// Where to go after signing in, from `?next=` of /login. Only a path of this app passes: the
// value is read the way the browser would read a link, so "//host", "/\host" and a tab inside
// cannot turn it into another site.
const BASE = "http://app.invalid";

export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const url = new URL(value, BASE);
  if (url.origin !== BASE) return null;
  return url.pathname + url.search + url.hash;
}
