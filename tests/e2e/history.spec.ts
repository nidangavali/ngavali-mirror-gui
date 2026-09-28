import { test, expect } from '@playwright/test';
import { MINIMAL_ISC_YAML } from '../helpers/minimalConfig.js';
import { seedOperation } from '../helpers/seedOperation.js';

test.describe('History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/history');
  });

  test('history page loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/history/);
    await expect(page.getByText('Operation History').first()).toBeVisible({ timeout: 15000 });
  });

  test('filter dropdown is present', async ({ page }) => {
    await expect(page.getByLabel('Filter operations')).toBeVisible({ timeout: 15000 });
  });

  test('export button is present', async ({ page }) => {
    await expect(page.getByText('Export CSV').first()).toBeVisible({ timeout: 15000 });
  });

  test('filter dropdown shows all status options', async ({ page }) => {
    const toggle = page.getByLabel('Filter operations');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await expect(page.getByRole('option', { name: 'All Operations' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Successful' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Failed' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Stopped' })).toBeVisible();
  });

  test('select all checkbox is present when operations exist', async ({ page }) => {
    const table = page.locator('table');
    const emptyState = page.getByText('No operations found.');
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      await expect(table.locator('thead input[type="checkbox"]')).toBeVisible();
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test('Delete All button is present when operations exist', async ({ page }) => {
    const table = page.locator('table');
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      await expect(page.getByRole('button', { name: /delete all/i })).toBeVisible();
    }
  });
});

// Row checkbox selection and "Delete Selected" on the History page.
test.describe('History - Row Selection & Bulk Delete Selected', () => {
  test.describe.configure({ mode: 'serial' });

  const createdConfigs: string[] = [];
  const createdOperations: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const opId of createdOperations) {
      await request.post(`/api/operations/${opId}/stop`).catch(() => {});
      await request.delete(`/api/operations/${opId}`).catch(() => {});
    }
    for (const name of createdConfigs) {
      await request.delete(`/api/config/delete/${name}`).catch(() => {});
    }
  });

  test('seed operations for history selection tests', async ({ request }) => {
    for (let i = 1; i <= 3; i++) {
      const configName = `e2e-histsel-${Date.now()}-${i}.yaml`;
      createdConfigs.push(configName);

      const saveRes = await request.post('/api/config/save', {
        data: { config: MINIMAL_ISC_YAML, name: configName },
      });
      expect(saveRes.ok(), `Config save failed: ${await saveRes.text()}`).toBeTruthy();

      const opId = await seedOperation(request, configName);
      createdOperations.push(opId);
    }
  });

  test('row checkbox toggles on click', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    const cb = table.locator('tbody tr').first().locator('input[type="checkbox"]');
    await expect(cb).not.toBeChecked();
    await cb.click();
    await expect(cb).toBeChecked();
    await cb.click();
    await expect(cb).not.toBeChecked();
  });

  test('checking multiple rows selects only those rows', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    const rows = table.locator('tbody tr');
    await rows.nth(0).locator('input[type="checkbox"]').click();
    await rows.nth(2).locator('input[type="checkbox"]').click();

    await expect(rows.nth(0).locator('input[type="checkbox"]')).toBeChecked();
    await expect(rows.nth(1).locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(rows.nth(2).locator('input[type="checkbox"]')).toBeChecked();
  });

  test('select-all checkbox checks and unchecks every row', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    const selectAll = table.locator('thead input[type="checkbox"]');
    const rowCheckboxes = table.locator('tbody tr input[type="checkbox"]');
    const count = await rowCheckboxes.count();

    await selectAll.click();
    for (let i = 0; i < count; i++) {
      await expect(rowCheckboxes.nth(i)).toBeChecked();
    }

    await selectAll.click();
    for (let i = 0; i < count; i++) {
      await expect(rowCheckboxes.nth(i)).not.toBeChecked();
    }
  });

  test('"Delete Selected" button appears with correct count and hides after uncheck', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: /delete selected/i })).not.toBeVisible();

    const rows = table.locator('tbody tr');
    await rows.nth(0).locator('input[type="checkbox"]').click();
    await rows.nth(1).locator('input[type="checkbox"]').click();
    await expect(page.getByRole('button', { name: /delete selected \(2\)/i })).toBeVisible();

    await rows.nth(0).locator('input[type="checkbox"]').click();
    await rows.nth(1).locator('input[type="checkbox"]').click();
    await expect(page.getByRole('button', { name: /delete selected/i })).not.toBeVisible();
  });

  test('cancelling the bulk-delete modal keeps all rows intact', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    const rowsBefore = await table.locator('tbody tr').count();
    await table.locator('tbody tr').first().locator('input[type="checkbox"]').click();
    await page.getByRole('button', { name: /delete selected/i }).click();

    const modal = page.locator('[aria-label="Confirm deletion"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).not.toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(rowsBefore);
  });

  test('confirming "Delete Selected" removes only the checked row', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    const rows = table.locator('tbody tr');
    const rowsBefore = await rows.count();
    const survivorText = await rows.nth(1).locator('td').nth(2).innerText();

    await rows.first().locator('input[type="checkbox"]').click();
    await page.getByRole('button', { name: /delete selected \(1\)/i }).click();

    const modal = page.locator('[aria-label="Confirm deletion"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Delete' }).click();

    await expect(modal).not.toBeVisible({ timeout: 10000 });
    await expect(rows).toHaveCount(rowsBefore - 1, { timeout: 15000 });
    await expect(table.getByText(survivorText)).toBeVisible();
  });

  test('select-all then "Delete Selected" removes all remaining rows', async ({ page }) => {
    await page.goto('/history');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });

    table.locator('thead input[type="checkbox"]').click();
    await page.getByRole('button', { name: /delete selected/i }).click();

    const modal = page.locator('[aria-label="Confirm deletion"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Delete' }).click();

    await expect(modal).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No operations found.')).toBeVisible({ timeout: 15000 });
  });
});
