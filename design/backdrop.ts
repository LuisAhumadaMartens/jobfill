export const LAYOUT = `
main {
  max-width: 960px;
  margin: 0 auto;
  padding: 44px 22px 90px;
}

h1 {
  font-size: 34px;
  margin: 0 0 14px;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}

h2 {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 18px;
  font-weight: 700;
  color: var(--fg-bright);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 52px 0 20px;
}

h2::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--program);
  rotate: 45deg;
  flex: none;
}

h2::after {
  content: '';
  height: 1px;
  background: color-mix(in oklch, var(--fg), transparent 90%);
  flex: 1 1 16px;
}

h3 { font-size: 17px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.02em; }

p { color: var(--fg); line-height: 1.65; max-width: 66ch; margin: 0 0 14px; }
.lede { font-size: 18px; color: var(--fg-muted); max-width: 62ch; }
.note { color: var(--fg-faint); font-size: 13px; max-width: 66ch; }

code {
  font-family: var(--font-mono);
  background: var(--sink);
  border: 1px solid var(--line);
  padding: 1px 6px;
  font-size: 0.92em;
}

footer {
  margin-top: 56px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  color: var(--fg-faint);
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.empty {
  max-width: none;
  border: 1px solid var(--line);
  padding: 32px;
  text-align: center;
  color: var(--fg-faint);
  font-family: var(--font-mono);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
`;

export const BACKDROP = `
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background-image: radial-gradient(var(--raise) 1.5px, transparent 0);
  background-size: 20px 20px;
}

body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(circle at center, transparent 0%, var(--ground) 120%);
}

html::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  opacity: 0.5;
  background: linear-gradient(to bottom, transparent 50%, oklch(0 0 0 / 0.1) 50%);
  background-size: 100% 4px;
}

@media (prefers-reduced-motion: reduce) {
  html::after { display: none; }
}

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--ground); }
::-webkit-scrollbar-thumb { background: var(--raise); border: 1px solid var(--program); }
::-webkit-scrollbar-thumb:hover { background: var(--program); }
`;

export const SECTION = `
.section {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 52px 0 20px;
}

.section::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--program);
  rotate: 45deg;
  flex: none;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--fg-bright);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.section::after {
  content: '';
  height: 1px;
  background: color-mix(in oklch, var(--fg), transparent 90%);
  flex: 1 1 16px;
}
`;

export const SKEW = `
.skew {
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in oklch, var(--fg), transparent 80%);
  color: var(--fg-bright);
  background: transparent;
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 10px 20px;
  text-decoration: none;
  transform: skewX(-10deg);
  transition: border-color 160ms var(--ease), color 160ms var(--ease), background-color 160ms var(--ease);
}

.skew > * {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  transform: skewX(10deg);
}

.skew:hover { border-color: var(--program); color: var(--program); }

.skew.on {
  border-color: var(--program);
  background: var(--program);
  color: var(--program-fg);
}

.skew.on:hover { background: var(--program-hover); border-color: var(--program-hover); color: var(--program-fg); }
`;
