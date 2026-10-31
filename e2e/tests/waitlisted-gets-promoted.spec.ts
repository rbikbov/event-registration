import { expect, test, type Browser, type Page } from "@playwright/test";

import { createEvent, emailTo, extract } from "./helpers";

async function participantPage(browser: Browser, consoleErrors: string[]): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return page;
}

async function registerOn(page: Page, title: string, email: string, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
}

test("a cancelled seat goes to the waitlist head, who gets an email with the ticket", async ({
  browser,
  request,
}) => {
  const title = `Waitlist ${Date.now()}`;
  await createEvent(browser, { title, capacity: 1 });
  const consoleErrors: string[] = [];

  // Two people, two contexts: separate cookies and storage.
  const first = await participantPage(browser, consoleErrors);
  const firstEmail = `first-${Date.now()}@example.com`;
  await registerOn(first, title, firstEmail, "Анна");
  await expect(first.getByRole("status")).toHaveText("Место подтверждено");

  const waiting = await participantPage(browser, consoleErrors);
  const waitingEmail = `waiting-${Date.now()}@example.com`;
  await registerOn(waiting, title, waitingEmail, "Борис");
  await expect(waiting.getByRole("status")).toHaveText("Вы в листе ожидания, №1");

  const waitlisted = await emailTo(request, waitingEmail, "Лист ожидания");
  expect(waitlisted).toContain("№1");
  const waitingLink = extract(waitlisted, /(http\S+\/tickets\/\S+)/);
  await waiting.goto(waitingLink);
  await expect(waiting.getByText("Вы в листе ожидания, №1")).toBeVisible();

  const ticket = await emailTo(request, firstEmail, "Билет");
  await first.goto(extract(ticket, /(http\S+\/tickets\/\S+)/));
  await first.getByRole("button", { name: "Отказаться" }).click();
  await first.getByRole("button", { name: "Да, отказаться" }).click();
  await expect(first.getByText("Регистрация отменена")).toBeVisible();

  const promoted = await emailTo(request, waitingEmail, "Освободилось место");
  const code = extract(promoted, /Код билета: (\S+)/);
  // The same link as in the waitlist email: the manage token does not change on promotion.
  expect(extract(promoted, /(http\S+\/tickets\/\S+)/)).toBe(waitingLink);
  await waiting.goto(waitingLink);
  await expect(waiting.getByText(code, { exact: true })).toBeVisible();
  await expect(waiting.getByText("Вы в листе ожидания")).toBeHidden();
  expect(consoleErrors).toEqual([]);
  await first.context().close();
  await waiting.context().close();
});
