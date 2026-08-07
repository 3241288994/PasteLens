const WEB_OR_UNSAFE_SCHEME = /^(?:https?|mailto|tel|data|javascript|blob):/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;
const FILE_NAME_WITH_EXTENSION = /(?:^|[\\/])[^\\/]+\.[a-z0-9]{1,12}(?:[:#?].*)?$/i;

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pathFromFileUrl(value: string): string | null {
  try {
    const url = new URL(value);
    let path = decodePath(url.pathname);
    if (url.hostname && url.hostname !== "localhost") {
      path = `//${url.hostname}${path}`;
    }
    if (/^\/[a-z]:\//i.test(path)) {
      path = path.slice(1);
    }
    return path || null;
  } catch {
    return null;
  }
}

export function filePathFromHref(href: string): string | null {
  const value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("//") || WEB_OR_UNSAFE_SCHEME.test(value)) {
    return null;
  }

  if (/^file:\/\//i.test(value)) {
    return pathFromFileUrl(value);
  }

  if (/^vscode:\/\/file\//i.test(value)) {
    return pathFromFileUrl(value.replace(/^vscode:\/\/file/i, "file://"));
  }

  if (/^sandbox:/i.test(value)) {
    const sandboxPath = decodePath(value.slice("sandbox:".length));
    return sandboxPath || null;
  }

  if (WINDOWS_ABSOLUTE_PATH.test(value)) {
    return decodePath(value);
  }

  if (ANY_SCHEME.test(value)) {
    return null;
  }

  const pathPart = value.split(/[?#]/, 1)[0] ?? value;
  const looksLikePath =
    pathPart.startsWith("/") ||
    pathPart.startsWith("./") ||
    pathPart.startsWith("../") ||
    pathPart.startsWith("~/") ||
    pathPart.includes("/") ||
    pathPart.includes("\\") ||
    FILE_NAME_WITH_EXTENSION.test(value);

  return looksLikePath ? decodePath(value) : null;
}
