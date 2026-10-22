import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { validateDictionaries } from './validate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'src/inventory.json'), 'utf8'));
const dictDir = path.join(root, 'src/dict');
const files = fs.existsSync(dictDir) ? fs.readdirSync(dictDir).filter((f) => f.endsWith('.ru.json')) : [];

const dicts = {};
for (const f of files) dicts[f.replace(/\.ru\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8'));

const errors = validateDictionaries(inventory, dicts);

const clientPath = path.join(root, 'lib/client.js');
if (!fs.existsSync(clientPath)) errors.push('lib/client.js is missing — run build.mjs');
else {
  const code = fs.readFileSync(clientPath, 'utf8');
  try {
    new vm.Script(code, { filename: 'lib/client.js' });
  } catch (e) {
    errors.push(`lib/client.js syntax error: ${e.message}`);
  }
}

if (errors.length) {
  console.error('VERIFY FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

const totalNs = Object.keys(inventory).length;
const totalKeys = Object.values(inventory).reduce((n, v) => n + Object.keys(v.en).length, 0);
const doneNs = Object.keys(dicts).length;
const doneKeys = Object.values(dicts).reduce((n, d) => n + Object.keys(d).length, 0);
console.log('VERIFY OK');
console.log(`namespaces: ${doneNs}/${totalNs}, keys: ${doneKeys}/${totalKeys} (${Math.round((doneKeys / totalKeys) * 100)}%)`);
const missingNs = Object.keys(inventory).filter((ns) => !(ns in dicts));
if (missingNs.length) console.log('not yet translated:', missingNs.join(', '));
