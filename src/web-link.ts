const WEB_PROTOCOLS = new Set(["http:", "https:"]);

export function webUrlFromHref(href: string): string | null {
  const value = href.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return WEB_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
