import { expect, test } from "@playwright/test";

import { createEvent } from "./helpers";

test("participants get the only seat, then a place on the waitlist", async ({ browser }) => {
  const title = `Meetup ${Date.now()}`;
  await createEvent(browser, { title, capacity: 1 });

  // Two people, two contexts: separate cookies and storage.
  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  const consoleErrors: string[] = [];
  participant.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await participant.goto("/");
  const card = participant
    .getByRole("listitem")
    .filter({ has: participant.getByRole("link", { name: title }) });
  await expect(card).toContainText("свободно 1 место");
  await participant.getByRole("link", { name: title }).click();

  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(participant.getByText("Свободно 1 место")).toBeVisible();
  await participant.getByLabel("Email").fill(`participant-${Date.now()}@example.com`);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();

  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await expect(participant.getByRole("button", { name: "Зарегистрироваться" })).toBeHidden();

  // The only seat is taken.
  await participant.getByRole("link", { name: "Все события" }).click();
  await expect(card).toContainText("мест нет");
  await expect(card).not.toContainText("свободно");

  // A second person, a separate context: no seat left, so the waitlist.
  const waitingContext = await browser.newContext();
  const waiting = await waitingContext.newPage();
  waiting.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await waiting.goto("/");
  await waiting.getByRole("link", { name: title }).click();
  await expect(waiting.getByText("Свободных мест нет, можно встать в лист ожидания")).toBeVisible();
  await waiting.getByLabel("Email").fill(`waiting-${Date.now()}@example.com`);
  await waiting.getByLabel("Имя").fill("Борис");
  await waiting.getByRole("button", { name: "Зарегистрироваться" }).click();

  await expect(waiting.getByRole("status")).toHaveText("Вы в листе ожидания, №1");
  expect(consoleErrors).toEqual([]);
  await waitingContext.close();
  await participantContext.close();
});
