// Databases and the PostgreSQL worker. Each database has its own PostgreSQL major version, its own set of loaded
// extensions and its own snapshot file (gzip tar of PGDATA). One database runs at a time.
import { EXTENSIONS, withDeps, type PgVersion } from './extensions';
import { readBlob, readText, remove, writeBlob, writeText } from './storage';
import { uid } from './notebook';

export interface Field { name: string; dataTypeID: number; type: string }
export interface ResultSet { fields: Field[]; rows: unknown[][]; rowCount: number; affectedRows: number }
export interface ExecOk { ms: number; notices: { severity: string; message: string }[]; results: ResultSet[] }
export interface PgError { message: string; detail?: string; hint?: string; position?: string; code?: string }
export interface Database { id: string; name: string; version: PgVersion; extensions: string[]; created: number }
export interface Meta { schema: Record<string, string[]>; functions: string[]; installed: { name: string; version: string }[] }

const STATE_FILE = 'databases.json';
const snap = (id: string) => `db/${id}.tar.gz`;

let worker: Worker | null = null;
let workerVersion: PgVersion | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let dbs: Database[] = [];
let activeId = '';
let startPromise: Promise<void> | null = null;
let dirty = false;
let saveTimer: number | undefined;
let meta: Meta = { schema: {}, functions: [], installed: [] };
// Latest snapshot per database kept in memory, so a restart (extension install, switch) never depends on the file
// write having succeeded.
const memSnap = new Map<string, Blob>();

export type EngineState = { status: 'starting' | 'ready' | 'error'; version?: string; error?: string; db?: Database };
let state: EngineState = { status: 'starting' };
const listeners = new Set<(s: EngineState) => void>();
function setState(s: Partial<EngineState>) {
  state = { ...state, ...s, db: active() };
  listeners.forEach((l) => l(state));
}
export function onState(fn: (s: EngineState) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
export const getState = () => state;
const metaListeners = new Set<(m: Meta) => void>();
export const onMeta = (fn: (m: Meta) => void) => (metaListeners.add(fn), () => metaListeners.delete(fn));
export const getMeta = () => meta;

export const databases = () => dbs;
export const active = () => dbs.find((d) => d.id === activeId);

// ---------- persistence of the database list ----------
async function loadState() {
  const raw = await readText('lib', STATE_FILE);
  if (raw) {
    try {
      const j = JSON.parse(raw);
      dbs = j.dbs ?? [];
      activeId = j.active ?? '';
    } catch {
      dbs = [];
    }
  }
  if (!dbs.length) {
    // First run, or migration from 1.0 (one database in main.tar.gz with prefs.json).
    let extensions: string[] = [];
    const prefs = await readText('lib', 'prefs.json');
    if (prefs) try { extensions = JSON.parse(prefs).extensions ?? []; } catch { /* ignore */ }
    const db: Database = { id: 'main', name: 'main', version: 18, extensions, created: Date.now() };
    const old = await readBlob('lib', 'main.tar.gz');
    if (old && old.size) await writeBlob('lib', snap(db.id), old);
    dbs = [db];
    activeId = db.id;
    await saveState();
  }
  if (!dbs.some((d) => d.id === activeId)) activeId = dbs[0].id;
}
const saveState = () => writeText('lib', STATE_FILE, JSON.stringify({ dbs, active: activeId }));

// ---------- worker ----------
function workerFor(v: PgVersion): Worker {
  // Literal URLs so Vite bundles each worker.
  if (v === 16) return new Worker(new URL('./pg16.worker.ts', import.meta.url), { type: 'module' });
  if (v === 17) return new Worker(new URL('./pg17.worker.ts', import.meta.url), { type: 'module' });
  return new Worker(new URL('./pg18.worker.ts', import.meta.url), { type: 'module' });
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  if (!worker) return Promise.reject(new Error('worker not started'));
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, ...msg });
  });
}

function spawn(v: PgVersion) {
  worker?.terminate();
  for (const p of pending.values()) p.reject({ message: 'PostgreSQL restarted' });
  pending.clear();
  worker = workerFor(v);
  workerVersion = v;
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(error);
  };
}

async function boot(): Promise<void> {
  setState({ status: 'starting', error: undefined });
  if (!dbs.length) await loadState();
  const db = active()!;
  if (workerVersion !== db.version || !worker) spawn(db.version);
  const dump = memSnap.get(db.id) ?? (await readBlob('lib', snap(db.id)));
  try {
    const r = await call<{ version: string }>({ op: 'init', ext: withDeps(db.extensions), dump });
    setState({ status: 'ready', version: r.version });
    void refreshMeta();
  } catch (e) {
    setState({ status: 'error', error: (e as PgError).message });
    throw e;
  }
}

export function start(): Promise<void> {
  startPromise = boot();
  return startPromise;
}

export async function ready() {
  if (!startPromise) start();
  return startPromise!;
}

export async function refreshMeta(): Promise<Meta> {
  try {
    meta = await call<Meta>({ op: 'meta' });
    metaListeners.forEach((l) => l(meta));
  } catch { /* not running */ }
  return meta;
}

const WRITES = /\b(create|insert|update|delete|drop|alter|truncate|copy|grant|revoke|comment|refresh|vacuum|cluster|reindex|into|do|call|import|select\s+create_graph|cypher|pgmq|setval|nextval)\b/i;

export async function exec(sql: string): Promise<ExecOk> {
  await ready();
  try {
    const r = await call<ExecOk>({ op: 'exec', sql });
    if (WRITES.test(sql)) markDirty();
    if (/\b(create|drop|alter)\b/i.test(sql)) void refreshMeta();
    return r;
  } catch (e) {
    markDirty();
    throw e;
  }
}

function markDirty() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void save(), 1200);
}

export async function save(): Promise<void> {
  if (!dirty || state.status !== 'ready') return;
  dirty = false;
  const db = active();
  if (!db) return;
  try {
    const blob = await call<Blob>({ op: 'dump' });
    memSnap.set(db.id, blob);
    await writeBlob('lib', snap(db.id), blob);
  } catch (e) {
    dirty = true;
    console.error('snapshot failed', e);
  }
}

export async function exportSnapshot(): Promise<Blob> {
  await ready();
  return call<Blob>({ op: 'dump' });
}

// ---------- extensions ----------
export const isLoaded = (id: string) => !!active()?.extensions.includes(id);
export const isInstalled = (id: string) => meta.installed.some((x) => EXTENSIONS.find((e) => e.id === id)?.sql.includes(x.name));

/** Load an extension into the running database (restart, data kept) and run CREATE EXTENSION. */
export async function installExtension(id: string): Promise<void> {
  const db = active()!;
  const ext = EXTENSIONS.find((e) => e.id === id)!;
  const needed = withDeps([id]).filter((x) => !db.extensions.includes(x));
  if (needed.length) {
    dirty = true;
    await save();
    db.extensions = [...db.extensions, ...needed];
    await saveState();
    await start();
  }
  for (const dep of ext.requires ?? []) await exec(`CREATE EXTENSION IF NOT EXISTS "${EXTENSIONS.find((e) => e.id === dep)!.sql[0]}" CASCADE;`);
  await exec(`CREATE EXTENSION IF NOT EXISTS "${ext.sql[0]}" CASCADE;`);
  await refreshMeta();
}

/** DROP EXTENSION and stop loading it. */
export async function removeExtension(id: string): Promise<void> {
  const db = active()!;
  const ext = EXTENSIONS.find((e) => e.id === id)!;
  await exec(`DROP EXTENSION IF EXISTS "${ext.sql[0]}" CASCADE;`);
  dirty = true;
  await save();
  db.extensions = db.extensions.filter((x) => x !== id);
  await saveState();
  await start();
}

/** Make sure extensions referenced by CREATE EXTENSION are loaded (used by notebooks / terminal). */
export async function loadExtensions(ids: string[]): Promise<void> {
  const db = active()!;
  const needed = withDeps(ids).filter((x) => !db.extensions.includes(x));
  if (!needed.length) return;
  dirty = true;
  await save();
  db.extensions = [...db.extensions, ...needed];
  await saveState();
  await start();
}

// ---------- databases ----------
export async function createDatabase(name: string, version: PgVersion): Promise<Database> {
  const db: Database = { id: uid(), name, version, extensions: [], created: Date.now() };
  dbs.push(db);
  await saveState();
  return db;
}

export async function switchDatabase(id: string): Promise<void> {
  if (id === activeId) return;
  dirty = true;
  await save();
  activeId = id;
  meta = { schema: {}, functions: [], installed: [] };
  await saveState();
  await start();
}

export async function renameDatabase(id: string, name: string) {
  const db = dbs.find((d) => d.id === id);
  if (db) { db.name = name; await saveState(); setState({}); }
}

export async function deleteDatabase(id: string): Promise<void> {
  if (dbs.length === 1) throw new Error('Keep at least one database');
  dbs = dbs.filter((d) => d.id !== id);
  memSnap.delete(id);
  await remove('lib', snap(id));
  if (activeId === id) {
    activeId = dbs[0].id;
    await saveState();
    await start();
  } else await saveState();
}

export async function importSnapshot(blob: Blob): Promise<void> {
  const db = active()!;
  memSnap.set(db.id, blob);
  await writeBlob('lib', snap(db.id), blob);
  dirty = false;
  await start();
}

export async function resetDatabase(): Promise<void> {
  clearTimeout(saveTimer);
  dirty = false;
  const db = active()!;
  memSnap.delete(db.id);
  await remove('lib', snap(db.id));
  db.extensions = [];
  await saveState();
  await start();
}

export async function sizeOf(id: string): Promise<number> {
  const b = await readBlob('lib', snap(id));
  return b?.size ?? 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void save();
});
