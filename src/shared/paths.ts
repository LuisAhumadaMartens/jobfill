export const CONTENT_SCRIPT = 'content/content-script.js';

export const PANEL_STYLESHEET = 'content/panel.css';

export const PDF_WORKER = 'vendor/pdfjs/pdf.worker.min.mjs';

export const FONTS: Array<{ file: string; weight: number; style: 'normal' | 'italic' }> = [
  { file: 'assets/fonts/Lato-Regular.woff2', weight: 400, style: 'normal' },
  { file: 'assets/fonts/Lato-Italic.woff2', weight: 400, style: 'italic' },
  { file: 'assets/fonts/Lato-Bold.woff2', weight: 700, style: 'normal' },
  { file: 'assets/fonts/Lato-Black.woff2', weight: 900, style: 'normal' }
];

export const PANEL_FONT = 'JobFill Lato';

export const BADGE_READY = '#0574f5';

export const BADGE_ATTENTION = '#9a6700';
