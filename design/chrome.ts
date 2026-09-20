export const MARK = `<svg class="mark" viewBox="0 0 1 1" fill="none" stroke="currentColor" stroke-width="0.115" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M0.25 0.52 L0.42 0.69 L0.76 0.31"/></svg>`;

export const SHELL = `
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 40;
  background: color-mix(in oklch, var(--ground), transparent 20%);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid color-mix(in oklch, var(--fg), transparent 90%);
}

.site-header .inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 22px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  text-decoration: none;
  color: var(--fg-bright);
  transition: color 400ms var(--ease);
}

.brand:hover { color: var(--program); }
.brand .mark { width: 26px; height: 26px; flex: none; }

.brand span {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.site-nav { display: flex; align-items: baseline; gap: 26px; }

.site-nav a {
  position: relative;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-muted);
  padding-bottom: 4px;
  transition: color 160ms var(--ease);
}

.site-nav a:hover { color: var(--program); }

.site-nav a::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--program);
  transition: width 300ms var(--ease);
}

.site-nav a:hover::after { width: 100%; }

.site-footer {
  position: relative;
  margin-top: 72px;
  border-top: 1px solid color-mix(in oklch, var(--fg), transparent 90%);
  background: color-mix(in oklch, var(--ground), transparent 10%);
}

.site-footer .inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 22px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
}

.site-footer p {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-faint);
}

.site-footer .links { display: flex; gap: 16px; align-items: center; }

.site-footer .links a {
  color: var(--fg-faint);
  display: inline-flex;
  transition: color 160ms var(--ease);
}

.site-footer .links a:hover { color: var(--program); }
.site-footer .links svg { width: 17px; height: 17px; }

.site-footer::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  opacity: 0.5;
  background: linear-gradient(to right, var(--ground), var(--program), var(--ground));
}

body { padding-top: 72px; }
`;

export interface Link {
  href: string;
  label: string;
}

export function header(links: Link[], home = '/'): string {
  return `<header class="site-header">
  <div class="inner">
    <a class="brand" href="${home}">${MARK}<span>JobFill</span></a>
    <nav class="site-nav">
      ${links.map((link) => `<a href="${link.href}">${link.label}</a>`).join('\n      ')}
    </nav>
  </div>
</header>`;
}

export function footer(marks: string[]): string {
  return `<footer class="site-footer">
  <div class="inner">
    <p>&copy; ${new Date().getFullYear()} Luis Ahumada.</p>
    <div class="links">${marks.join('')}</div>
  </div>
</footer>`;
}
