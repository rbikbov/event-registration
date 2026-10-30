import { expect, test } from "@playwright/test";

// Created by `create_demo_users` when the backend starts (docs/architecture.md, "Окружение").
const ORGANIZER = { email: "demo@example.com", password: "demo" };

test("organizer signs in, creates an event and sees it in the list", async ({ page }) => {
  const title = `Meetup ${Date.now()}`;
  const startsAt = `${new Date().getFullYear() + 1}-05-01T18:00`;

  await page.goto("/org/events");
  await expect(page.getByRole("heading", { name: "Вход для организатора" })).toBeVisible();
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Пароль").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("heading", { name: "Мои события" })).toBeVisible();
  await page.getByRole("link", { name: "Создать событие" }).click();

  await page.getByLabel("Название", { exact: true }).fill(title);
  await page.getByLabel("Начало", { exact: true }).fill(startsAt);
  await page.getByLabel("Мест", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  const card = page.getByRole("heading", { name: title });
  await expect(card).toBeVisible();
  await expect(page.getByRole("listitem").filter({ has: card })).toContainText("Занято 0 из 30");
});

test("organizer sees the field error from the form and stays on it", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Пароль").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("link", { name: "Создать событие" }).click();

  await page.getByRole("button", { name: "Создать", exact: true }).click();

  // Required fields are flagged, the optional description is not.
  for (const label of ["Название", "Начало", "Мест"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("aria-invalid", "true");
  }
  await expect(page.getByLabel("Описание", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(page.getByRole("heading", { name: "Новое событие" })).toBeVisible();
});
