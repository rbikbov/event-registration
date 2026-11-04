import { expect, test, type Page } from "@playwright/test";

import { organizerPage, postEvent } from "./helpers";

// One page of a list holds 20 events (EVENTS_PAGE_SIZE in backend/events/services.py).
const PAGE_SIZE = 20;

// More events than a page holds, through the API: twenty-one forms would take a minute. They
// start a hundred years from now, the farthest of all tests (`page-bar-fits` keeps to forty), and
// later in each run, so this run's last event is the last of both lists whatever earlier runs left.
async function createEventsBeyondAPage(organizer: Page, prefix: string): Promise<string> {
  const start = new Date();
  start.setFullYear(start.getFullYear() + 100);
  let last = "";
  for (let n = 1; n <= PAGE_SIZE + 1; n += 1) {
    last = `${prefix} ${n}`;
    await postEvent(organizer, { title: last, startsAt: new Date(start.getTime() + n * 60_000) });
  }
  return last;
}

// From the first page of a list to its last, where this run's last event stands. Other tests
// running alongside add events before it, and each one may push it to a page past the last one
// counted when the list loaded: the walk starts over until the event is found there.
async function goToLastPage(page: Page, list: string, last: string): Promise<void> {
  await expect(async () => {
    await page.goto(list);
    await page
      .getByRole("navigation", { name: "Страницы событий" })
      .getByRole("button", { name: "Последняя страница" })
      .click();
    await expect(page.getByRole("link", { name: last, exact: true })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
}

test("both event lists go page by page to the last event", async ({ browser }) => {
  const organizer = await organizerPage(browser);
  const last = await createEventsBeyondAPage(organizer, `Paged ${Date.now()}`);

  const guest = await (await browser.newContext()).newPage();
  await goToLastPage(guest, "/", last);
  await expect(guest).toHaveURL(/\/\?page=\d+$/);

  await guest
    .getByRole("navigation", { name: "Страницы событий" })
    .getByRole("button", { name: "Первая страница" })
    .click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(guest.getByRole("link", { name: last, exact: true })).toBeHidden();

  await goToLastPage(organizer, "/org/events", last);
  await expect(organizer).toHaveURL(/\/org\/events\?page=\d+$/);
});
