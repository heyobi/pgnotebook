// Main-thread side of the database: starts the worker, persists snapshots, exposes exec().
import { DEFAULT_EXTENSIONS, EXTENSIONS } from './extensions';
import { readBlob, readText, remove, writeBlob, writeText } from './storage';

export interface Field { name: string; dataTypeID: number }
export interface ResultSet { fields: Field[]; rows: unknown[][]; rowCount: number; affectedRows: number }
export interface ExecOk { ms: number; notices: { severity: string; message: string }[]; results: ResultSet[] }
export interface PgError { message: string; detail?: string; hint?: string; position?: string; code?: string }

const SNAPSHOT = 'main.tar.gz';
const PREFS = 'prefs.json';

interface Prefs { extensions: string[] }

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let prefs: Prefs = { extensions: [...DEFAULT_EXTENSIONS] };
let startPromise: Promise<{ version: string; ms: number }> | null = null;
let dirty = false;
let saveTimer: number | undefined;
const listeners = new Set<(s: EngineState) => void>();

export type EngineState = { status: 'starting' | 'ready' | 'error' | 'saving'; version?: string; error?: string };
let state: EngineState = { status: 'starting' };
function setState(s: EngineState) {
  state = s;
  listeners.forEach((l) => l(s));
}
export function onState(fn: (s: EngineState) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
export const getState = () => state;

function call<T>(msg: Record<string, unknown>, transfer?: Transferable[]): Promise<T> {
  if (!worker) return Promise.reject(new Error('worker not started'));
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, ...msg }, transfer ?? []);
  });
}

function spawn() {
  worker?.terminate();
  worker = new Worker(new URL('./pg.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(error);
  };
}

export async function loadPrefs(): Promise<Prefs> {
  const raw = await readText('lib', PREFS);
  if (raw) {
    try {
      const p = JSON.parse(raw) as Partial<Prefs>;
      if (Array.isArray(p.extensions)) prefs.extensions = p.extensions.filter((x) => EXTENSIONS.some((e) => e.id === x));
    } catch {}
  }
  return prefs;
}
export const enabledExtensions = () => [...prefs.extensions];

function withDeps(ids: string[]): string[] {
  const s = new Set(ids);
  if (s.has('earthdistance')) s.add('cube');
  return [...s];
}

export function start(): Promise<{ version: string; ms: number }> {
  startPromise = (async () => {
    setState({ status: 'starting' });
    await loadPrefs();
    spawn();
    const dump = await readBlob('lib', SNAPSHOT);
    try {
      const r = await call<{ version: string; ms: number }>({ op: 'init', ext: withDeps(prefs.extensions), dump });
      setState({ status: 'ready', version: r.version });
      return r;
    } catch (e) {
      const err = e as PgError;
      // A snapshot that no longer loads (e.g. an extension was turned off that its data depends on): start empty is NOT
      // done silently — report it so the user can re-enable the extension or reset.
      setState({ status: 'error', error: err.message });
      throw e;
    }
  })();
  return startPromise;
}

export async function ready() {
  if (!startPromise) start();
  return startPromise!;
}

export async function exec(sql: string): Promise<ExecOk> {
  await ready();
  try {
    const r = await call<ExecOk>({ op: 'exec', sql });
    if (/\b(create|insert|update|delete|drop|alter|truncate|copy|grant|revoke|comment|refresh|vacuum|cluster|reindex|select\b[\s\S]*\binto|do|call|import)\b/i.test(sql)) markDirty();
    return r;
  } catch (e) {
    markDirty(); // a failed script may still have committed earlier statements
    throw e;
  }
}

export async function schema(): Promise<Record<string, string[]>> {
  try {
    await ready();
    return await call<Record<string, string[]>>({ op: 'schema' });
  } catch {
    return {};
  }
}

function markDirty() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void save(), 1500);
}

export async function save(): Promise<void> {
  if (!dirty || state.status !== 'ready') return;
  dirty = false;
  try {
    const blob = await call<Blob>({ op: 'dump' });
    await writeBlob('lib', SNAPSHOT, blob);
  } catch (e) {
    dirty = true;
    console.error('snapshot failed', e);
  }
}

export async function exportSnapshot(): Promise<Blob> {
  await ready();
  return call<Blob>({ op: 'dump' });
}

/** Restart Postgres with a new set of extensions; data is kept. */
export async function setExtensions(ids: string[]): Promise<void> {
  dirty = true;
  await save();
  prefs.extensions = ids;
  await writeText('lib', PREFS, JSON.stringify(prefs));
  await start();
}

export async function importSnapshot(blob: Blob): Promise<void> {
  await writeBlob('lib', SNAPSHOT, blob);
  dirty = false;
  await start();
}

export async function resetDatabase(): Promise<void> {
  clearTimeout(saveTimer);
  dirty = false;
  await remove('lib', SNAPSHOT);
  await start();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void save();
});
