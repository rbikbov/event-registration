import { expect, test } from "@playwright/test";

test("frontend reaches the backend and the database through the proxy", async ({ page }) => {
  await page.goto("/health");

  await expect(page.getByRole("heading", { name: "Состояние сервиса" })).toBeVisible();
  await expect(page.getByText("Backend: ok, база данных: ok")).toBeVisible();
});
