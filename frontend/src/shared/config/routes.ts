// Every in-app path lives here: pages cannot import app/router.ts, and a path typed twice
// is a silent 404 after one of them changes.
export const routes = {
  home: "/",
  event: "/events/:id(\\d+)",
  health: "/health",
  login: "/login",
  orgEvents: "/org/events",
  orgEventsNew: "/org/events/new",
} as const;

export function eventPath(id: number): string {
  return `/events/${id}`;
}
