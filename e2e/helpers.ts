import { expect, type Page } from '@playwright/test';

export const WORKSPACE = '#/structural/truss';

/** Screen position of a node, from its label (drawn 8 px up-right of the node). */
export async function nodePos(page: Page, id: string) {
  const p = await page.evaluate((nodeId) => {
    const svg = document.querySelector('svg[role=application]')!;
    const r = svg.getBoundingClientRect();
    const t = [...svg.querySelectorAll('text')].find((x) => x.textContent === nodeId);
    return t ? { x: r.left + Number(t.getAttribute('x')) - 8, y: r.top + Number(t.getAttribute('y')) + 8 } : null;
  }, id);
  if (!p) throw new Error(`node ${id} not found`);
  return p;
}

export async function canvasBox(page: Page) {
  const box = await page.locator('svg[role=application]').boundingBox();
  if (!box) throw new Error('canvas not visible');
  return box;
}

/** A point on empty canvas, near the bottom-right corner. */
export async function emptySpot(page: Page) {
  const b = await canvasBox(page);
  return { x: b.x + b.width - 120, y: b.y + b.height - 60 };
}

export async function svgTexts(page: Page): Promise<string[]> {
  return page.locator('svg[role=application] text').allTextContents();
}

/** Model size as reported in the status bar. */
export async function expectCounts(page: Page, nodes: number, members: number) {
  await expect(page.locator('footer')).toContainText(`${nodes} nodes · ${members} members`);
}

/** Types into a properties-panel number field and commits it with Enter. */
export async function setField(page: Page, label: string, value: number | string) {
  const input = page.locator('aside[aria-label=Properties]').getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
}

export async function fieldValue(page: Page, label: string) {
  return page.locator('aside[aria-label=Properties]').getByLabel(label, { exact: true }).inputValue();
}

export async function chooseMenu(page: Page, menu: string, item: string) {
  await page.locator('header').getByRole('button', { name: menu }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${escape(item)}`) }).click();
}

/** Rows of the visible results table as arrays of cell text. */
export async function tableRows(page: Page): Promise<string[][]> {
  return page
    .locator('section[aria-label=Results] tbody tr')
    .evaluateAll((rows) => rows.map((tr) => [...(tr as HTMLTableRowElement).cells].map((c) => c.innerText.trim())));
}

export async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name: new RegExp(`^${escape(name)}`) }).click();
}

/**
 * Builds the 3-4-5 reference triangle through the UI:
 * N1 (0,0) pin, N2 (4,0) roller (y), N3 (4,3) with a 10 kN load in +x.
 */
export async function buildTriangle(page: Page) {
  const b = await canvasBox(page);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.keyboard.press('n');
  await page.mouse.click(cx - 150, cy + 80);
  await page.mouse.click(cx + 150, cy + 80);
  await page.mouse.click(cx + 150, cy - 120);
  await page.keyboard.press('v');
  for (const [id, x, y] of [
    ['N1', 0, 0],
    ['N2', 4, 0],
    ['N3', 4, 3],
  ] as const) {
    const empty = await emptySpot(page);
    await page.mouse.click(empty.x, empty.y);
    const p = await nodePos(page, id);
    await page.mouse.click(p.x, p.y);
    await setField(page, 'x', x);
    await setField(page, 'y', y);
  }
  await page.locator('svg[role=application]').hover();
  await page.keyboard.press('0'); // fit view
  const pos = { N1: await nodePos(page, 'N1'), N2: await nodePos(page, 'N2'), N3: await nodePos(page, 'N3') };
  await page.keyboard.press('m');
  for (const id of ['N1', 'N2', 'N3', 'N1'] as const) await page.mouse.click(pos[id].x, pos[id].y);
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  await page.mouse.click(pos.N1.x, pos.N1.y);
  await page.mouse.click(pos.N2.x, pos.N2.y);
  await page.mouse.click(pos.N2.x, pos.N2.y);
  await page.keyboard.press('f');
  await page.mouse.click(pos.N3.x, pos.N3.y);
  await setField(page, 'Fx', 10);
  await setField(page, 'Fy', 0);
  await page.keyboard.press('v');
  const empty = await emptySpot(page);
  await page.mouse.click(empty.x, empty.y);
  return pos;
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
