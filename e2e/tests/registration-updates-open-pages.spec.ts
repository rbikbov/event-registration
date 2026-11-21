import { expect, test, type Page } from "@playwright/test";

import { createEvent, organizerPage, panelStat } from "./helpers";

// Survives only while the document is not reloaded: what changed came from the stream.
async function markNotReloaded(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.assign(window, { notReloaded: true });
  });
}

async function notReloaded(page: Page): Promise<boolean> {
  return page.evaluate(() => "notReloaded" in window);
}

test("a registration updates the free seats on an open event page and flags the panel", async ({
  browser,
}) => {
  const title = `Seats ${Date.now()}`;
  await createEvent(browser, { title, capacity: 2 });

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  await visitor.getByRole("link", { name: title }).click();
  await expect(visitor.getByText("2 seats free")).toBeVisible();
  await markNotReloaded(visitor);

  const panel = await organizerPage(browser);
  await panel.getByRole("link", { name: title }).click();
  await expect(panel.getByText("No registrations yet")).toBeVisible();
  await markNotReloaded(panel);

  const participant = await (await browser.newContext()).newPage();
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(`seats-${Date.now()}@example.com`);
  await participant.getByLabel("Name").fill("Vera");
  await participant.getByRole("button", { name: "Register" }).click();
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await participant.context().close();

  await expect(visitor.getByText("1 seat free")).toBeVisible();
  expect(await notReloaded(visitor)).toBe(true);

  // The counters change at once; the table waits for the organizer.
  await expect(panelStat(panel, "Confirmed")).toHaveText("1");
  await expect(panel.getByText("There are updates")).toBeVisible();
  await expect(panel.getByText("No registrations yet")).toBeVisible();
  await panel.getByRole("button", { name: "Refresh" }).click();
  await expect(panel.getByRole("row", { name: /Vera/ })).toBeVisible();
  await expect(panel.getByText("There are updates")).toBeHidden();
  expect(await notReloaded(panel)).toBe(true);

  await visitor.context().close();
  await panel.context().close();
});
