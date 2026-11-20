# e2e/ — Playwright

Commands — `docs/development.md`, the "E2E" section. The tests run against a started stack: the human — `make up` / `make e2e`, the agent — `make stack-e2e` (slot 1).

## Rules

1. Each Playwright call — with `await`. A forgotten `await` makes a test green without checking;
   ESLint (`no-floating-promises`) catches it — do not disable it.
2. No `waitForTimeout` and no `sleep`: only waits on state — `expect(...).toBeVisible()`,
   `toHaveText()`, `expect.poll()`.
3. Locators — by role and visible text (`getByRole`, `getByLabel`, `getByText`), as the user sees
   them. `data-testid` — only if there is no accessible way.
4. A test does not depend on other tests or on data left from previous runs: it creates its own
   data with unique values (for example, an email with `Date.now()`). The address prefix is its own
   in each file: the Mailpit mailbox is shared, and the `Date.now()` of two tests that started in
   the same millisecond is the same — with a shared `seat-` the reschedule test took the ticket code
   from the email of the limit test.
5. Two clients — two `browser.newContext()`, not two tabs of one context: contexts have separate
   cookies and storage, like two people.
6. A new test must fail if the checked behavior is broken — check this at least once (for example,
   by stopping a service or changing the expected value).
