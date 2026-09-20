export interface TokenOptions {
  selector?: string;
  media?: boolean;
}

const DARK = `
  color-scheme: dark;

  --program: oklch(0.583 0.212 258);
  --program-hover: oklch(0.643 0.202 258);
  --program-fg: oklch(1 0 0);
  --program-deep: oklch(0.503 0.212 258);

  --ground: oklch(0.155 0.009 274);
  --raise: oklch(0.273 0.024 254);
  --sink: oklch(0.115 0.008 274);

  --fg: oklch(0.808 0 90);
  --fg-bright: oklch(1 0 0);
  --fg-muted: oklch(0.6 0 90);
  --fg-faint: oklch(0.5 0 90);

  --line: color-mix(in oklch, var(--program), transparent 70%);
  --line-2: color-mix(in oklch, var(--program), transparent 40%);

  --danger: oklch(0.657 0.192 24);
  --danger-fg: oklch(1 0 0);
  --success: oklch(0.74 0.16 150);
  --warn: oklch(0.795 0.159 91);
`;

const LIGHT = `
  color-scheme: light;

  --program-hover: oklch(0.533 0.212 258);

  --ground: oklch(0.975 0.003 274);
  --raise: oklch(1 0 0);
  --sink: oklch(0.935 0.005 274);

  --fg: oklch(0.28 0.01 274);
  --fg-bright: oklch(0.15 0.01 274);
  --fg-muted: oklch(0.45 0.008 274);
  --fg-faint: oklch(0.55 0.008 274);

  --line: color-mix(in oklch, var(--program), transparent 78%);
  --line-2: color-mix(in oklch, var(--program), transparent 55%);
`;

const SHAPE = `
  --fill: var(--raise);
  --fill-fg: var(--fg);

  --r-sm: 0;
  --r-md: 0;
  --r-lg: 0;
  --r-xl: 0;
  --r-pill: 0;

  --font-sans: 'Rajdhani', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'Share Tech Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
`;

export function tokens({ selector = ':root', media = true }: TokenOptions = {}): string {
  const dark = `${selector} {${DARK}${SHAPE}
  color: var(--fg);
  font-family: var(--font-sans);
}`;

  if (!media) return dark;

  return `${dark}

@media (prefers-color-scheme: light) {
  ${selector} {${LIGHT}  }
}`;
}
