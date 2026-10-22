import fs from 'node:fs';
import path from 'node:path';
import { validateDictionaries } from './validate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'src/inventory.json'), 'utf8'));
const dictDir = path.join(root, 'src/dict');
const files = fs.existsSync(dictDir) ? fs.readdirSync(dictDir).filter((f) => f.endsWith('.ru.json')) : [];

const dicts = {};
for (const f of files) {
  const ns = f.replace(/\.ru\.json$/, '');
  dicts[ns] = JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8'));
}

const errors = validateDictionaries(inventory, dicts);
if (errors.length) {
  console.error('BUILD FAILED: dictionary validation');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

const out = `window.__ModuleLoader__.load({
\tid: "dsh-i18n-ru",
\tfactory: () => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tconst DICT_RU = ${JSON.stringify(dicts, null, 2)};
\t\tconst inject = ["locale"];
\t\tfunction apply(ctx) {
\t\t\tctx.effect(() => {
\t\t\t\tlet offLang = () => {};
\t\t\t\ttry {
\t\t\t\t\toffLang = ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" });
\t\t\t\t} catch (error) {
\t\t\t\t\tif (!/already registered/.test(String(error && error.message))) throw error;
\t\t\t\t}
\t\t\t\tconst offs = [];
\t\t\t\tfor (const [ns, dict] of Object.entries(DICT_RU)) {
\t\t\t\t\ttry {
\t\t\t\t\t\toffs.push(ctx.locale.register(ns, { ru: dict }));
\t\t\t\t\t} catch (error) {
\t\t\t\t\t\tif (!/already/.test(String(error && error.message))) throw error;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\treturn () => {
\t\t\t\t\tfor (const off of offs) off();
\t\t\t\t\toffLang();
\t\t\t\t};
\t\t\t}, "i18n-ru: dictionaries + language");
\t\t}
\t\texports.apply = apply;
\t\texports.inject = inject;
\t\treturn module.exports;
\t}
});
`;

fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib/client.js'), out);

const totalNs = Object.keys(inventory).length;
const totalKeys = Object.values(inventory).reduce((n, v) => n + Object.keys(v.en).length, 0);
const doneNs = Object.keys(dicts).length;
const doneKeys = Object.values(dicts).reduce((n, d) => n + Object.keys(d).length, 0);
console.log(`built lib/client.js`);
console.log(`namespaces: ${doneNs}/${totalNs}, keys: ${doneKeys}/${totalKeys} (${Math.round((doneKeys / totalKeys) * 100)}%)`);
