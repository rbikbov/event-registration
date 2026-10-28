import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

// Tests run against the docker compose stack (`make up`), not a server started here:
// the stack is what a reviewer runs, so e2e checks exactly that.
export default defineConfig({
  testDir: "./tests",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  // Other browsers — once their support becomes a requirement.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
