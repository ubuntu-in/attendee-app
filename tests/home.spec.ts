import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {

  test('page renders with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Home \| UbuCon India 2026/);
  });

  test('hero section is visible with heading and CTAs', async ({ page }) => {
    await page.goto('/');

    // Hero heading
    await expect(page.getByRole('heading', { name: 'UbuCon India 2026', level: 1 })).toBeVisible();

    // Both CTA buttons
    const scheduleBtn = page.getByRole('link', { name: 'View Schedule' });
    const ticketBtn = page.getByRole('link', { name: 'My Ticket' });
    await expect(scheduleBtn).toBeVisible();
    await expect(ticketBtn).toBeVisible();

    // CTAs point to correct routes
    await expect(scheduleBtn).toHaveAttribute('href', '/schedule');
    await expect(ticketBtn).toHaveAttribute('href', '/ticket');
  });

  test('all three feature cards are visible', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Plan Your Day' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fast Check-in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Find Your Way' })).toBeVisible();
  });

  test('internal navigation links resolve without 404', async ({ page }) => {
    await page.goto('/');

    const internalPaths = ['/schedule', '/ticket', '/venue'];
    for (const path of internalPaths) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should not 404`).not.toBe(404);
    }
  });

  test('no dead links to /conduct or /sponsors on the page', async ({ page }) => {
    await page.goto('/');

    const conductLinks = page.locator('a[href="/conduct"]');
    const sponsorLinks = page.locator('a[href="/sponsors"]');
    await expect(conductLinks).toHaveCount(0);
    await expect(sponsorLinks).toHaveCount(0);
  });

});
