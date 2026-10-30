import { expect, test } from "@playwright/test";

// Created by `create_demo_users` when the backend starts (docs/architecture.md, "Окружение").
const ORGANIZER = { email: "demo@example.com", password: "demo" };

test("participants get the only seat, then a place on the waitlist", async ({ browser }) => {
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
  await organizer.getByLabel("Мест", { exact: true }).fill("1");
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
