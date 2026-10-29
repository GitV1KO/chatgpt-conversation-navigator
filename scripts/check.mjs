import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root,'extension');
const manifest = JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.permissions,undefined,'No extra API permissions are needed.');
assert.equal(manifest.host_permissions,undefined,'Static matches are sufficient.');
assert.equal(manifest.background,undefined,'No background worker is needed.');
assert.deepEqual(manifest.content_scripts[0].matches,['https://chatgpt.com/*','https://chat.openai.com/*']);
for (const script of manifest.content_scripts[0].js) {
  const source = await fs.readFile(path.join(extension,script),'utf8');
  new Script(source,{filename:script});
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b|document\.cookie|chrome\.(?:cookies|storage)/,`Privacy contract: ${script}`);
}
for (const [size,file] of Object.entries(manifest.icons)) {
  const png = await fs.readFile(path.join(extension,file));
  assert.equal(png.readUInt32BE(16),Number(size));assert.equal(png.readUInt32BE(20),Number(size));
}
console.log('PASS: Manifest, all scripts, packaged resources, minimal permissions and static privacy checks.');
