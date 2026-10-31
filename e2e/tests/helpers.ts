import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

// Created by `create_demo_users` when the backend starts (docs/architecture.md, "Окружение").
export const ORGANIZER = { email: "demo@example.com", password: "demo" };
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

// The organizer works in a context of their own: participants never share it.
export async function organizerPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Пароль").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Мои события" })).toBeVisible();
  return page;
}

export async function createEvent(
  browser: Browser,
  { title, capacity }: { title: string; capacity: number },
): Promise<void> {
  const page = await organizerPage(browser);
  await page.getByRole("link", { name: "Создать событие" }).click();
  await page.getByLabel("Название", { exact: true }).fill(title);
  await page
    .getByLabel("Начало", { exact: true })
    .fill(`${new Date().getFullYear() + 1}-05-01T18:00`);
  await page.getByLabel("Мест", { exact: true }).fill(String(capacity));
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.context().close();
}

// The worker sends the email after the change commits, so it is polled for. The mailbox is
// shared and never cleared: the unique address is what finds this test's email, the subject
// tells apart the emails sent to one address.
export async function emailTo(
  request: APIRequestContext,
  address: string,
  subject: string,
): Promise<string> {
  const query = `to:"${address}" subject:"${subject}"`;
  const search = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(query)}`;
  let id = "";
  await expect
    .poll(async () => {
      const found = (await (await request.get(search)).json()) as { messages: { ID: string }[] };
      id = found.messages[0]?.ID ?? "";
      return id;
    })
    .not.toBe("");
  const message = (await (await request.get(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
    Text: string;
  };
  return message.Text;
}

export function extract(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (match?.[1] === undefined) throw new Error(`No ${String(pattern)} in the email`);
  return match[1];
}
