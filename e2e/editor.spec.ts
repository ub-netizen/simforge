import { expect, test } from '@playwright/test';
import { WORKSPACE, canvasBox, emptySpot, expectCounts, fieldValue, nodePos, setField, svgTexts } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto(WORKSPACE);
});

test('draws a triangle with the node, member, support and load tools', async ({ page }) => {
  const b = await canvasBox(page);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  await page.keyboard.press('n');
  await page.mouse.click(cx - 200, cy + 100);
  await page.mouse.click(cx + 200, cy + 100);
  await page.mouse.click(cx, cy - 150);
  await expectCounts(page, 3, 0);

  // Placed nodes snap to the grid step shown in the status bar.
  await page.keyboard.press('v');
  const p1 = await nodePos(page, 'N1');
  await page.mouse.click(p1.x, p1.y);
  const step = Number((await page.locator('footer').innerText()).match(/snap ([\d.]+) m/)![1]);
  for (const v of [Number(await fieldValue(page, 'x')), Number(await fieldValue(page, 'y'))])
    expect(Math.abs(v / step - Math.round(v / step))).toBeLessThan(1e-9);

  const p2 = await nodePos(page, 'N2');
  const p3 = await nodePos(page, 'N3');
  await page.keyboard.press('m');
  for (const p of [p1, p2, p3, p1]) await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Escape');
  await expectCounts(page, 3, 3);

  // A second N1–N2 member is not created.
  await page.mouse.click(p1.x, p1.y);
  await page.mouse.click(p2.x, p2.y);
  await page.keyboard.press('Escape');
  await expectCounts(page, 3, 3);

  await page.keyboard.press('s');
  await page.mouse.click(p1.x, p1.y);
  await page.mouse.click(p2.x, p2.y);
  await page.mouse.click(p2.x, p2.y);
  await expect(page.getByRole('radio', { name: 'Roller (y)' })).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('f');
  await page.mouse.click(p3.x, p3.y);
  expect(await svgTexts(page)).toContain('10 kN');
  await setField(page, 'Fy', -25);
  expect(await svgTexts(page)).toContain('25 kN');

  // Escape reverts an invalid edit instead of committing it.
  const fx = page.locator('aside').getByLabel('Fx', { exact: true });
  await fx.fill('abc');
  await fx.press('Escape');
  expect(await fieldValue(page, 'Fx')).toBe('0');
});

test('drags nodes with one undo step, and undoes deletes', async ({ page }) => {
  const b = await canvasBox(page);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.keyboard.press('m');
  for (const [x, y] of [
    [cx - 200, cy + 100],
    [cx + 200, cy + 100],
    [cx, cy - 150],
    [cx - 200, cy + 100],
  ])
    await page.mouse.click(x, y);
  await page.keyboard.press('Escape');
  await expectCounts(page, 3, 3);

  await page.keyboard.press('v');
  const before = await nodePos(page, 'N3');
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 40, before.y - 80, { steps: 8 });
  await page.mouse.up();
  const after = await nodePos(page, 'N3');
  expect(before.y - after.y).toBeGreaterThan(50);

  await page.keyboard.press('ControlOrMeta+z');
  expect(await nodePos(page, 'N3')).toEqual(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await nodePos(page, 'N3')).toEqual(after);

  // Box-select everything, delete, undo.
  const empty = await emptySpot(page);
  await page.mouse.click(empty.x, empty.y);
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 60, b.y + b.height - 20, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('aside[aria-label=Properties]')).toContainText('6 items selected');
  await page.keyboard.press('Delete');
  await expectCounts(page, 0, 0);
  await page.keyboard.press('ControlOrMeta+z');
  await expectCounts(page, 3, 3);

  // Deleting one node removes its two members.
  await page.mouse.click(empty.x, empty.y);
  const n3 = await nodePos(page, 'N3');
  await page.mouse.click(n3.x, n3.y);
  await page.keyboard.press('Backspace');
  await expectCounts(page, 2, 1);
});

test('holding Space pans the view after clicking the canvas', async ({ page }) => {
  await page.goto(`${WORKSPACE}?example=warren`);
  const empty = await emptySpot(page);
  await page.mouse.click(empty.x, empty.y);
  const before = await nodePos(page, 'N1');
  await page.keyboard.down('Space');
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x - 100, empty.y - 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const after = await nodePos(page, 'N1');
  expect(Math.round(after.x - before.x)).toBe(-100);
  expect(Math.round(after.y - before.y)).toBe(-50);
  await expectCounts(page, 7, 11); // panning edited nothing
});

test('rejects invalid member properties', async ({ page }) => {
  const b = await canvasBox(page);
  await page.keyboard.press('m');
  await page.mouse.click(b.x + 300, b.y + 300);
  await page.mouse.click(b.x + 600, b.y + 300);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.mouse.click(b.x + 450, b.y + 300);
  await expect(page.locator('aside')).toContainText('Member M1');
  await setField(page, 'Area A', 2500);
  expect(await fieldValue(page, 'Area A')).toBe('2500');
  await setField(page, 'Area A', -5);
  expect(await fieldValue(page, 'Area A')).toBe('2500');
});
