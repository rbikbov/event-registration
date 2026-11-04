// EVENTS_PAGE_SIZE in backend/events/services.py.
const EVENTS_PAGE_SIZE = 20;

/** How many pages a list of `count` events has, at least one: an empty list is one page. */
export function eventPageCount(count: number): number {
  return Math.max(1, Math.ceil(count / EVENTS_PAGE_SIZE));
}
