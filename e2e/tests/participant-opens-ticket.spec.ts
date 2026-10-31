import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract } from "./helpers";

test("the ticket email leads to the ticket page, where the participant cancels", async ({
  browser,
  request,
}) => {
  const title = `Ticket ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  const consoleErrors: string[] = [];
  participant.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const email = `ticket-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");

  const text = await emailTo(request, email, "Билет");
  const code = extract(text, /Код билета: (\S+)/);
  const link = extract(text, /(http\S+\/tickets\/\S+)/);

  await participant.goto(link);
  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(participant.getByText(code, { exact: true })).toBeVisible();

  await participant.getByRole("button", { name: "Отказаться" }).click();
  await participant.getByRole("button", { name: "Да, отказаться" }).click();

  await expect(participant.getByText("Регистрация отменена")).toBeVisible();
  await expect(participant.getByText(code, { exact: true })).toBeHidden();
  expect(consoleErrors).toEqual([]);
  await participantContext.close();
});
