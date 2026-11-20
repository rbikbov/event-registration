import { expect, test } from "@playwright/test";

import { ORGANIZER } from "./helpers";

test("organizer signs in, creates an event and sees it in the list", async ({ page }) => {
  const title = `Meetup ${Date.now()}`;
  const startsAt = `${new Date().getFullYear() + 1}-05-01T18:00`;

  await page.goto("/org/events");
  await expect(page.getByRole("heading", { name: "Organizer login" })).toBeVisible();
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Password").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("heading", { name: "My events" })).toBeVisible();
  await page.getByRole("link", { name: "Create an event" }).click();

  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Start", { exact: true }).fill(startsAt);
  await page.getByLabel("Seats", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const card = page.getByRole("heading", { name: title });
  await expect(card).toBeVisible();
  await expect(page.getByRole("listitem").filter({ has: card })).toContainText("0 of 30 taken");
});

test("organizer sees the field error from the form and stays on it", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Password").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Create an event" }).click();

  await page.getByRole("button", { name: "Create", exact: true }).click();

  // Required fields are flagged, the optional description is not.
  for (const label of ["Title", "Start", "Seats"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("aria-invalid", "true");
  }
  await expect(page.getByLabel("Description", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
});

test("a wrong password shows the server error and keeps the login form", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert")).toHaveText("Wrong email or password");
  await expect(page.getByRole("heading", { name: "Organizer login" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
