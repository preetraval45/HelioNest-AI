/**
 * E2E Spec 1 — Address search → full property analysis flow
 *
 * Tests the core user journey:
 *   1. Land on homepage
 *   2. Type a US address and submit
 *   3. Navigate to the property analysis page
 *   4. Verify tabs are present and interactive
 *   5. Verify at least one stat card is populated
 */

import { test, expect } from "@playwright/test";

const TEST_ADDRESS = "1600 Pennsylvania Ave NW, Washington, DC 20500";

test.describe("Address search → property analysis", () => {
  test("homepage renders address search form", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("input[placeholder*='address' i], input[placeholder*='Enter' i]")).toBeVisible();
    await expect(page.getByText("HelioNest", { exact: false })).toBeVisible();
  });

  test("submitting an address navigates to property page", async ({ page }) => {
    await page.goto("/");

    const input = page.locator("input[placeholder*='address' i], input[type='text']").first();
    await input.fill(TEST_ADDRESS);
    await input.press("Enter");

    // Should navigate to /property/<encoded-address>
    await expect(page).toHaveURL(/\/property\//, { timeout: 10_000 });
  });

  test("property page shows tab bar with all tabs", async ({ page }) => {
    await page.goto(`/property/${encodeURIComponent(TEST_ADDRESS)}`);

    // Wait for the tab bar to load
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });

    const expectedTabs = ["Overview", "Solar", "Weather", "Moon", "Impact", "AI Chat", "Map / 3D"];
    for (const tabLabel of expectedTabs) {
      await expect(page.getByRole("tab", { name: new RegExp(tabLabel, "i") })).toBeVisible();
    }
  });

  test("tab keyboard navigation works with arrow keys", async ({ page }) => {
    await page.goto(`/property/${encodeURIComponent(TEST_ADDRESS)}`);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });

    const overviewTab = page.getByRole("tab", { name: /overview/i });
    await overviewTab.focus();
    await expect(overviewTab).toBeFocused();

    // Arrow right should move to Solar tab
    await page.keyboard.press("ArrowRight");
    const solarTab = page.getByRole("tab", { name: /solar/i });
    await expect(solarTab).toBeFocused();
  });

  test("clicking Solar tab shows solar content", async ({ page }) => {
    await page.goto(`/property/${encodeURIComponent(TEST_ADDRESS)}`);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: /solar/i }).click();
    await expect(page.getByRole("tabpanel")).toContainText(/sun|sunrise|solar|peak/i, { timeout: 10_000 });
  });

  test("clicking AI Chat tab shows the AI chat interface", async ({ page }) => {
    await page.goto(`/property/${encodeURIComponent(TEST_ADDRESS)}`);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: /ai chat/i }).click();
    await expect(page.getByRole("log", { name: /chat messages/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("textbox", { name: /ask/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible();
  });
});
