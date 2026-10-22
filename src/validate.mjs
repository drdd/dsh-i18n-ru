/** Shared dictionary validation used by build and verify. */
export function validateDictionaries(inventory, dicts) {
  const errors = [];
  for (const [ns, dict] of Object.entries(dicts)) {
    const inv = inventory[ns];
    if (!inv) {
      errors.push(`unknown namespace "${ns}"`);
      continue;
    }
    const enKeys = Object.keys(inv.en);
    const ruKeys = Object.keys(dict);
    const missing = enKeys.filter((k) => !(k in dict));
    const extra = ruKeys.filter((k) => !(k in inv.en));
    if (missing.length) errors.push(`${ns}: missing ${missing.length} keys: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`);
    if (extra.length) errors.push(`${ns}: extra ${extra.length} keys: ${extra.slice(0, 6).join(', ')}`);
    for (const k of ruKeys) {
      const v = dict[k];
      if (typeof v !== 'string') {
        errors.push(`${ns}/${k}: non-string`);
        continue;
      }
      // An empty source string (a deliberate no-op separator) may stay empty.
      if (v.trim() === '' && String(inv.en[k] ?? '').trim() !== '') {
        errors.push(`${ns}/${k}: empty`);
        continue;
      }
      const src = String(inv.en[k] ?? '');
      const a = [...src.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const b = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (a.join('|') !== b.join('|')) errors.push(`${ns}/${k}: placeholders differ: en{${a.join(',')}} ru{${b.join(',')}}`);
    }
  }
  return errors;
}
