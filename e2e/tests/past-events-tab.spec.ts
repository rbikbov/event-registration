import { expect, test, type Page } from "@playwright/test";

import { organizerPage } from "./helpers";

// An event can be created only in the future: the started one starts a few seconds after, and
// the test waits for it. Then it is the most recent past event, first on the past tab. A second
// event, ten minutes ahead, is the nearest upcoming one: first on the upcoming tab, where the
// started event would stand before it. Seeing it there tells the tab has loaded.
async function createEvent(organizer: Page, title: string, inMs: number): Promise<void> {
  const cookies = await organizer.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  const response = await organizer.request.post("/api/org/events/", {
    headers: { "X-CSRFToken": csrf },
    data: { title, starts_at: new Date(Date.now() + inMs).toISOString(), capacity: 5 },
  });
  expect(response.status()).toBe(201);
}

// Opens the past tab of a list, reloading until the event has started.
async function findOnPastTab(page: Page, list: string, title: string): Promise<void> {
  await page.goto(list);
  await page
    .getByRole("navigation", { name: "Какие события показать" })
    .getByRole("link", { name: "Прошедшие" })
    .click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
}

// The upcoming tab of a list, loaded: the nearest event shown.
async function openUpcomingTab(page: Page, nearest: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Какие события показать" })
    .getByRole("link", { name: "Предстоящие" })
    .click();
  await expect(page.getByRole("link", { name: nearest, exact: true })).toBeVisible();
}

test("a started event is only on the past tab of both lists", async ({ browser }) => {
  const organizer = await organizerPage(browser);
  const stamp = Date.now();
  const started = `Started ${stamp}`;
  const nearest = `Soon ${stamp}`;
  await createEvent(organizer, started, 3_000);
  await createEvent(organizer, nearest, 10 * 60_000);

  const guest = await (await browser.newContext()).newPage();
  await findOnPastTab(guest, "/", started);
  await expect(guest).toHaveURL("/?period=past");
  await openUpcomingTab(guest, nearest);
  await expect(guest).toHaveURL("/");
  await expect(guest.getByRole("link", { name: started, exact: true })).toBeHidden();

  await findOnPastTab(organizer, "/org/events", started);
  await expect(organizer).toHaveURL("/org/events?period=past");
  await openUpcomingTab(organizer, nearest);
  await expect(organizer).toHaveURL("/org/events");
  await expect(organizer.getByRole("link", { name: started, exact: true })).toBeHidden();
});
