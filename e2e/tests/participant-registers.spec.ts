import { expect, test } from "@playwright/test";

// Created by `create_demo_users` when the backend starts (docs/architecture.md, "Окружение").
const ORGANIZER = { email: "demo@example.com", password: "demo" };

test("participant registers for an event the organizer created", async ({ browser }) => {
  const title = `Meetup ${Date.now()}`;
  const startsAt = `${new Date().getFullYear() + 1}-05-01T18:00`;

  // Two people, two contexts: separate cookies and storage.
  const organizerContext = await browser.newContext();
  const organizer = await organizerContext.newPage();
  await organizer.goto("/login");
  await organizer.getByLabel("Email").fill(ORGANIZER.email);
  await organizer.getByLabel("Пароль").fill(ORGANIZER.password);
  await organizer.getByRole("button", { name: "Войти" }).click();
  await organizer.getByRole("link", { name: "Создать событие" }).click();
  await organizer.getByLabel("Название", { exact: true }).fill(title);
  await organizer.getByLabel("Начало", { exact: true }).fill(startsAt);
  await organizer.getByLabel("Мест", { exact: true }).fill("2");
  await organizer.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(organizer.getByRole("heading", { name: title })).toBeVisible();
  await organizerContext.close();

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
  await expect(card).toContainText("свободно 2 места");
  await participant.getByRole("link", { name: title }).click();

  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(participant.getByText("Свободно 2 места")).toBeVisible();
  await participant.getByLabel("Email").fill(`participant-${Date.now()}@example.com`);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();

  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await expect(participant.getByRole("button", { name: "Зарегистрироваться" })).toBeHidden();

  // The seat is taken: the list shows one seat left.
  await participant.getByRole("link", { name: "Все события" }).click();
  await expect(card).toContainText("свободно 1 место");
  expect(consoleErrors).toEqual([]);
  await participantContext.close();
});
