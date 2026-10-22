import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = 'D:/AI/DSH/testwp/work/pkgs';

function deepStub() {
  const fn = function () { return deepStub(); };
  return new Proxy(fn, {
    get(t, p) {
      if (typeof p === 'symbol') {
        if (p === Symbol.iterator) return function* () {};
        if (p === Symbol.toPrimitive) return () => '';
        return undefined;
      }
      if (p === 'then') return undefined;
      if (p === 'toString') return () => '';
      if (p === 'valueOf') return () => 0;
      return deepStub();
    },
    apply() { return deepStub(); },
    construct() { return deepStub(); },
  });
}

const HOST_GLOBALS = ['queueMicrotask', 'TextEncoder', 'TextDecoder',
  'MessageChannel', 'MessagePort', 'structuredClone', 'AbortController', 'AbortSignal', 'EventTarget',
  'Event', 'CustomEvent', 'performance', 'URL', 'URLSearchParams', 'Blob', 'Headers',
  'atob', 'btoa', 'setImmediate', 'clearImmediate'];

function makeSandbox() {
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { language: 'en', languages: ['en'] },
    document: deepStub(),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: '' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    process: { env: { NODE_ENV: 'production' }, platform: 'win32' },
    fetch: () => Promise.resolve(deepStub()),
    crypto: { getRandomValues: (a) => a, randomUUID: () => '00000000-0000-0000-0000-000000000000' },
    TransformStream: class { constructor() { this.readable = deepStub(); this.writable = deepStub(); } },
    ReadableStream: class { constructor() { return deepStub(); } },
    WritableStream: class { constructor() { return deepStub(); } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.__ModuleLoader__ = { load({ id, factory }) { sandbox.__factory = factory; } };
  for (const k of HOST_GLOBALS) if (globalThis[k] !== undefined) sandbox[k] = globalThis[k];
  return sandbox;
}

const REACT_NAMES = ['memo', 'forwardRef', 'createElement', 'cloneElement', 'isValidElement', 'createContext',
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer', 'useContext', 'useLayoutEffect',
  'useSyncExternalStore', 'useTransition', 'useDeferredValue', 'useId', 'useImperativeHandle', 'useDebugValue',
  'startTransition', 'flushSync', 'createRef', 'lazy', 'Suspense', 'Fragment', 'StrictMode', 'Component',
  'PureComponent', 'Children', 'version', 'default', '__esModule'];

function makeReactStub() {
  const target = {};
  for (const n of REACT_NAMES) target[n] = deepStub();
  target.__esModule = true;
  return new Proxy(target, {
    get(t, p) { if (p in t) return t[p]; if (typeof p === 'symbol') return undefined; return deepStub(); },
    ownKeys(t) { return Object.keys(t); },
    getOwnPropertyDescriptor(t, p) { return { enumerable: true, configurable: true, value: t[p] }; },
  });
}

async function extractFromCode(code) {
  const sandbox = makeSandbox();
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: 'bundle.js', timeout: 8000 });
  const factory = sandbox.__factory;
  if (typeof factory !== 'function') throw new Error('factory not captured');
  const requireStub = (spec) => {
    if (spec === 'react') return makeReactStub();
    if (spec === 'react/jsx-runtime' || spec === 'react/jsx-dev-runtime') return makeReactStub();
    return deepStub();
  };
  const mod = factory(requireStub);

  const captures = [];
  const localeStub = {
    register(ns, a, b) {
      if (typeof a === 'string') captures.push({ ns, locale: a, dict: b });
      else captures.push({ ns, dict: a });
      return () => {};
    },
    addLanguage() { return () => {}; },
    bind() { return (k) => k; },
    translate() { return ''; },
  };
  const slots = deepStub();
  let localeRuntime = null;
  const makeCtx = () => new Proxy({}, {
    get(t, p) {
      if (p === 'effect') return (fn) => { try { return fn(); } catch { return undefined; } };
      if (p === 'locale') return localeStub;
      if (p === 'slots') return slots;
      if (p === 'fiber') return { uid: 1 };
      if (p === 'provide') return (name, value) => { if (name === 'locale') localeRuntime = value; };
      if (p === 'on') return () => () => {};
      if (p === 'inject') return (deps, cb) => {
        try { return cb ? cb(makeCtx()) : makeCtx(); } catch { return deepStub(); }
      };
      return deepStub();
    },
  });
  const ctx = makeCtx();

  let applyError = null;
  if (typeof mod.apply === 'function') {
    try {
      const r = mod.apply(ctx);
      if (r && typeof r.then === 'function') {
        await Promise.race([r.catch((e) => { applyError = e; }), new Promise((res) => setTimeout(res, 2000))]);
      }
    } catch (e) { applyError = e; }
  }

  // The locale package registers through its own LocaleRuntime instance; drain it.
  if (localeRuntime && localeRuntime.dicts && typeof localeRuntime.dicts.forEach === 'function') {
    localeRuntime.dicts.forEach((map, ns) => {
      if (map && typeof map.forEach === 'function') map.forEach((dict, loc) => captures.push({ ns, locale: loc, dict }));
    });
  }

  return { captures, applyError };
}

const dirRoot = path.join(ROOT, '@deepseek-ai');
const pkgs = fs.readdirSync(dirRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

const inventory = {};
const report = [];

for (const pkg of pkgs) {
  const file = path.join(dirRoot, pkg, 'lib', 'client.js');
  if (!fs.existsSync(file)) continue;
  try {
    const { captures, applyError } = await extractFromCode(fs.readFileSync(file, 'utf8'));
    let found = 0;
    const nss = [];
    for (const cap of captures) {
      if (!cap.dict) continue;
      const ns = cap.ns;
      if (typeof ns !== 'string' || ns === '[object Object]' || ns.startsWith('function')) continue;
      inventory[ns] ||= { en: {}, zh: {}, packages: [] };
      if (cap.locale) {
        if (cap.dict && typeof cap.dict === 'object') Object.assign(inventory[ns][cap.locale] ||= {}, cap.dict);
      } else {
        if (cap.dict.en) Object.assign(inventory[ns].en, cap.dict.en);
        if (cap.dict.zh) Object.assign(inventory[ns].zh, cap.dict.zh);
      }
      if (!inventory[ns].packages.includes(pkg)) inventory[ns].packages.push(pkg);
      const n = cap.dict.en ? Object.keys(cap.dict.en).length : Object.keys(cap.dict).length;
      found += n;
      nss.push(ns);
    }
    report.push({ pkg, status: found > 0 ? 'ok' : (captures.length ? 'captured-no-en' : (applyError ? 'apply-error' : 'no-register')), ns: nss, keys: found, error: applyError ? String(applyError.message || applyError) : undefined });
  } catch (e) {
    report.push({ pkg, status: 'vm-error', error: String(e && e.message || e) });
  }
}

const totalKeys = Object.values(inventory).reduce((n, v) => n + Object.keys(v.en).length, 0);
fs.writeFileSync('D:/AI/DSH/testwp/work/inventory.json', JSON.stringify(inventory, null, 2));
fs.writeFileSync('D:/AI/DSH/testwp/work/extract-report.json', JSON.stringify(report, null, 2));
console.log('namespaces:', Object.keys(inventory).length);
console.log('total en keys:', totalKeys);
const bad = report.filter((r) => r.status !== 'ok');
console.log('non-ok with client:', bad.length);
for (const b of bad) console.log(' ', b.pkg, '|', b.status, '|', b.error || '');
