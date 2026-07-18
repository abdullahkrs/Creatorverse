import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { decodeRequestPath, resolveAssetPath } from '../server-path.js';

test('rejects malformed percent-encoded request paths without throwing', () => {
  assert.equal(decodeRequestPath('/%'), null);
  assert.equal(decodeRequestPath('/%E0%A4%A'), null);
});

test('resolves valid assets and falls back to the SPA entry point safely', () => {
  const root = mkdtempSync(join(tmpdir(), 'creatorverse-path-'));
  const indexPath = join(root, 'index.html');
  const assetPath = join(root, 'hello world.js');

  writeFileSync(indexPath, '<!doctype html>');
  writeFileSync(assetPath, 'export default true;');

  assert.equal(resolveAssetPath(root, '/hello%20world.js?cache=1'), assetPath);
  assert.equal(resolveAssetPath(root, '/missing-route'), indexPath);
  assert.equal(resolveAssetPath(root, '/../outside.txt'), indexPath);
  assert.equal(resolveAssetPath(root, '/%'), null);
});
