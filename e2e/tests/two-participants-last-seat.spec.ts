import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, createEvent, organizerPage, panelStat } from "./helpers";

// Both people opened the page while the seat was free and filled in the form.
async function readyToRegister(page: Page, title: string, email: string, name: string) {
  await page.goto("/");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByText("1 seat free")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill(name);
}

// Two browsers send their requests nearly at once, but their order on the server is not
// controlled here: the race itself is proven by registrations/tests/test_concurrency.py. This
// test proves what each client sees: one gets the seat, the other the waitlist, never both.
test("two people on the last seat: one gets it, the other the waitlist", async ({ browser }) => {
  const title = `Last seat ${Date.now()}`;
  await createEvent(browser, { title, capacity: 1 });

  const consoleErrors: string[] = [];
  const people = await Promise.all(
    ["Anna", "Boris"].map(async (name, index) => {
      const page = await (await browser.newContext()).newPage();
      collectConsoleErrors(page, consoleErrors);
      await readyToRegister(page, title, `last-seat-${index}-${Date.now()}@example.com`, name);
      return page;
    }),
  );

  await Promise.all(people.map((page) => page.getByRole("button", { name: "Register" }).click()));
  for (const page of people) {
    await expect(page.getByRole("status")).toHaveText(
      /^(Seat confirmed|You are on the waitlist, #1)$/,
    );
  }
  const results = await Promise.all(people.map((page) => page.getByRole("status").textContent()));
  expect(results.sort()).toEqual(["Seat confirmed", "You are on the waitlist, #1"]);

  const panel = await organizerPage(browser);
  await panel.getByRole("link", { name: title }).click();
  await expect(panelStat(panel, "Confirmed")).toHaveText("1");
  await expect(panelStat(panel, "Waitlisted")).toHaveText("1");

  expect(consoleErrors).toEqual([]);
  for (const page of [...people, panel]) await page.context().close();
});
