import { afterEach, beforeAll } from "vitest";
beforeAll(() => {
  if (!process.env.GLOBAL_WEBHOOK_SECRET) process.env.GLOBAL_WEBHOOK_SECRET = "test-global-secret";
  if (!process.env.CRON_SECRET) process.env.CRON_SECRET = "test-cron-secret";
});
afterEach(() => {});
