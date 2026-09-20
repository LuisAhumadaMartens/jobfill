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

  --ground: oklch(0.145 0.008 265);
  --raise: oklch(0.19 0.01 265);
  --sink: oklch(0.115 0.008 265);

  --fg: oklch(0.97 0.004 265);
  --fg-muted: oklch(0.72 0.012 265);
  --fg-faint: oklch(0.64 0.012 265);

  --line: oklch(1 0 0 / 0.08);
  --line-2: oklch(1 0 0 / 0.16);

  --danger: oklch(0.64 0.21 25);
  --danger-fg: oklch(1 0 0);
  --success: oklch(0.74 0.16 150);
  --warn: oklch(0.79 0.15 75);
`;

const LIGHT = `
  color-scheme: light;

  --program: oklch(0.583 0.212 258);
  --program-hover: oklch(0.533 0.212 258);
  --program-fg: oklch(1 0 0);
  --program-deep: oklch(0.473 0.205 258);

  --ground: oklch(0.965 0.004 265);
  --raise: oklch(1 0 0);
  --sink: oklch(0.925 0.006 265);

  --fg: oklch(0.22 0.01 265);
  --fg-muted: oklch(0.44 0.012 265);
  --fg-faint: oklch(0.5 0.012 265);

  --line: oklch(0 0 0 / 0.1);
  --line-2: oklch(0 0 0 / 0.18);

  --warn: oklch(0.58 0.15 70);
`;

const SHAPE = `
  --fill: var(--raise);
  --fill-fg: var(--fg);

  --r-sm: 0.5rem;
  --r-md: 0.75rem;
  --r-lg: 1rem;
  --r-xl: 1.25rem;
  --r-pill: 9999px;
  --r-border: 1px;
  --r-gap: 0.25rem;
  --r-row: calc(var(--r-lg) - var(--r-border) - var(--r-gap));

  --font-sans: 'Lato', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
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
