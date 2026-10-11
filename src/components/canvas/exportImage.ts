/**
 * Standalone image export of an on-screen SVG canvas. The live SVG uses CSS
 * custom properties (var(--color-…)), which an exported file cannot resolve,
 * so every var() is replaced by its computed value. A background and a caption
 * strip are added so the image is self-explanatory.
 */

const CAPTION_PX = 30;

export interface Caption {
  left: string;
  right?: string;
}

export function svgSnapshot(svg: SVGSVGElement, caption: Caption): { text: string; width: number; height: number } {
  const width = Math.round(svg.width.baseVal.value);
  const plotHeight = Math.round(svg.height.baseVal.value);
  const height = plotHeight + CAPTION_PX;
  const root = getComputedStyle(document.documentElement);
  const resolve = (value: string) => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => root.getPropertyValue(name).trim());

  const clone = svg.cloneNode(true) as SVGSVGElement;
  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    el.removeAttribute('class');
    for (const attr of [...el.attributes]) if (attr.value.includes('var(')) el.setAttribute(attr.name, resolve(attr.value));
  }
  for (const a of ['role', 'aria-label']) clone.removeAttribute(a);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const color = (name: string) => root.getPropertyValue(name).trim();
  const font = color('--font-sans') || 'sans-serif';

  clone.prepend(make('rect', { x: 0, y: 0, width, height, fill: color('--color-bg') }));
  const strip = make('g', { 'font-family': font, 'font-size': 12 });
  strip.append(
    make('rect', { x: 0, y: plotHeight, width, height: CAPTION_PX, fill: color('--color-panel') }),
    make('line', { x1: 0, x2: width, y1: plotHeight + 0.5, y2: plotHeight + 0.5, stroke: color('--color-line') }),
    make('text', { x: 12, y: plotHeight + 19, fill: color('--color-fg') }, caption.left),
  );
  if (caption.right)
    strip.append(make('text', { x: width - 12, y: plotHeight + 19, fill: color('--color-muted'), 'text-anchor': 'end' }, caption.right));
  clone.append(strip);

  const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  return { text, width, height };
}

/** Rasterises SVG text to a PNG at `scale` × its pixel size. */
export async function svgToPng(svgText: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}
