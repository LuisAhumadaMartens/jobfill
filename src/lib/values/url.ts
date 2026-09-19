export function canonicalUrl(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    const query = url.search.replace(/[?&](utm_[^=]+|trk|originalSubdomain)=[^&]*/g, '').replace(/^&/, '?');
    return host + path + (query === '?' ? '' : query);
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export function isSameUrl(a: string, b: string): boolean {
  const left = canonicalUrl(a);
  const right = canonicalUrl(b);
  return !!left && left === right;
}

export function looksLikeUrl(value: string): boolean {
  const raw = String(value ?? '').trim();
  if (!raw || /\s/.test(raw)) return false;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+\//.test(raw) || /^[\w-]+(\.[\w-]+){1,}$/.test(raw);
}
