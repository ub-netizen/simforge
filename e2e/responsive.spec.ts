import { expect, test, type Page } from '@playwright/test';
import { WORKSPACE } from './helpers';

const WIDTHS = [360, 390, 768, 1024];

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw) return `page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`;
    const header = [...document.querySelectorAll('header *')].find((e) => e.getBoundingClientRect().right > vw + 0.5);
    return header ? `header element overflows: ${header.outerHTML.slice(0, 80)}` : null;
  });
}

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('#/');
    expect(await horizontalOverflow(page)).toBeNull();
    await page.goto(`${WORKSPACE}?example=warren`);
    await page.locator('svg[role=application]').waitFor();
    expect(await horizontalOverflow(page)).toBeNull();
    // The essential controls stay reachable.
    await expect(page.getByRole('button', { name: /Run analysis/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'File' })).toBeVisible();
  });
}
