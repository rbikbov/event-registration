import { expect, test } from "@playwright/test";

import { organizerPage, postEvent } from "./helpers";

// The widest page bar: a middle page of a long list, with both gaps ("…") and three numbers.
// 141 events take at least 8 pages of 20 (EVENTS_PAGE_SIZE in backend/events/services.py), and
// page 4 of 8 or more has numbers left out on both sides. Made through the API, ten at a time,
// forty years ahead: before the events of `lists-are-paged`, which must stay the last.
const EVENTS = 141;
const MIDDLE_PAGE = 4;

// Around the breakpoints where the words of the bar show up: a phone, `sm` (640) and the width
// just past it, where the words once pushed the page past the window, `md` (768), a laptop.
const WIDTHS = [360, 640, 700, 768, 1024];

test("the page bar of a long list fits every width without scrolling sideways", async ({
  browser,
}) => {
  const organizer = await organizerPage(browser);
  const start = new Date();
  start.setFullYear(start.getFullYear() + 40);
  const stamp = Date.now();
  for (let batch = 0; batch < EVENTS; batch += 10) {
    const titles = Array.from({ length: Math.min(10, EVENTS - batch) }, (_, i) => batch + i);
    await Promise.all(
      titles.map((n) =>
        postEvent(organizer, {
          title: `Wide ${stamp} ${n}`,
          startsAt: new Date(start.getTime() + n * 60_000),
        }),
      ),
    );
  }

  const guest = await (await browser.newContext()).newPage();
  for (const width of WIDTHS) {
    await guest.setViewportSize({ width, height: 800 });
    await guest.goto(`/?page=${MIDDLE_PAGE}`);
    const bar = guest.getByRole("navigation", { name: "Страницы событий" });
    await expect(bar.getByRole("button", { name: `Страница ${MIDDLE_PAGE}` })).toBeVisible();
    const [scrollWidth, windowWidth] = await guest.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scrollWidth, `the list is wider than a ${width} px window`).toBeLessThanOrEqual(
      windowWidth,
    );
  }
});
