import { expect, test } from "@playwright/test";

import { collectConsoleErrors, createEvent, emailTo, extract } from "./helpers";

test("the ticket email leads to the ticket page, where the participant cancels", async ({
  browser,
  request,
}) => {
  const title = `Ticket ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  const consoleErrors: string[] = [];
  collectConsoleErrors(participant, consoleErrors);
  const email = `ticket-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Name").fill("Anna");
  await participant.getByRole("button", { name: "Register" }).click();
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");

  const text = await emailTo(request, email, "Ticket");
  const code = extract(text, /Ticket code: (\S+)/);
  const link = extract(text, /(http\S+\/tickets\/\S+)/);

  await participant.goto(link);
  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(participant.getByText(code, { exact: true })).toBeVisible();

  await participant.getByRole("button", { name: "Cancel" }).click();
  await participant.getByRole("button", { name: "Yes, cancel" }).click();

  await expect(participant.getByText("Registration cancelled")).toBeVisible();
  await expect(participant.getByText(code, { exact: true })).toBeHidden();
  expect(consoleErrors).toEqual([]);
  await participantContext.close();
});
