import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const code = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');

let factory = null;
const sandbox = {};
sandbox.window = { __ModuleLoader__: { load({ id, factory: f }) { factory = f; } } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'lib/client.js' });
if (typeof factory !== 'function') throw new Error('factory not captured');
const mod = factory();

const calls = { lang: [], dicts: [] };
const ctx = {
  effect: (fn) => fn(),
  locale: {
    addLanguage: (input) => { calls.lang.push(input); return () => {}; },
    register: (ns, dict) => { calls.dicts.push([ns, dict]); return () => {}; },
  },
};
if (typeof mod.apply !== 'function') throw new Error('apply missing');
mod.apply(ctx);

if (calls.lang.length !== 1) throw new Error(`addLanguage called ${calls.lang.length} times`);
const lang = calls.lang[0];
if (lang.id !== 'ru' || lang.label !== 'Русский' || lang.fallback !== 'en') {
  throw new Error('bad addLanguage payload: ' + JSON.stringify(lang));
}
if (!calls.dicts.length) throw new Error('no dictionaries registered');
const common = calls.dicts.find(([ns]) => ns === 'common');
if (!common) throw new Error('common namespace not registered');
if (!common[1].ru || !common[1].ru.cancel) throw new Error('common.ru.cancel missing');
if (mod.inject.join(',') !== 'locale') throw new Error('bad inject: ' + JSON.stringify(mod.inject));
console.log('SMOKE OK');
console.log('  addLanguage:', JSON.stringify(lang));
console.log('  dictionaries:', calls.dicts.length, '| common keys:', Object.keys(common[1].ru).length);
