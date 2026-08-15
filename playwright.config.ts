import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",

  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: "npm run build && npm start -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 5 * 60_000,
  },
});
