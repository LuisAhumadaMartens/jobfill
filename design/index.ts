import { tokens, type TokenOptions } from './tokens.ts';
import { HUD, PILL, TABLE, edge } from './surfaces.ts';
import { BACKDROP, LAYOUT, SECTION, SKEW } from './backdrop.ts';
import { MARK, SHELL, footer, header } from './chrome.ts';

export { tokens, edge, HUD, TABLE, PILL, BACKDROP, LAYOUT, SECTION, SKEW, MARK, SHELL, header, footer };
export type { Link } from './chrome.ts';

function face(family: string, weight: number, file: string): string {
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('../assets/fonts/${file}') format('woff2');
}`;
}

export const FONTS = [
  face('Rajdhani', 400, 'Rajdhani-400.woff2'),
  face('Rajdhani', 600, 'Rajdhani-600.woff2'),
  face('Rajdhani', 700, 'Rajdhani-700.woff2'),
  face('Share Tech Mono', 400, 'ShareTechMono-400.woff2')
].join('\n\n');

export const BASE = `
* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--fg);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

::selection { background: var(--program); color: var(--program-fg); }

button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }

:focus-visible { outline: 1px solid var(--program); outline-offset: 2px; }

a { color: var(--program); }

h1, h2, h3, h4 { color: var(--fg-bright); font-weight: 700; }

.label {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-faint);
}
`;

export const FIELDS = `
input[type='text'],
input[type='search'],
input[type='email'],
input[type='url'],
input[type='tel'],
input[type='number'],
select,
textarea {
  width: 100%;
  background-color: var(--sink);
  color: var(--fg-bright);
  border: 1px solid var(--line);
  border-radius: 0;
  padding: 7px 10px;
  transition: border-color 160ms var(--ease);
}

input::placeholder,
textarea::placeholder { color: var(--fg-faint); }

input:hover, select:hover, textarea:hover,
input:focus, select:focus, textarea:focus { border-color: var(--program); }

textarea { resize: vertical; }

input[type='checkbox'] { accent-color: var(--program); width: 14px; height: 14px; }
`;

const BUTTON = `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 9px 16px;
  transition: background-color 160ms var(--ease), border-color 160ms var(--ease), color 160ms var(--ease);
`;

export const CONTROLS = `
.primary {
  ${BUTTON}
  border: 1px solid var(--program);
  background-color: var(--program);
  color: var(--program-fg);
}

.primary:hover:not(:disabled) { background-color: var(--program-hover); border-color: var(--program-hover); }
.primary:disabled { opacity: 0.4; cursor: default; }

.ghost {
  ${BUTTON}
  border: 1px solid var(--line);
  background-color: color-mix(in oklch, var(--sink), transparent 40%);
  color: var(--fg);
}

.ghost:hover:not(:disabled) { border-color: var(--program); color: var(--program); }
.ghost:disabled { opacity: 0.4; cursor: default; }

.outline {
  ${BUTTON}
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--fg);
}

.outline:hover { border-color: var(--program); color: var(--program); }

.danger {
  ${BUTTON}
  border: 1px solid color-mix(in oklch, var(--danger), transparent 60%);
  background: transparent;
  color: var(--danger);
}

.danger:hover { background-color: color-mix(in oklch, var(--danger), transparent 88%); border-color: var(--danger); }

.link { border: 0; background: none; padding: 0; color: var(--program); font-weight: 700; text-decoration: none; }
.link:hover { color: var(--fg-bright); }
.link.muted { color: var(--fg-faint); font-weight: 400; }
`;

export function page(options: TokenOptions = {}): string {
  return [tokens(options), BASE, FIELDS, CONTROLS, SKEW, edge('.box'), HUD, SECTION, TABLE, PILL].join('\n');
}
