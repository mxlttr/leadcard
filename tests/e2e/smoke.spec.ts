import { expect, test } from "@playwright/test";

test("loads the localized leaderboard experience", async ({ page }) => {
  await page.goto("/en");

  await expect(page).toHaveTitle(/Live standings/i);
  await expect(
    page.getByRole("heading", { name: /live standings/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "DE" })).toBeVisible();
  await expect(page.getByRole("link", { name: "EN" })).toBeVisible();
  await expect(
    page.getByText(/latest update|live scoring/i).first(),
  ).toBeVisible();
});
