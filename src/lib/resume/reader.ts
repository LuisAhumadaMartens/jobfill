import { pdfToText } from './pdf.ts';
import { docxToText } from './docx.ts';
import { extract, type ExtractResult } from './extract.ts';
import type { ResumeRecord } from '../../shared/types.ts';

export type ParsedResume = ResumeRecord & ExtractResult;

const MAX_BYTES = 12 * 1024 * 1024;

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name || '');
  return match ? match[1].toLowerCase() : '';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export async function readResumeFile(file: File): Promise<ParsedResume> {
  if (!file) throw new Error('No file given.');
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 12 MB.');

  const ext = extensionOf(file.name);
  const buffer = await file.arrayBuffer();
  let text: string;

  if (ext === 'pdf' || file.type === 'application/pdf') {
    ({ text } = await pdfToText(buffer));
  } else if (ext === 'docx' || file.type.includes('wordprocessingml')) {
    ({ text } = await docxToText(buffer));
  } else if (ext === 'txt' || ext === 'md' || ext === 'text' || file.type.startsWith('text/')) {
    text = new TextDecoder().decode(buffer);
  } else if (ext === 'doc') {
    throw new Error('Legacy .doc files are not supported. Save it as .docx or PDF first.');
  } else {
    throw new Error('Unsupported file type: ' + (ext || file.type || 'unknown'));
  }

  const parsed = extract(text);

  return Object.assign({
    text,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl: await readAsDataUrl(file),
    parsedAt: new Date().toISOString()
  }, parsed);
}

export function readResumeText(text: string): ParsedResume {
  const parsed = extract(text);
  return Object.assign({ text, name: 'pasted-resume.txt', type: 'text/plain', size: text.length, dataUrl: null, parsedAt: new Date().toISOString() }, parsed);
}
