import {
  expect,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

// Created by `create_demo_users`: `make e2e` and `stack-e2e` run it before the tests, the
// backend does not at its start (docs/development.md, "Create an organizer").
export const ORGANIZER = { email: "demo@example.com", password: "demo" };
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

// The organizer works in a context of their own: participants never share it.
export async function organizerPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(ORGANIZER.email);
  await page.getByLabel("Password").fill(ORGANIZER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "My events" })).toBeVisible();
  return page;
}

// Collects the console errors of a page. The one allowed: a guest's 401 from `me`, the header
// asking who is signed in — the answer for a guest, not a failure (frontend-polish spec, "Session").
export function collectConsoleErrors(page: Page, errors: string[]): void {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const guestSession =
      message.text().includes("401") && message.location().url.endsWith("/api/auth/me/");
    if (!guestSession) errors.push(message.text());
  });
}

// A counter on the event panel, such as "Checked in": the value next to its term.
export function panelStat(page: Page, term: string): Locator {
  return page
    .locator("dl > div")
    .filter({ has: page.getByRole("term").getByText(term, { exact: true }) })
    .getByRole("definition");
}

// The large answer of the check-in screen. The same words can stand in the header above it as a
// counter's term ("Checked in"), so the answer is the paragraph with exactly this text.
export function checkInAnswer(page: Page, text: string): Locator {
  return page.getByRole("paragraph").filter({ hasText: new RegExp(`^${text}$`) });
}

export async function createEvent(
  browser: Browser,
  { title, capacity }: { title: string; capacity: number },
): Promise<void> {
  const page = await organizerPage(browser);
  await page.getByRole("link", { name: "Create an event" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Start", { exact: true })
    .fill(`${new Date().getFullYear() + 1}-05-01T18:00`);
  await page.getByLabel("Seats", { exact: true }).fill(String(capacity));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.context().close();
}

// An event created through the API by a signed-in organizer: quicker than the form when a test
// needs many, or one starting in seconds. Django checks the CSRF header against the cookie.
export async function postEvent(
  organizer: Page,
  { title, startsAt }: { title: string; startsAt: Date },
): Promise<void> {
  const cookies = await organizer.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  const response = await organizer.request.post("/api/org/events/", {
    headers: { "X-CSRFToken": csrf },
    data: { title, starts_at: startsAt.toISOString(), capacity: 5 },
  });
  expect(response.status()).toBe(201);
}

// A participant registers on the event page, reached from the public list.
export async function registerOn(
  page: Page,
  title: string,
  email: string,
  name: string,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Register" }).click();
}

// The organizer opens the edit tab of their event from the list of their events.
export async function openEventEdit(browser: Browser, title: string): Promise<Page> {
  const page = await organizerPage(browser);
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  return page;
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
