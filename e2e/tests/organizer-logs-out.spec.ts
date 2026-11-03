import { expect, test } from "@playwright/test";

import { collectConsoleErrors, ORGANIZER, organizerPage } from "./helpers";

test("the organizer signs out, and signing in again leads back to the page asked for", async ({
  browser,
}) => {
  const page = await organizerPage(browser);
  const consoleErrors: string[] = [];
  collectConsoleErrors(page, consoleErrors);

  await page.getByRole("banner").getByRole("button", { name: "Выйти" }).click();

  await expect(page).toHaveURL("/");
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Вход для организатора" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Выйти" })).toBeHidden();

  // The session is gone on the server too: the organizer page asks to sign in.
  await page.goto("/org/events");
  await expect(page).toHaveURL("/login?next=/org/events");

  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Пароль").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL("/org/events");
  await expect(page.getByRole("heading", { name: "Мои события" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
