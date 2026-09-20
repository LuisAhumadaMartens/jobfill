export function edge(selector: string): string {
  return `${selector} {
  position: relative;
  background-color: var(--fill);
  border: 1px solid var(--line);
  border-radius: 0;
}`;
}

export const HUD = `
.hud {
  position: relative;
}

.hud::before,
.hud::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border: 1px solid var(--program);
  opacity: 0.7;
  pointer-events: none;
  transition: width 240ms var(--ease), height 240ms var(--ease), opacity 240ms var(--ease);
}

.hud::before { top: -1px; left: -1px; border-right: 0; border-bottom: 0; }
.hud::after { bottom: -1px; right: -1px; border-left: 0; border-top: 0; }

.hud:hover::before,
.hud:hover::after {
  width: calc(100% + 2px);
  height: calc(100% + 2px);
  opacity: 1;
}
`;

export const TABLE = `
table { width: 100%; border-collapse: collapse; font-size: 14px; }

th {
  text-align: left;
  color: var(--program);
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-2);
  font-weight: 400;
}

td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.num { text-align: right; font-variant-numeric: tabular-nums; color: var(--fg-muted); white-space: nowrap; }
tbody tr:hover { background: color-mix(in oklch, var(--program), transparent 96%); }
`;

export const PILL = `
.pill {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: color-mix(in oklch, var(--program), transparent 88%);
  border: 1px solid var(--line);
  color: var(--program);
  padding: 2px 8px;
  white-space: nowrap;
}

.meta {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-faint);
}
`;
