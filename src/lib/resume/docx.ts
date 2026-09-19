const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;

function findEndOfCentralDirectory(view: DataView, length: number): number {

  const from = Math.max(0, length - 0x10000 - 22);
  for (let i = length - 22; i >= from; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD) return i;
  }
  return -1;
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function listEntries(view: DataView, bytes: Uint8Array): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(view, bytes.length);
  if (eocd < 0) throw new Error('Not a readable .docx file.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(entry: ZipEntry, view: DataView, bytes: Uint8Array): Promise<string> {
  const local = entry.localOffset;
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) throw new Error('Unsupported compression in this .docx.');

  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function docxToText(buffer: ArrayBuffer): Promise<{ text: string }> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = listEntries(view, bytes);

  const parts: string[] = [];
  for (const name of ['word/document.xml', 'word/header1.xml']) {
    const entry = entries.find((e) => e.name === name);
    if (entry) parts.push(xmlToText(await readEntry(entry, view, bytes)));
  }
  if (!parts.length) throw new Error('No document body found inside the .docx.');

  return { text: parts.reverse().filter(Boolean).join('\n') };
}
