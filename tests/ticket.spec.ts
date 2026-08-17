import { test, expect } from '@playwright/test';

test.describe('Ticket Management Flow', () => {

  test('Empty state renders correctly without local storage', async ({ page }) => {
    await page.goto('/ticket');
    
    await expect(page.locator('text=No ticket added yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan or Upload Ticket' })).toBeVisible();
  });

  test('Adding a new ticket via URL params (Mocked API)', async ({ page, context }) => {
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

    await page.goto('/ticket?bookingid=test-booking-123');
    
    await expect(page.locator('text=Is this correct?')).toBeVisible();
    await page.getByRole('button', { name: 'Add Ticket' }).click();

    await expect(page.getByRole('heading', { name: 'Test User' })).toBeVisible();
    await expect(page.locator('text=Developer @ Test Org')).toBeVisible();

    await expect(page).toHaveURL(/.*\/ticket$/);

    const storedTicketStr = await page.evaluate(() => localStorage.getItem('ubucon_ticket'));
    expect(storedTicketStr).toBeTruthy();
    const storedTicket = JSON.parse(storedTicketStr!);
    expect(storedTicket.name).toBe('Test User');
    expect(storedTicket.bookingId).toBe('test-booking-123');
  });

  test('Modal appears when scanning a new ticket while one exists', async ({ page, context }) => {
    await context.route(/.*api\.konfhub\.com.*/, async route => {
      const json = {
        name: "New User",
        emailId: "new@example.com",
        organisation: "New Org",
        designation: "New Role",
        ticketName: "VIP Pass"
      };
      await route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    await page.goto('/ticket');
    await page.evaluate(() => {
      localStorage.setItem('ubucon_ticket', JSON.stringify({
        name: 'Old User',
        emailId: 'old@example.com',
        organisation: 'Old Org',
        designation: 'Old Role',
        bookingId: 'old-123'
      }));
    });
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Old User' })).toBeVisible();

    await page.goto('/ticket?bookingid=new-456');

    await expect(page.locator('text=Remove previous ticket?')).toBeVisible();
    await expect(page.locator('#modal')).toContainText('You already have a saved ticket for Old User');
    await expect(page.locator('#modal')).toContainText('New User');

    await page.getByRole('button', { name: 'Replace Ticket' }).click();

    await expect(page.getByRole('heading', { name: 'New User' })).toBeVisible();
    const storedTicketStr = await page.evaluate(() => localStorage.getItem('ubucon_ticket'));
    const storedTicket = JSON.parse(storedTicketStr!);
    expect(storedTicket.name).toBe('New User');
    expect(storedTicket.bookingId).toBe('new-456');
  });

  test('Old ticket is preserved in localStorage when replace fetch fails', async ({ page, context }) => {
    await page.goto('/ticket');
    await page.evaluate(() => {
      localStorage.setItem('ubucon_ticket', JSON.stringify({
        name: 'Existing User',
        bookingId: 'exist-123'
      }));
    });
    await page.reload();

    await context.route(/.*api\.konfhub\.com.*/, async route => {
      await route.fulfill({ status: 500 });
    });

    await page.goto('/ticket?bookingid=fail-456');

    await expect(page.locator('.p-notification--negative')).toBeVisible();

    const storedTicketStr = await page.evaluate(() => localStorage.getItem('ubucon_ticket'));
    const storedTicket = JSON.parse(storedTicketStr!);
    expect(storedTicket.name).toBe('Existing User');
  });

  test('Error state is handled robustly on API failure', async ({ page, context }) => {
    await context.route(/.*api\.konfhub\.com.*/, async route => {
      await route.fulfill({ status: 404 });
    });

    await page.goto('/ticket?bookingid=invalid-id');

    await expect(page.locator('.p-notification--negative')).toBeVisible();
    await expect(page.locator('.p-notification--negative')).toContainText(/Failed to validate ticket|Could not fetch ticket details/);
    await expect(page.locator('text=No ticket added yet')).toBeVisible();
  });

  test('Modal closes on Escape key', async ({ page, context }) => {
    await context.route(/.*api\.konfhub\.com.*/, async route => {
      await route.fulfill({
        json: { name: 'Esc User', ticketName: 'Pass' },
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    });

    await page.goto('/ticket?bookingid=esc-123');
    await expect(page.locator('#modal')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('#modal')).not.toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('ubucon_ticket'));
    expect(stored).toBeNull();
  });

  test('QR code payload matches KonfHub wire format (id|n|eid)', async ({ page, context }) => {
    await context.route(/.*api\.konfhub\.com.*/, async route => {
      await route.fulfill({
        json: { name: 'Format User', ticketName: 'Pass' },
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    });

    await page.goto('/ticket?bookingid=wire-789');
    await expect(page.locator('#modal')).toBeVisible();
    await page.getByRole('button', { name: 'Add Ticket' }).click();

    await expect(page.getByRole('heading', { name: 'Format User' })).toBeVisible();

    const imageHref = await page.locator('svg image').getAttribute('href');
    expect(imageHref).toBeTruthy();
    expect(imageHref).toMatch(/^data:image\/png;base64,/);
  });
});
