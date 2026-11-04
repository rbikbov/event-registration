import { expect, test, type Page } from "@playwright/test";

import { organizerPage } from "./helpers";

// One page of a list holds 20 events (EVENTS_PAGE_SIZE in backend/events/services.py).
const PAGE_SIZE = 20;

// More events than a page holds, through the API: twenty-one forms would take a minute. They
// start fifty years from now: after any event of the other tests, and later in each run, so this
// run's last event is the last of both lists whatever earlier runs left.
async function createEventsBeyondAPage(organizer: Page, prefix: string): Promise<string> {
  const cookies = await organizer.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  const start = new Date();
  start.setFullYear(start.getFullYear() + 50);
  let last = "";
  for (let n = 1; n <= PAGE_SIZE + 1; n += 1) {
    last = `${prefix} ${n}`;
    const response = await organizer.request.post("/api/org/events/", {
      headers: { "X-CSRFToken": csrf },
      data: {
        title: last,
        starts_at: new Date(start.getTime() + n * 60_000).toISOString(),
        capacity: 5,
      },
    });
    expect(response.status()).toBe(201);
  }
  return last;
}

test("both event lists go page by page to the last event", async ({ browser }) => {
  const organizer = await organizerPage(browser);
  const last = await createEventsBeyondAPage(organizer, `Paged ${Date.now()}`);

  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/");
  const pages = guest.getByRole("navigation", { name: "Страницы событий" });
  await pages.getByRole("button", { name: "Последняя страница" }).click();
  await expect(guest.getByRole("link", { name: last, exact: true })).toBeVisible();
  await expect(guest).toHaveURL(/\/\?page=\d+$/);

  await pages.getByRole("button", { name: "Первая страница" }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(guest.getByRole("link", { name: last, exact: true })).toBeHidden();

  await organizer.goto("/org/events");
  await organizer
    .getByRole("navigation", { name: "Страницы событий" })
    .getByRole("button", { name: "Последняя страница" })
    .click();
  await expect(organizer.getByRole("link", { name: last, exact: true })).toBeVisible();
  await expect(organizer).toHaveURL(/\/org\/events\?page=\d+$/);
});
