import { expect, test, type Page } from "@playwright/test";

import { createEvent, emailTo, extract, organizerPage } from "./helpers";

// The narrowest phone the app is made for (frontend-polish spec, "Ширина телефона").
test.use({ viewport: { width: 360, height: 740 } });

// No screen scrolls sideways: a wide line would push the whole page past the window. The table
// of participants may scroll, inside its own block.
async function expectFits(page: Page, screen: string): Promise<void> {
  const [scrollWidth, windowWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth, `${screen} is wider than the window`).toBeLessThanOrEqual(windowWidth);
}

test("every screen fits a 360 px phone without scrolling sideways", async ({
  browser,
  request,
}) => {
  // One word with no place to break, and a long address: the lines most likely to stick out.
  const title = `Конференцияразработчиковинтерфейсовипользователей${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participant = await (await browser.newContext()).newPage();
  await participant.goto("/");
  await expect(participant.getByRole("link", { name: title })).toBeVisible();
  await expectFits(participant, "the event list");

  await participant.getByRole("link", { name: title }).click();
  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expectFits(participant, "the event page");

  const email = `phone-width-${Date.now()}-a-rather-long-address@example.com`;
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await expectFits(participant, "the event page after registering");

  const link = extract(await emailTo(request, email, "Билет"), /(http\S+\/tickets\/\S+)/);
  await participant.goto(link);
  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expectFits(participant, "the ticket");

  await participant.goto("/no-such-page");
  await expect(participant.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await expectFits(participant, "the 404 page");

  await participant.goto("/login");
  await expect(participant.getByRole("heading", { name: "Вход для организатора" })).toBeVisible();
  await expectFits(participant, "the sign-in page");
  await participant.context().close();

  const organizer = await organizerPage(browser);
  await expect(organizer.getByRole("link", { name: title })).toBeVisible();
  await expectFits(organizer, "the organizer's events");

  await organizer.getByRole("link", { name: "Создать событие" }).click();
  await expect(organizer.getByRole("heading", { name: "Новое событие" })).toBeVisible();
  await expectFits(organizer, "the new event form");
  await organizer.goBack();

  await organizer.getByRole("link", { name: title }).click();
  await expect(organizer.getByRole("row", { name: /Анна/ })).toBeVisible();
  await expectFits(organizer, "the participants tab");

  await organizer.getByRole("link", { name: "Чекин" }).click();
  await expect(organizer.getByLabel("Код билета")).toBeVisible();
  await expectFits(organizer, "the check-in tab");

  await organizer.getByRole("link", { name: "Редактирование" }).click();
  await expect(organizer.getByLabel("Название", { exact: true })).toHaveValue(title);
  await expectFits(organizer, "the edit tab");
  await organizer.context().close();
});
