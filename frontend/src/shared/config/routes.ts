// Every in-app path lives here: pages cannot import app/router.ts, and a path typed twice
// is a silent 404 after one of them changes.
export const routes = {
  home: "/",
  event: "/events/:id(\\d+)",
  health: "/health",
  login: "/login",
  orgEvents: "/org/events",
  orgEventsNew: "/org/events/new",
  orgEvent: "/org/events/:id(\\d+)",
  orgCheckin: "/org/events/:id(\\d+)/checkin",
  ticket: "/tickets/:token",
} as const;

export function eventPath(id: number): string {
  return `/events/${id}`;
}

export function ticketPath(token: string): string {
  return `/tickets/${token}`;
}

export function orgEventPath(id: number): string {
  return `/org/events/${id}`;
}

export function checkinPath(eventId: number): string {
  return `/org/events/${eventId}/checkin`;
}
