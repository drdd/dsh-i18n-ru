// Minimal ASAR reader (format: [u32=4][u32=headerSize] then at +8: [u32][u32=jsonLen] json..)
import fs from 'node:fs';

export function openAsar(path) {
  const fd = fs.openSync(path, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, 0);
  const headerSize = sizeBuf.readUInt32LE(4);
  const headerBuf = Buffer.alloc(headerSize);
  fs.readSync(fd, headerBuf, 0, headerSize, 8);
  const jsonLen = headerBuf.readUInt32LE(4);
  const json = headerBuf.toString('utf8', 8, 8 + jsonLen);
  const header = JSON.parse(json);
  const dataStart = headerSize + 8;
  return { fd, header, dataStart, headerSize };
}

export function flatten(node, prefix = '', out = {}) {
  const files = node.files || {};
  for (const [name, entry] of Object.entries(files)) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (entry.files) flatten(entry, p, out);
    else out[p] = entry;
  }
  return out;
}

export function readEntry(fd, dataStart, entry) {
  if (entry.unpacked) return null; // lives in app.asar.unpacked
  const offset = Number(entry.offset);
  const size = entry.size;
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, dataStart + offset);
  return buf;
}

// CLI: node asar.mjs <archive> probe|ls [pattern] | cat <path>
const [,, archive, cmd, ...rest] = process.argv;
if (archive) {
  const { fd, header, dataStart } = openAsar(archive);
  const map = flatten(header);
  const keys = Object.keys(map);
  if (cmd === 'probe') {
    console.log('total entries:', keys.length);
    console.log('top-level:', Object.keys(header.files || {}).join(', '));
    const withClient = keys.filter((k) => /\/lib\/client\.js$/.test(k) && /dsh-client-|experimental-client/.test(k));
    console.log('client bundles:', withClient.length);
    console.log(withClient.slice(0, 5).join('\n'));
  } else if (cmd === 'ls') {
    const re = rest[0] ? new RegExp(rest[0]) : /.*/;
    for (const k of keys) if (re.test(k)) console.log(k, map[k].size, map[k].unpacked ? 'UNPACKED' : '');
  } else if (cmd === 'cat') {
    const e = map[rest[0]];
    if (!e) { console.error('not found:', rest[0]); process.exit(1); }
    const b = readEntry(fd, dataStart, e);
    if (!b) { console.error('unpacked, read from app.asar.unpacked'); process.exit(2); }
    process.stdout.write(b);
  }
  fs.closeSync(fd);
}
