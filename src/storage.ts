// Persistent storage. On iOS: real files (Capacitor Filesystem).
//  - Documents/Notebooks/*.ipynb  → visible in the Files app ("On My iPhone › Tuple")
//  - Library/pgnotebook/          → database snapshot and preferences (not shown to the user)
// In a desktop browser (development): IndexedDB.
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const native = Capacitor.isNativePlatform();

// ---------- IndexedDB fallback ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pgnotebook-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('files', mode).objectStore('files'));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}
function base64ToBlob(b64: string, type = 'application/octet-stream'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

type Area = 'docs' | 'lib';
const dir = (a: Area) => (a === 'docs' ? Directory.Documents : Directory.Library);
const prefix = (a: Area) => (a === 'docs' ? '' : 'pgnotebook/');

export async function writeText(area: Area, path: string, text: string): Promise<void> {
  if (!native) return void (await idbOp('readwrite', (s) => s.put(text, `${area}:${path}`)));
  await Filesystem.writeFile({ directory: dir(area), path: prefix(area) + path, data: text, encoding: Encoding.UTF8, recursive: true });
}

export async function readText(area: Area, path: string): Promise<string | null> {
  if (!native) return (await idbOp<string | undefined>('readonly', (s) => s.get(`${area}:${path}`))) ?? null;
  try {
    const r = await Filesystem.readFile({ directory: dir(area), path: prefix(area) + path, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await (r.data as Blob).text();
  } catch {
    return null;
  }
}

export async function writeBlob(area: Area, path: string, blob: Blob): Promise<void> {
  if (!native) return void (await idbOp('readwrite', (s) => s.put(blob, `${area}:${path}`)));
  const tmp = prefix(area) + path + '.tmp';
  await Filesystem.writeFile({ directory: dir(area), path: tmp, data: await blobToBase64(blob), recursive: true });
  await Filesystem.rename({ directory: dir(area), from: tmp, to: prefix(area) + path, toDirectory: dir(area) });
}

export async function readBlob(area: Area, path: string): Promise<Blob | null> {
  if (!native) return (await idbOp<Blob | undefined>('readonly', (s) => s.get(`${area}:${path}`))) ?? null;
  try {
    const r = await Filesystem.readFile({ directory: dir(area), path: prefix(area) + path });
    return typeof r.data === 'string' ? base64ToBlob(r.data) : (r.data as Blob);
  } catch {
    return null;
  }
}

export async function remove(area: Area, path: string): Promise<void> {
  if (!native) return void (await idbOp('readwrite', (s) => s.delete(`${area}:${path}`)));
  await Filesystem.deleteFile({ directory: dir(area), path: prefix(area) + path }).catch(() => {});
}

export async function list(area: Area, folder: string): Promise<string[]> {
  if (!native) {
    const keys = await idbOp<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    const p = `${area}:${folder}/`;
    return keys.map(String).filter((k) => k.startsWith(p) && !k.slice(p.length).includes('/')).map((k) => k.slice(p.length));
  }
  try {
    const r = await Filesystem.readdir({ directory: dir(area), path: prefix(area) + folder });
    return r.files.filter((f) => f.type === 'file').map((f) => f.name);
  } catch {
    return [];
  }
}

export { blobToBase64 };
