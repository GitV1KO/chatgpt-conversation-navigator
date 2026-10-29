import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root,'dist');await mkdir(dist,{recursive:true});
const manifest = JSON.parse(await readFile(path.join(root,'extension/manifest.json'),'utf8'));
const out = path.join(dist,`chatgpt-conversation-navigator-${manifest.version}.zip`);
// Explicit allowlist: test fixtures and local browser profiles are never shipped.
const files = ['manifest.json',...(await readdir(path.join(root,'extension/src'))).map(f=>`src/${f}`),...(await readdir(path.join(root,'extension/icons'))).map(f=>`icons/${f}`)];
execFileSync('python3',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED); [z.write(p,p) for p in sys.argv[2:]]',out,...files],{cwd:path.join(root,'extension')});
console.log(out);
const sourceOut = path.join(dist,`chatgpt-conversation-navigator-${manifest.version}-source.zip`);
execFileSync('python3',['-c',`import os,sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as archive:
 for base, dirs, names in os.walk('.'):
  dirs[:] = sorted(d for d in dirs if d not in ('node_modules','dist','.git','__pycache__'))
  for name in sorted(names):
   if name != '.DS_Store' and not name.startswith('failure-'):
    item = os.path.join(base,name)
    archive.write(item,item)
`,sourceOut],{cwd:root});
console.log(sourceOut);
