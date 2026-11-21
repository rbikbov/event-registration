import { expect, test } from "@playwright/test";

test("frontend reaches the backend and the database through the proxy", async ({ page }) => {
  await page.goto("/health");

  await expect(page.getByRole("heading", { name: "Service status" })).toBeVisible();
  await expect(page.getByText("The backend and the database work")).toBeVisible();
});
