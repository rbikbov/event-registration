import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import {
  collectConsoleErrors,
  createEvent,
  emailTo,
  extract,
  organizerPage,
  panelStat,
} from "./helpers";

// A participant gets a seat; the code comes from their ticket email.
async function ticketCode(
  browser: Browser,
  request: APIRequestContext,
  title: string,
  email: string,
): Promise<string> {
  const participant = await (await browser.newContext()).newPage();
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await participant.context().close();
  return extract(await emailTo(request, email, "Билет"), /Код билета: (\S+)/);
}

async function checkInScreen(browser: Browser, title: string): Promise<Page> {
  const page = await organizerPage(browser);
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("link", { name: "Чекин" }).click();
  await expect(panelStat(page, "Пришло")).toHaveText("0");
  return page;
}

test("the code from the email passes check-in once, and the panel counts the arrival", async ({
  browser,
  request,
}) => {
  const title = `Check-in ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const email = `checkin-${Date.now()}@example.com`;
  const code = await ticketCode(browser, request, title, email);

  const organizer = await organizerPage(browser);
  const consoleErrors: string[] = [];
  collectConsoleErrors(organizer, consoleErrors);
  await organizer.getByRole("link", { name: title }).click();
  await organizer.getByRole("link", { name: "Чекин" }).click();
  await expect(organizer.getByRole("heading", { name: title })).toBeVisible();
  await expect(organizer.getByRole("link", { name: "Чекин" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await organizer.getByLabel("Код билета").fill(code);
  await organizer.getByRole("button", { name: "Отметить" }).click();
  await expect(organizer.getByText("Пропущен", { exact: true })).toBeVisible();
  await expect(organizer.getByText("Анна")).toBeVisible();

  // The organizer moves on and the same code comes again: it is turned away.
  await organizer.getByRole("button", { name: "Следующий" }).click();
  await organizer.getByLabel("Код билета").fill(code);
  await organizer.getByRole("button", { name: "Отметить" }).click();
  await expect(organizer.getByText(/^Уже отмечен в \d{2}:\d{2}$/)).toBeVisible();
  await expect(organizer.getByText("Пропущен", { exact: true })).toBeHidden();

  // The header of the check-in counts the arrival too, and the participants tab keeps it.
  await expect(panelStat(organizer, "Пришло")).toHaveText("1");
  await organizer.getByRole("link", { name: "Участники" }).click();
  await expect(panelStat(organizer, "Пришло")).toHaveText("1");
  await expect(organizer.getByRole("row", { name: /Анна/ })).toContainText(email);
  expect(consoleErrors).toEqual([]);
  await organizer.context().close();
});

// Both entrances press «Отметить» nearly at once; which request reaches the server first is not
// controlled here — the race itself is proven by registrations/tests/test_concurrency.py.
test("one code at two entrances at once: one lets the ticket in, the other turns it away", async ({
  browser,
  request,
}) => {
  const title = `Two entrances ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });
  const code = await ticketCode(browser, request, title, `two-entrances-${Date.now()}@example.com`);

  const entrances = await Promise.all([
    checkInScreen(browser, title),
    checkInScreen(browser, title),
  ]);
  for (const page of entrances) await page.getByLabel("Код билета").fill(code);
  await Promise.all(
    entrances.map((page) => page.getByRole("button", { name: "Отметить" }).click()),
  );

  const outcomes = await Promise.all(
    entrances.map(async (page) => {
      const passed = page.getByText("Пропущен", { exact: true });
      const turnedAway = page.getByText(/^Уже отмечен в \d{2}:\d{2}$/);
      await expect(passed.or(turnedAway)).toBeVisible();
      return (await passed.isVisible()) ? "passed" : "turned away";
    }),
  );
  expect(outcomes.sort()).toEqual(["passed", "turned away"]);
  for (const page of entrances) await expect(panelStat(page, "Пришло")).toHaveText("1");
  for (const page of entrances) await page.context().close();
});
