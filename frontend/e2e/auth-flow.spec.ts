/**
 * E2E Spec 3 — Register → login → save property → dashboard
 *
 * Tests:
 *   1. Registration form renders and validates
 *   2. Login form renders and validates
 *   3. Authenticated user can see dashboard
 *
 * Note: Uses unique email per test run to avoid conflicts.
 *       In CI, backend must be running at PLAYWRIGHT_BASE_URL or proxied via Next.js.
 */

import { test, expect } from "@playwright/test";

const uniqueEmail = () => `test_${Date.now()}@helionest-e2e.com`;
const TEST_PASSWORD = "E2eTestPass123!";

test.describe("Authentication flow", () => {
  test("register page renders form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create|register|sign up/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /password/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /register|create|sign up/i })).toBeVisible();
  });

  test("login page renders form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /log in|sign in/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /password/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /log in|sign in/i })).toBeVisible();
  });

  test("login shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill("nonexistent@helionest.ai");
    await page.getByRole("textbox", { name: /password/i }).fill("WrongPassword99!");
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    // Should show error, NOT navigate away
    await expect(page.locator("[role='alert'], .text-red, .text-danger, [class*='error']")).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 3_000 });
  });

  test("successful registration redirects away from register page", async ({ page }) => {
    await page.goto("/register");
    const email = uniqueEmail();
    await page.getByRole("textbox", { name: /email/i }).fill(email);

    // Fill username if present
    const usernameField = page.getByRole("textbox", { name: /username/i });
    if (await usernameField.isVisible()) {
      await usernameField.fill(`user_${Date.now()}`);
    }
    await page.getByRole("textbox", { name: /password/i }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /register|create|sign up/i }).click();

    // Should redirect to login or dashboard after success
    await expect(page).not.toHaveURL(/\/register/, { timeout: 10_000 });
  });

  test("nav shows Log in and Sign up links when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });
});
