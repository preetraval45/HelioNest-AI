/**
 * E2E Spec 2 — 2D → 3D → 360° view mode switching
 *
 * Tests:
 *   1. Default view mode is 2D map
 *   2. Switching to 3D shows the 3D view container
 *   3. Switching to 360° shows the 360° sky dome container
 *   4. Keyboard shortcuts (2, 3, 0) change view mode
 */

import { test, expect } from "@playwright/test";

const TEST_ADDRESS = "1600 Pennsylvania Ave NW, Washington, DC 20500";
const PROPERTY_URL = `/property/${encodeURIComponent(TEST_ADDRESS)}`;

test.describe("View mode switching (2D / 3D / 360°)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROPERTY_URL);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: /map.*3d/i }).click();
    // Wait for ViewModeSwitcher to be visible
    await expect(page.getByRole("group", { name: /property view mode/i })).toBeVisible({ timeout: 10_000 });
  });

  test("default view mode is 2D", async ({ page }) => {
    const btn2D = page.getByRole("button", { name: /2d map/i });
    await expect(btn2D).toHaveAttribute("aria-pressed", "true");
    // 2D map container should be visible
    await expect(page.locator('[aria-label="2D satellite map view"]')).toBeVisible({ timeout: 15_000 });
  });

  test("switching to 3D view shows 3D container", async ({ page }) => {
    await page.getByRole("button", { name: /3d view/i }).click();
    const btn3D = page.getByRole("button", { name: /3d view/i });
    await expect(btn3D).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[aria-label*="3D property"]')).toBeVisible({ timeout: 15_000 });
  });

  test("switching to 360° view shows sky dome container", async ({ page }) => {
    await page.getByRole("button", { name: /360/i }).click();
    const btn360 = page.getByRole("button", { name: /360/i });
    await expect(btn360).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[aria-label*="360"]')).toBeVisible({ timeout: 15_000 });
  });

  test("keyboard shortcut '3' switches to 3D view", async ({ page }) => {
    // Focus something that is not an input, then press "3"
    await page.locator("body").press("3");
    const btn3D = page.getByRole("button", { name: /3d view/i });
    await expect(btn3D).toHaveAttribute("aria-pressed", "true");
  });

  test("keyboard shortcut '2' returns to 2D view", async ({ page }) => {
    // Go to 3D first, then back to 2D
    await page.locator("body").press("3");
    await page.locator("body").press("2");
    const btn2D = page.getByRole("button", { name: /2d map/i });
    await expect(btn2D).toHaveAttribute("aria-pressed", "true");
  });
});
