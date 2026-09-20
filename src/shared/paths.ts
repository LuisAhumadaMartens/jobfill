export const CONTENT_SCRIPT = 'content/content-script.js';

export const PANEL_STYLESHEET = 'content/panel.css';

export const PDF_WORKER = 'vendor/pdfjs/pdf.worker.min.mjs';

export const FONTS: Array<{ file: string; weight: number; style: 'normal' | 'italic' }> = [
  { file: 'assets/fonts/Rajdhani-400.woff2', weight: 400, style: 'normal' },
  { file: 'assets/fonts/Rajdhani-600.woff2', weight: 600, style: 'normal' },
  { file: 'assets/fonts/Rajdhani-700.woff2', weight: 700, style: 'normal' }
];

export const PANEL_MONO_FONTS = [
  { file: 'assets/fonts/ShareTechMono-400.woff2', weight: 400, style: 'normal' }
] as const;

export const PANEL_FONT = 'JobFill Rajdhani';
export const PANEL_MONO = 'JobFill Share Tech Mono';

export const BADGE_READY = '#0574f5';

export const BADGE_ATTENTION = '#9a6700';
