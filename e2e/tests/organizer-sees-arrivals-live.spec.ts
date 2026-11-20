import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, organizerPage, panelStat } from "./helpers";

test("a check-in at the entrance updates the arrivals on a panel open elsewhere", async ({
  browser,
  request,
}) => {
  const title = `Live ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participant = await (await browser.newContext()).newPage();
  const email = `live-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Name").fill("Борис");
  await participant.getByRole("button", { name: "Register" }).click();
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await participant.context().close();
  const code = extract(await emailTo(request, email, "Билет"), /Код билета: (\S+)/);

  const panel = await organizerPage(browser);
  await panel.getByRole("link", { name: title }).click();
  await expect(panelStat(panel, "Arrived")).toHaveText("0");
  // Survives only while the document is not reloaded.
  await panel.evaluate(() => {
    Object.assign(window, { notReloaded: true });
  });

  const entrance = await organizerPage(browser);
  await entrance.getByRole("link", { name: title }).click();
  await entrance.getByRole("link", { name: "Check-in" }).click();
  await entrance.getByLabel("Ticket code").fill(code);
  await entrance.getByRole("button", { name: "Check in" }).click();
  await expect(entrance.getByText("Admitted", { exact: true })).toBeVisible();
  await entrance.context().close();

  await expect(panelStat(panel, "Arrived")).toHaveText("1");
  expect(await panel.evaluate(() => "notReloaded" in window)).toBe(true);
  await panel.context().close();
});

test("a check-in at one entrance updates the arrivals on another check-in screen", async ({
  browser,
  request,
}) => {
  const title = `Entrances ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participant = await (await browser.newContext()).newPage();
  const email = `entrances-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Name").fill("Глеб");
  await participant.getByRole("button", { name: "Register" }).click();
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await participant.context().close();
  const code = extract(await emailTo(request, email, "Билет"), /Код билета: (\S+)/);

  const second = await organizerPage(browser);
  await second.getByRole("link", { name: title }).click();
  await second.getByRole("link", { name: "Check-in" }).click();
  await expect(panelStat(second, "Arrived")).toHaveText("0");
  await second.evaluate(() => {
    Object.assign(window, { notReloaded: true });
  });

  const first = await organizerPage(browser);
  await first.getByRole("link", { name: title }).click();
  await first.getByRole("link", { name: "Check-in" }).click();
  await first.getByLabel("Ticket code").fill(code);
  await first.getByRole("button", { name: "Check in" }).click();
  await expect(first.getByText("Admitted", { exact: true })).toBeVisible();
  await first.context().close();

  await expect(panelStat(second, "Arrived")).toHaveText("1");
  expect(await second.evaluate(() => "notReloaded" in window)).toBe(true);
  await second.context().close();
});
