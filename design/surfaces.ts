export function edge(selector: string): string {
  return `${selector} {
  position: relative;
  background-color: var(--fill);
  border: 0;
  border-radius: var(--r-box, var(--r-lg));
}

${selector}::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--fill), var(--fill-fg) 24%) 0,
    color-mix(in oklch, var(--fill), var(--fill-fg) 10%) 1.25rem,
    color-mix(in oklch, var(--fill), var(--fill-fg) 10%) 100%
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
}

@supports not ((mask-composite: exclude) or (-webkit-mask-composite: xor)) {
  ${selector}::before { display: none; }
  ${selector} { box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--fill), var(--fill-fg) 12%); }
}`;
}

export const TABLE = `
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th {
  text-align: left;
  color: var(--fg-faint);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 12px 10px;
  font-weight: 700;
}
td { padding: 12px; border-top: 1px solid var(--line); vertical-align: top; }
td.num { text-align: right; font-variant-numeric: tabular-nums; color: var(--fg-muted); white-space: nowrap; }
`;

export const PILL = `
.pill {
  display: inline-block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: color-mix(in oklch, var(--program), transparent 82%);
  color: var(--program);
  padding: 3px 9px;
  border-radius: var(--r-pill);
  font-weight: 700;
  white-space: nowrap;
}
`;
