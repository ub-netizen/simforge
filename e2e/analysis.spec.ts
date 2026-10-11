import { expect, test } from '@playwright/test';
import { WORKSPACE, buildTriangle, emptySpot, nodePos, openTab, setField, svgTexts, tableRows } from './helpers';

/**
 * The 3-4-5 reference triangle built through the UI must reproduce the
 * hand-derived solution (see src/modules/structural/validation/referenceCases.ts):
 * N(N3–N1) = +12.5 kN, N(N2–N3) = −7.5 kN, N(N1–N2) = 0,
 * R1 = (−10, −7.5) kN, R2y = 7.5 kN, u3 = (0.475, −0.1125) mm, FoS(A36) = 20.
 */
test('reproduces the analytical solution of the 3-4-5 triangle', async ({ page }) => {
  await page.goto(WORKSPACE);
  await buildTriangle(page);
  await page.keyboard.press('r');

  const forces = Object.fromEntries((await tableRows(page)).map((r) => [r[0], r]));
  expect(forces.M3).toEqual(['M3', 'N3–N1', '5', '12.5', 'tension', '12.5', '20']);
  expect(forces.M2).toEqual(['M2', 'N2–N3', '3', '-7.5', 'compression', '-7.5', '33.3*']);
  expect(forces.M1).toEqual(['M1', 'N1–N2', '4', '0', 'zero-force', '0', '∞']);

  const labels = await svgTexts(page);
  expect(labels).toEqual(expect.arrayContaining(['12.5 kN T', '7.5 kN C', '10 kN']));

  await openTab(page, 'Reactions');
  expect(await tableRows(page)).toEqual([
    ['N1', 'Pin', '-10', '-7.5'],
    ['N2', 'Roller (y)', 'free', '7.5'],
  ]);
  const totals = await page
    .locator('section[aria-label=Results] tfoot tr')
    .evaluateAll((rows) => rows.map((tr) => [...(tr as HTMLTableRowElement).cells].map((c) => c.innerText.trim())));
  expect(totals).toEqual([
    ['Σ reactions', '-10', '0'],
    ['Σ applied loads', '10', '0'],
  ]);

  await openTab(page, 'Displacements');
  expect((await tableRows(page)).find((r) => r[0] === 'N3')).toEqual(['N3', '0.475', '-0.1125', '0.4881']);

  await openTab(page, 'Diagnostics');
  await expect(page.locator('section[aria-label=Results]')).toContainText('Equilibrium satisfied');
  await expect(page.locator('section[aria-label=Results]')).toContainText('Buckling is not checked');
});

test('hides stale results, restores them on undo, and re-solves in live mode', async ({ page }) => {
  await page.goto(WORKSPACE);
  await buildTriangle(page);
  await page.keyboard.press('r');

  const n3 = await nodePos(page, 'N3');
  await page.mouse.move(n3.x, n3.y);
  await page.mouse.down();
  await page.mouse.move(n3.x + 60, n3.y - 40, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText('Results out of date')).toBeVisible();
  expect(await svgTexts(page)).not.toContain('12.5 kN T');

  // Undo returns to the analysed model object, so its results are valid again.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await svgTexts(page)).toContain('12.5 kN T');

  await page.getByLabel('Live').check();
  const p = await nodePos(page, 'N3');
  await page.mouse.click(p.x - 35, p.y); // the load arrow (load points +x, arrow is left of the node)
  await setField(page, 'Fx', 20);
  await expect.poll(() => svgTexts(page)).toContain('25 kN T');

  // Removing the roller leaves a mechanism.
  const empty = await emptySpot(page);
  await page.mouse.click(empty.x, empty.y);
  const n2 = await nodePos(page, 'N2');
  await page.mouse.click(n2.x, n2.y + 15); // support glyph below the node
  await page.keyboard.press('Delete');
  await expect(page.getByText('Unstable structure')).toBeVisible();
  await openTab(page, 'Diagnostics');
  await expect(page.locator('section[aria-label=Results]')).toContainText('1 independent way to move');
});
