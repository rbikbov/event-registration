import { vi } from "vitest";

// jsdom's navigator.onLine is always true: set it, then fire the event, as a browser does.
// `restoreMocks` puts the getter back and setup.ts puts TanStack Query back online after each test.
export function goOnline(online: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}
