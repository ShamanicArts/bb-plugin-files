import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "ui.spec.ts",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: process.env.BB_SERVER_URL || "http://127.0.0.1:38886",
    viewport: { width: 1400, height: 950 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
