import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

export function decodeRequestPath(urlPath) {
  const rawPath = String(urlPath || '/').split('?')[0];

  try {
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

export function resolveAssetPath(root, urlPath) {
  const decodedPath = decodeRequestPath(urlPath);
  if (decodedPath === null) return null;

  const requestedPath = normalize(decodedPath).replace(/^[/\\]+/, '');
  const candidate = resolve(root, requestedPath);
  const relativePath = relative(root, candidate);
  const staysInsideRoot = relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));

  if (staysInsideRoot && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return join(root, 'index.html');
}
