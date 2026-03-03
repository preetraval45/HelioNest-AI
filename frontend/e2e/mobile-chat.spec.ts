/**
 * E2E Spec 4 — AI chat responds on mobile viewport (375px)
 *
 * Tests:
 *   1. AI Chat tab is accessible on mobile
 *   2. Chat input and send button are visible and usable
 *   3. Suggestion chips render on small screen
 *   4. Sending a question renders a response bubble (or loading state)
 *   5. No horizontal overflow on 375px viewport
 */

import { test, expect } from "@playwright/test";

const TEST_ADDRESS = "1600 Pennsylvania Ave NW, Washington, DC 20500";
const PROPERTY_URL = `/property/${encodeURIComponent(TEST_ADDRESS)}`;

// Override viewport to 375px for all tests in this file
test.use({ viewport: { width: 375, height: 812 } });

test.describe("AI chat on mobile (375px)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROPERTY_URL);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: /ai chat/i }).click();
    await expect(page.getByRole("log", { name: /chat messages/i })).toBeVisible({ timeout: 10_000 });
  });

  test("chat input and send button are visible on mobile", async ({ page }) => {
    await expect(page.getByRole("textbox", { name: /ask/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible();
  });

  test("welcome message is shown in chat log", async ({ page }) => {
    const log = page.getByRole("log", { name: /chat messages/i });
    await expect(log).toContainText(/helionest ai|ask me/i);
  });

  test("suggestion chips are visible on mobile", async ({ page }) => {
    // Suggestion chips appear when there is only the welcome message
    const chips = page.locator("button").filter({ hasText: /solar|weather|heat|climate/i });
    await expect(chips.first()).toBeVisible({ timeout: 5_000 });
  });

  test("typing and sending a question shows loading or response", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /ask/i });
    await input.fill("What is the UV index today?");
    await page.getByRole("button", { name: /send/i }).click();

    // User message should appear in the log
    const log = page.getByRole("log", { name: /chat messages/i });
    await expect(log).toContainText("What is the UV index today?", { timeout: 5_000 });

    // Either a loading state or an assistant response should appear
    const loadingOrResponse = page.locator("[aria-label*='thinking'], .animate-bounce, [role='log'] >> text=UV");
    await expect(loadingOrResponse.first()).toBeVisible({ timeout: 10_000 });
  });

  test("no horizontal scroll on 375px", async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance
  });

  test("tab bar scrolls horizontally without breaking layout", async ({ page }) => {
    const tabList = page.getByRole("tablist");
    await expect(tabList).toBeVisible();
    // All tabs should exist even if some are off-screen
    const tabs = await page.getByRole("tab").count();
    expect(tabs).toBeGreaterThanOrEqual(4);
  });
});
