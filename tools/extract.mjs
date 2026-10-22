import fs from 'node:fs';
import path from 'node:path';
import { openAsar, flatten, readEntry } from './asar.mjs';

const archive = 'D:/AI/DSH/resources/app.asar';
const outRoot = 'D:/AI/DSH/testwp/work/pkgs';
const { fd, header, dataStart } = openAsar(archive);
const map = flatten(header);

const re = /^dsh\/node_modules\/(@deepseek-ai\/[^/]+)\/(package\.json|lib\/client\.js|lib\/index\.js)$/;
const pkgs = {};
for (const [p, e] of Object.entries(map)) {
  const m = p.match(re);
  if (!m) continue;
  const [, pkg, file] = m;
  (pkgs[pkg] ||= {})[file] = e;
}

const manifest = [];
for (const [pkg, files] of Object.entries(pkgs)) {
  const dir = path.join(outRoot, pkg);
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  for (const [file, e] of Object.entries(files)) {
    const b = readEntry(fd, dataStart, e);
    if (!b) continue;
    fs.writeFileSync(path.join(dir, file), b);
  }
  let pj = null;
  try { pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch {}
  const client = pj?.dsh?.client;
  if (client) manifest.push({ pkg, name: pj.name, version: pj.version, client, hasIndex: !!files['lib/index.js'] });
}

fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('packages total:', Object.keys(pkgs).length);
console.log('with dsh.client:', manifest.length);
for (const m of manifest) console.log(m.pkg, '|', m.client.platform, '| inject=', (m.client.inject||[]).join(','), '| immediately=', m.client.immediately);
fs.closeSync(fd);
