import { expect, test } from "@playwright/test";

import { collectConsoleErrors, createEvent } from "./helpers";

test("participants get the only seat, then a place on the waitlist", async ({ browser }) => {
  const title = `Meetup ${Date.now()}`;
  await createEvent(browser, { title, capacity: 1 });

  // Two people, two contexts: separate cookies and storage.
  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  const consoleErrors: string[] = [];
  collectConsoleErrors(participant, consoleErrors);

  await participant.goto("/");
  const card = participant
    .getByRole("listitem")
    .filter({ has: participant.getByRole("link", { name: title }) });
  await expect(card).toContainText("1 seat free");
  await participant.getByRole("link", { name: title }).click();

  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(participant.getByText("1 seat free")).toBeVisible();
  await participant.getByLabel("Email").fill(`participant-${Date.now()}@example.com`);
  await participant.getByLabel("Name").fill("Anna");
  await participant.getByRole("button", { name: "Register" }).click();

  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await expect(participant.getByRole("button", { name: "Register" })).toBeHidden();

  // The only seat is taken.
  await participant.getByRole("banner").getByRole("link", { name: "Events", exact: true }).click();
  await expect(card).toContainText("no seats");
  await expect(card).not.toContainText("free");

  // A second person, a separate context: no seat left, so the waitlist.
  const waitingContext = await browser.newContext();
  const waiting = await waitingContext.newPage();
  collectConsoleErrors(waiting, consoleErrors);
  await waiting.goto("/");
  await waiting.getByRole("link", { name: title }).click();
  await expect(waiting.getByText("No free seats, you can join the waitlist")).toBeVisible();
  await waiting.getByLabel("Email").fill(`registers-waiting-${Date.now()}@example.com`);
  await waiting.getByLabel("Name").fill("Boris");
  await waiting.getByRole("button", { name: "Register" }).click();

  await expect(waiting.getByRole("status")).toHaveText("You are on the waitlist, #1");
  expect(consoleErrors).toEqual([]);
  await waitingContext.close();
  await participantContext.close();
});
