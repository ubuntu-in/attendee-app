import { test, expect } from '@playwright/test';

test.describe('Ticket Management Flow', () => {

  test('Empty state renders correctly without local storage', async ({ page }) => {
    await page.goto('/ticket');
    
    // Check if the empty state text is visible
    await expect(page.locator('text=No ticket added yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan or Upload Ticket' })).toBeVisible();
  });

  test('Adding a new ticket via URL params (Mocked API)', async ({ page, context }) => {
    // Intercept the KonfHub API
    await context.route(/.*api\.konfhub\.com.*/, async route => {
      const json = {
        name: "Test User",
        emailId: "test@example.com",
        organisation: "Test Org",
        designation: "Developer",
        ticketName: "General Admission"
      };
      await route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    // Go to the ticket page with a bookingid
    await page.goto('/ticket?bookingid=test-booking-123');
    
    // Verify the UI updates to show the fetched data using specific locators
    await expect(page.getByRole('heading', { name: 'Test User' })).toBeVisible();
    await expect(page.locator('text=Developer @ Test Org')).toBeVisible();

    // Verify that the URL was cleaned (no ?bookingid=)
    await expect(page).toHaveURL(/.*\/ticket$/);

    // Verify local storage is populated correctly
    const storedTicketStr = await page.evaluate(() => localStorage.getItem('ubucon_ticket'));
    expect(storedTicketStr).toBeTruthy();
    const storedTicket = JSON.parse(storedTicketStr!);
    expect(storedTicket.name).toBe('Test User');
    expect(storedTicket.bookingId).toBe('test-booking-123');
  });

  test('Modal appears when scanning a new ticket while one exists', async ({ page, context }) => {
    // 1. Mock the API for the NEW ticket BEFORE any navigation
    await context.route('**/*', async route => {
      if (route.request().url().includes('api.konfhub.com')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ name: "New User", designation: "New Dev" }),
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } else {
        await route.continue();
      }
    });

    // 2. Setup local storage with an existing ticket
    await page.goto('/ticket');
    await page.evaluate(() => {
      localStorage.setItem('ubucon_ticket', JSON.stringify({
        name: "Old User",
        bookingId: "old-booking-123",
        designation: "Old Dev"
      }));
    });

    // 3. Navigate with a new booking ID
    await page.goto('/ticket?bookingid=new-booking-456');

    // 4. Modal should appear
    await expect(page.locator('text=Replace Ticket?')).toBeVisible();

    // 5. Click "Replace Ticket"
    const responsePromise = page.waitForResponse(/.*api\.konfhub\.com.*/).catch(() => {});
    await page.getByRole('button', { name: 'Replace Ticket' }).click();
    if (responsePromise) await responsePromise;

    // 6. Verify UI updates to the new ticket
    await expect(page.getByRole('heading', { name: 'New User' })).toBeVisible({ timeout: 2000 });
    
    // 7. Verify local storage updated
    const updatedTicket = await page.evaluate(() => JSON.parse(localStorage.getItem('ubucon_ticket')!));
    expect(updatedTicket.name).toBe('New User');
    expect(updatedTicket.bookingId).toBe('new-booking-456');
  });

  test('Error state is handled robustly on API failure', async ({ page, context }) => {
    // Intercept and return a 404 error
    await context.route(/.*api\.konfhub\.com.*/, async route => {
      await route.fulfill({ status: 404, body: 'Not Found', headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    // Navigate to ticket page with a bookingid
    await page.goto('/ticket?bookingid=invalid-booking-id');

    // Should display the error notification banner
    await expect(page.locator('text=Could not fetch ticket details. Please ensure the link is valid.')).toBeVisible();
    
    // Should still show the empty state because ticket fetch failed
    await expect(page.locator('text=No ticket added yet')).toBeVisible();
    
    // Local storage should remain clean
    const storedTicketStr = await page.evaluate(() => localStorage.getItem('ubucon_ticket'));
    expect(storedTicketStr).toBeNull();
  });

});
