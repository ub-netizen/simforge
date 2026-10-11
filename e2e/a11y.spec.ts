import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { WORKSPACE } from './helpers';

/** WCAG 2.1 A/AA rules from axe-core. */
async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ') + ' :: ' + n.failureSummary?.split('\n')[1]?.trim()),
  }));
}

test('homepage has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('#/');
  expect(await violations(page)).toEqual([]);
});

test('empty workspace has no WCAG A/AA violations', async ({ page }) => {
  await page.goto(WORKSPACE);
  await page.locator('svg[role=application]').waitFor();
  expect(await violations(page)).toEqual([]);
});

test('workspace with results has no WCAG A/AA violations', async ({ page }) => {
  await page.goto(`${WORKSPACE}?example=warren`);
  await page.keyboard.press('r');
  await page.getByRole('tab', { name: 'Member forces' }).waitFor();
  expect(await violations(page)).toEqual([]);
});

test('a model can be built and analysed without using the canvas', async ({ page }) => {
  await page.goto(WORKSPACE);
  const panel = page.locator('aside[aria-label=Properties]');
  const addNode = async (x: number, y: number) => {
    await panel.getByLabel('x (m)', { exact: true }).fill(String(x));
    await panel.getByLabel('y (m)', { exact: true }).fill(String(y));
    await panel.getByLabel('y (m)', { exact: true }).press('Enter');
  };
  await addNode(0, 0);
  await addNode(4, 0);
  await addNode(4, 3);
  for (const [i, j] of [
    ['N1', 'N2'],
    ['N2', 'N3'],
    ['N3', 'N1'],
  ]) {
    await panel.getByLabel('From', { exact: true }).selectOption(i!);
    await panel.getByLabel('To', { exact: true }).selectOption(j!);
    await panel.getByRole('button', { name: 'Add member' }).press('Enter');
  }
  await expect(page.locator('footer')).toContainText('3 nodes · 3 members');

  const select = async (key: string) => panel.getByLabel('Select', { exact: true }).selectOption(key);
  await select('node:N1');
  await panel.getByRole('radio', { name: 'Pin' }).press('Space');
  await page.keyboard.press('Escape');
  await select('node:N2');
  await panel.getByRole('radio', { name: 'Roller (y)' }).press('Space');
  await page.keyboard.press('Escape');
  await select('node:N3');
  await panel.getByRole('button', { name: /Add load/ }).press('Enter');
  for (const [label, value] of [
    ['Fx', '10'],
    ['Fy', '0'],
  ]) {
    await panel.getByLabel(label, { exact: true }).fill(value!);
    await panel.getByLabel(label, { exact: true }).press('Enter');
  }

  await page.keyboard.press('r');
  const rows = await page
    .locator('section[aria-label=Results] tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...(tr as HTMLTableRowElement).cells].map((c) => c.innerText.trim())));
  expect(rows.map((r) => r[3])).toEqual(['0', '-7.5', '12.5']);

  // Result rows are keyboard-selectable.
  await page.locator('section[aria-label=Results] tbody tr').nth(2).press('Enter');
  await expect(panel).toContainText('Member M3');
});
