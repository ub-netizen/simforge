import { test } from '@playwright/test';
import { WORKSPACE, emptySpot, openTab } from './helpers';

/** README images. Run with `npm run screenshots`; output goes to docs/images. */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

test('homepage', async ({ page }) => {
  await page.goto('#/');
  await page.screenshot({ path: 'docs/images/homepage.png' });
});

test('results', async ({ page }) => {
  await page.goto(`${WORKSPACE}?example=pratt`);
  await page.keyboard.press('r');
  await openTab(page, 'Member forces');
  const empty = await emptySpot(page);
  await page.mouse.move(empty.x, empty.y);
  await page.getByRole('status').waitFor({ state: 'detached' }); // let the "Loaded example" toast fade
  await page.screenshot({ path: 'docs/images/workspace-results.png' });
});

test('mechanism', async ({ page }) => {
  await page.goto(`${WORKSPACE}?example=warren`);
  const panel = page.locator('aside[aria-label=Properties]');
  // Remove the roller: a pin alone cannot stop the truss rotating.
  await panel.getByLabel('Select', { exact: true }).selectOption('node:N4');
  await panel.getByRole('radio', { name: 'None' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await page.getByRole('status').waitFor({ state: 'detached' });
  const empty = await emptySpot(page);
  await page.mouse.move(empty.x, empty.y);
  await page.screenshot({ path: 'docs/images/workspace-mechanism.png' });
});
