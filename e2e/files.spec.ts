import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { WORKSPACE, chooseMenu, expectCounts, openTab, tableRows } from './helpers';

async function download(page: Page, action: () => Promise<unknown>): Promise<{ download: Download; path: string; text: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await d.path();
  return { download: d, path, text: readFileSync(path, 'utf8') };
}

function hasPython() {
  try {
    execFileSync('python3', ['--version']);
    return true;
  } catch {
    return false;
  }
}

test('opens an example from the homepage, exports results, and cross-checks them in Python', async ({ page }) => {
  await page.goto('#/');
  await page.locator('a[href="#/structural/truss?example=warren"]').click();
  await expectCounts(page, 7, 11);
  await expect(page).not.toHaveURL(/example=/);
  await expect(page.getByLabel('Project name')).toHaveValue('Warren bridge truss');

  // Hand solution, P = 10 kN: top chord −4P/3, middle bottom chord 5P/3.
  await page.keyboard.press('r');
  const rows = Object.fromEntries((await tableRows(page)).map((r) => [r[0], r]));
  expect(rows.M4![3]).toBe('-13.33');
  expect(rows.M2![3]).toBe('16.67');

  const csv = await download(page, () => page.getByRole('button', { name: 'CSV' }).click());
  expect(csv.download.suggestedFilename()).toBe('warren-bridge-truss-member-forces.csv');
  expect(csv.text.startsWith('member,node_i,node_j,length_m,axial_force_kN')).toBe(true);
  expect(csv.text.split('\r\n').find((l) => l.startsWith('M2,'))!.split(',')[4]).toBe('16.6666666667');

  const json = await download(page, () => page.keyboard.press('ControlOrMeta+s'));
  expect(json.download.suggestedFilename()).toBe('warren-bridge-truss.simforge.json');
  const project = JSON.parse(json.text);
  expect(project).toMatchObject({ format: 'simforge.truss', version: 1, name: 'Warren bridge truss' });
  expect(project.model.loads[0].fy).toBe(-10000);

  test.skip(!hasPython(), 'python3 not available');
  const out = execFileSync('python3', ['-I', 'scripts/crosscheck_truss.py', json.path, csv.path], { encoding: 'utf8' });
  expect(out).toMatch(/-> {2}AGREE/);
});

test('exports standalone SVG and PNG images without the selection highlight', async ({ page }) => {
  await page.goto(`${WORKSPACE}?example=pratt`);
  await page.keyboard.press('r');
  await page.keyboard.press('ControlOrMeta+a');
  const halo = page.locator('svg[role=application] [stroke-opacity="0.3"]');
  const halos = await halo.count();
  expect(halos).toBeGreaterThan(0);

  const svg = await download(page, () => chooseMenu(page, 'File', 'Export image (SVG)'));
  expect(svg.text).toContain('<svg');
  expect(svg.text).not.toContain('var(--');
  expect(svg.text).not.toContain('stroke-opacity="0.3"');
  expect(svg.text).toContain('Pratt bridge truss · SimForge');
  expect(svg.text).toContain('blue tension');
  await expect(halo).toHaveCount(halos); // selection survives the export

  const png = await download(page, () => chooseMenu(page, 'File', 'Export image (PNG)'));
  const bytes = readFileSync(png.path);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(2000); // 2× the canvas width
});

test('autosaves, opens project files, and rejects broken ones', async ({ page }) => {
  await page.goto(`${WORKSPACE}?example=cantilever`);
  await expectCounts(page, 7, 10);
  await expect(page.locator('footer')).toContainText('saved in this browser');

  await page.reload();
  await expectCounts(page, 7, 10);
  await expect(page.getByLabel('Project name')).toHaveValue('Cantilever truss');

  await chooseMenu(page, 'File', 'New model');
  await expectCounts(page, 0, 0);
  await page.keyboard.press('ControlOrMeta+z');
  await expectCounts(page, 7, 10);

  const broken = { format: 'simforge.truss', version: 1, model: { nodes: [{ id: 'A', x: 0, y: 0 }], members: [{ id: 'm', nodeI: 'A', nodeJ: 'B', E: 1, A: 1 }] } };
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.simforge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) });
  await expect(page.getByRole('alert')).toContainText('Could not open broken.simforge.json');
  await expect(page.getByRole('alert')).toContainText('missing node "B"');
  await expectCounts(page, 7, 10); // unchanged

  const newer = { format: 'simforge.truss', version: 99, model: {} };
  await page.locator('input[type=file]').setInputFiles({ name: 'future.simforge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await expect(page.getByRole('alert')).toContainText('version 99');
});

test('the settlement example induces forces without any load', async ({ page }) => {
  await page.goto(WORKSPACE);
  await chooseMenu(page, 'Examples', 'Support settlement');
  await page.keyboard.press('r');
  await openTab(page, 'Member forces');
  const rows = await tableRows(page);
  expect(rows).toHaveLength(3);
  for (const r of rows) expect(Number(r[3])).not.toBe(0);
});
