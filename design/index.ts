import { tokens, type TokenOptions } from './tokens.ts';
import { PILL, TABLE, edge } from './surfaces.ts';

export { tokens, edge, TABLE, PILL };

export const FONTS = `
@font-face {
  font-family: 'Lato';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../assets/fonts/Lato-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Lato';
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url('../assets/fonts/Lato-Italic.woff2') format('woff2');
}

@font-face {
  font-family: 'Lato';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../assets/fonts/Lato-Bold.woff2') format('woff2');
}

@font-face {
  font-family: 'Lato';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url('../assets/fonts/Lato-Black.woff2') format('woff2');
}
`;

export const BASE = `
* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--fg);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }

:focus-visible { outline: 2px solid var(--program); outline-offset: 2px; }

a { color: var(--program); }
`;

export const CONTROLS = `
.primary {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 0;
  border-radius: var(--r-pill);
  background-color: var(--program);
  color: var(--program-fg);
  font-weight: 700;
  padding: 0.6rem 1.1rem;
  box-shadow: inset 0 1px 1px oklch(1 0 0 / 0.45), 0 4px 10px oklch(0 0 0 / 0.3);
  transition: background-color 160ms var(--ease), scale 160ms var(--ease);
}

.primary:hover:not(:disabled) { background-color: var(--program-hover); }
.primary:active:not(:disabled) { scale: 0.97; }
.primary:disabled { opacity: 0.45; cursor: default; }

.danger {
  border: 1px solid color-mix(in oklch, var(--danger), transparent 55%);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--danger);
  font-weight: 700;
  padding: 0.55rem 1rem;
  transition: background-color 120ms linear, color 120ms linear;
}

.danger:hover { background-color: var(--danger); color: var(--danger-fg); }

.link { border: 0; background: none; padding: 0; color: var(--program); font-weight: 700; text-decoration: none; }
.link:hover { text-decoration: underline; }
.link.muted { color: var(--fg-faint); font-weight: 400; }
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
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0.5rem 0.7rem;
  transition: border-color 120ms linear;
}

input::placeholder,
textarea::placeholder { color: var(--fg-faint); }

input:hover,
select:hover,
textarea:hover { border-color: var(--line-2); }

textarea { resize: vertical; }

input[type='checkbox'] { accent-color: var(--program); width: 1rem; height: 1rem; }
`;

export const GHOST = `
.ghost {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 0;
  border-radius: var(--r-pill);
  background-color: var(--raise);
  color: var(--fg);
  font-weight: 700;
  padding: 0.6rem 1rem;
  --fill: var(--raise);
  transition: background-color 160ms var(--ease), box-shadow 160ms var(--ease);
}

.ghost::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--fill), var(--fg) 24%) 0,
    color-mix(in oklch, var(--fill), var(--fg) 10%) 100%
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.ghost:hover { background-color: color-mix(in oklch, var(--raise), var(--fg) 7%); }
.ghost:active:not(:disabled) { box-shadow: inset 0 2px 5px color-mix(in oklch, var(--raise), black 32%); }

.outline {
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--fg);
  font-weight: 700;
  padding: 0.55rem 1rem;
  transition: background-color 120ms linear, border-color 120ms linear, color 120ms linear;
}

.outline:hover { background-color: var(--program); border-color: var(--program); color: var(--program-fg); }

.press {
  transition: background-color 160ms var(--ease), box-shadow 160ms var(--ease);
}

@media (hover: hover) {
  .press:hover { background-color: color-mix(in oklch, var(--fill), var(--fill-fg) 7%); }
}

.press:active:not(:disabled) {
  background-color: color-mix(in oklch, var(--fill), black 6%);
  box-shadow: inset 0 2px 5px color-mix(in oklch, var(--fill), black 32%);
}
`;

export function page(options: TokenOptions = {}): string {
  return [tokens(options), BASE, FIELDS, CONTROLS, GHOST, edge('.box'), TABLE, PILL].join('\n');
}
