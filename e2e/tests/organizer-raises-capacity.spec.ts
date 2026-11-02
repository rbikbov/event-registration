import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, openEventEdit, panelStat, registerOn } from "./helpers";

test("a larger capacity gives the waitlist head a seat and an email with the ticket", async ({
  browser,
  request,
}) => {
  const stamp = Date.now();
  const title = `Capacity ${stamp}`;
  await createEvent(browser, { title, capacity: 1 });
  const participant = await (await browser.newContext()).newPage();
  const waitingEmail = `waiting-${stamp}@example.com`;
  await registerOn(participant, title, `seat-${stamp}@example.com`, "Анна");
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await registerOn(participant, title, waitingEmail, "Борис");
  await expect(participant.getByRole("status")).toHaveText("Вы в листе ожидания, №1");
  await participant.context().close();

  const organizer = await openEventEdit(browser, title);
  await organizer.getByLabel("Мест", { exact: true }).fill("2");
  await organizer.getByRole("button", { name: "Сохранить" }).click();
  await expect(organizer.getByRole("status")).toHaveText("Сохранено");
  await expect(panelStat(organizer, "Подтверждено")).toHaveText("2");
  await expect(panelStat(organizer, "В листе ожидания")).toHaveText("0");
  await organizer.context().close();

  const promoted = await emailTo(request, waitingEmail, "Освободилось место");
  const link = extract(promoted, /(http\S+\/tickets\/\S+)/);
  const code = extract(promoted, /Код билета: (\S+)/);
  const ticket = await (await browser.newContext()).newPage();
  await ticket.goto(link);
  await expect(ticket.getByText(code, { exact: true })).toBeVisible();
  await ticket.context().close();
});
