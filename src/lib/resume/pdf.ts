import * as pdfjs from '../../../vendor/pdfjs/pdf.min.mjs';
import type { TextItem } from '../../../vendor/pdfjs/pdf.min.mjs';
import { PDF_WORKER } from '../../shared/paths.ts';

interface Line {
  y: number;
  parts: string[];
  lastEnd: number | null;
}

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(PDF_WORKER);

const LINE_TOLERANCE = 3;

const COLUMN_GAP = 12;

function itemsToLines(items: TextItem[]): string[] {
  const lines: Line[] = [];
  let current: Line | null = null;

  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform ? item.transform[5] : 0;
    const x = item.transform ? item.transform[4] : 0;

    if (!current || Math.abs(current.y - y) > LINE_TOLERANCE) {
      if (current) lines.push(current);
      current = { y, parts: [], lastEnd: null };
    }

    if (item.str.trim()) {
      const gap = current.lastEnd == null ? 0 : x - current.lastEnd;
      const previous = current.parts[current.parts.length - 1] ?? '';
      if (current.parts.length && gap > COLUMN_GAP) current.parts.push('  ');
      else if (current.parts.length && gap > 0.6 && !/\s$/.test(previous)) current.parts.push(' ');
      current.parts.push(item.str);
    }
    current.lastEnd = x + (item.width || 0);

    if (item.hasEOL) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);

  return lines
    .map((line) => line.parts.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export async function pdfToText(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),

    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false
  }).promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items).join('\n'));
    page.cleanup();
  }
  const text = pages.join('\n');
  await doc.destroy();

  if (!text.replace(/\s/g, '')) {
    throw new Error('This PDF has no selectable text. It is probably a scan, so export a text PDF or paste the text instead.');
  }
  return { text, pages: doc.numPages };
}
