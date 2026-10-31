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
  await participant.getByLabel("Имя").fill("Борис");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await participant.context().close();
  const code = extract(await emailTo(request, email, "Билет"), /Код билета: (\S+)/);

  const panel = await organizerPage(browser);
  await panel.getByRole("link", { name: title }).click();
  await expect(panelStat(panel, "Пришло")).toHaveText("0");
  // Survives only while the document is not reloaded.
  await panel.evaluate(() => {
    Object.assign(window, { notReloaded: true });
  });

  const entrance = await organizerPage(browser);
  await entrance.getByRole("link", { name: title }).click();
  await entrance.getByRole("link", { name: "Чекин" }).click();
  await entrance.getByLabel("Код билета").fill(code);
  await entrance.getByRole("button", { name: "Отметить" }).click();
  await expect(entrance.getByText("Пропущен", { exact: true })).toBeVisible();
  await entrance.context().close();

  await expect(panelStat(panel, "Пришло")).toHaveText("1");
  expect(await panel.evaluate(() => "notReloaded" in window)).toBe(true);
  await panel.context().close();
});
