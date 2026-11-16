import './style.css';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import * as engine from './engine';
import type { ExecOk, PgError, ResultSet } from './engine';
import { EXTENSIONS, createdExtensions, extForSqlName, type ExtGroup } from './extensions';
import {
  deleteNotebook, fromIpynb, fromSql, loadNotebooks, saveNotebook, toIpynb, toSql, uid,
  type Cell, type Notebook,
} from './notebook';
import { SAMPLES, sampleNotebook } from './samples';
import { blobToBase64 } from './storage';

const native = Capacitor.isNativePlatform();
const app = document.getElementById('app')!;
const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

// ---------------- tiny DOM helper ----------------
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
const icon = (name: string) => h('span', { class: `i i-${name}`, 'aria-hidden': 'true' });

function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2600);
}

function sheet(title: string, actions: { label: string; danger?: boolean; run: () => void }[]) {
  const close = () => back.remove();
  const back = h('div', { class: 'sheet-back', onclick: (e: Event) => e.target === back && close() },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-title' }, title),
      actions.map((a) => h('button', { class: `sheet-btn${a.danger ? ' danger' : ''}`, onclick: () => { close(); a.run(); } }, a.label)),
      h('button', { class: 'sheet-btn cancel', onclick: close }, 'Cancel')));
  document.body.append(back);
}

function confirmBox(title: string, body: string, ok: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'sheet-back center' },
      h('div', { class: 'dialog' },
        h('div', { class: 'dialog-title' }, title),
        h('div', { class: 'dialog-body' }, body),
        h('div', { class: 'dialog-actions' },
          h('button', { onclick: () => done(false) }, 'Cancel'),
          h('button', { class: danger ? 'danger' : 'primary', onclick: () => done(true) }, ok))));
    document.body.append(back);
  });
}

// ---------------- export / import ----------------
async function shareFile(name: string, data: Blob | string, mime: string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  if (native) {
    const w = await Filesystem.writeFile({ directory: Directory.Cache, path: name, data: await blobToBase64(blob) });
    await Share.share({ title: name, files: [w.uri] }).catch(() => {});
  } else {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file' }) as HTMLInputElement;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'notebook';

// ---------------- state ----------------
let notebooks: Notebook[] = [];
let schemaCache: Record<string, string[]> = {};
const schemaComp = new Compartment();
const editors = new Set<EditorView>();

async function refreshSchema() {
  schemaCache = await engine.schema();
  for (const v of editors) v.dispatch({ effects: schemaComp.reconfigure(sql({ dialect: PostgreSQL, schema: schemaCache, upperCaseKeywords: true })) });
}

// ---------------- status pill ----------------
function statusPill() {
  const el = h('button', { class: 'pill', onclick: () => go({ name: 'database' }) });
  engine.onState((s) => {
    el.className = `pill ${s.status}`;
    el.textContent = s.status === 'ready' ? 'PostgreSQL 18' : s.status === 'starting' ? 'Starting…' : s.status === 'saving' ? 'Saving…' : 'Error';
  });
  return el;
}

// ---------------- router ----------------
type Route = { name: 'home' } | { name: 'notebook'; id: string } | { name: 'database' };
let route: Route = { name: 'home' };
function go(r: Route) {
  route = r;
  render();
  window.scrollTo(0, 0);
}

function render() {
  for (const v of editors) v.destroy();
  editors.clear();
  hideAccessory();
  app.replaceChildren();
  if (route.name === 'home') app.append(homeView());
  else if (route.name === 'database') app.append(databaseView());
  else {
    const id = route.id;
    const nb = notebooks.find((n) => n.id === id);
    if (nb) app.append(notebookView(nb));
    else go({ name: 'home' });
  }
}

// ---------------- home ----------------
function fmtDate(t: number) {
  const d = new Date(t);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

async function newNotebook(cells?: Cell[], title = 'Untitled notebook') {
  const nb: Notebook = { id: uid(), title, updated: Date.now(), cells: cells ?? [{ id: uid(), type: 'sql', source: '' }] };
  await saveNotebook(nb);
  notebooks.unshift(nb);
  go({ name: 'notebook', id: nb.id });
}

async function importNotebook() {
  const f = await pickFile();
  if (!f) return;
  try {
    const text = await f.text();
    const base = f.name.replace(/\.(ipynb|sql|txt|json)$/i, '');
    const nb = /\.ipynb$|\.json$/i.test(f.name) || text.trimStart().startsWith('{') ? fromIpynb(text, base) : fromSql(text, base);
    nb.id = uid();
    await saveNotebook(nb);
    notebooks.unshift(nb);
    go({ name: 'notebook', id: nb.id });
  } catch (e) {
    toast(`Could not import: ${(e as Error).message}`, 'err');
  }
}

function homeView() {
  const list = h('div', { class: 'list' },
    notebooks.length
      ? notebooks.map((nb) => h('button', { class: 'row', onclick: () => go({ name: 'notebook', id: nb.id }) },
          h('div', { class: 'row-icon' }, icon('doc')),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, nb.title),
            h('div', { class: 'row-sub' }, `${nb.cells.length} cell${nb.cells.length === 1 ? '' : 's'} · ${fmtDate(nb.updated)}`)),
          icon('chevron')))
      : h('div', { class: 'empty' }, 'No notebooks yet. Start with an example below or create a new one.'));

  return h('div', { class: 'page' },
    h('header', { class: 'bar' },
      h('div', { class: 'bar-title big' }, 'Notebooks'),
      statusPill()),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => newNotebook() }, icon('plus'), 'New notebook'),
      h('button', { class: 'btn', onclick: importNotebook }, icon('import'), 'Import')),
    list,
    h('h2', { class: 'section' }, 'Examples'),
    h('div', { class: 'cards' },
      SAMPLES.map((s) => h('button', {
        class: 'card',
        onclick: async () => {
          const missing = (s.needs ?? []).filter((x) => !engine.enabledExtensions().includes(x));
          if (missing.length) {
            const names = missing.map((m) => EXTENSIONS.find((e) => e.id === m)!.title).join(', ');
            if (await confirmBox(`Turn on ${names}?`, 'This example needs an extension that is currently off. PostgreSQL restarts; your data is kept.', 'Turn on')) {
              await engine.setExtensions([...engine.enabledExtensions(), ...missing]);
            }
          }
          const nb = sampleNotebook(s.key, uid());
          await newNotebook(nb.cells, nb.title);
        },
      }, h('div', { class: 'card-title' }, s.title), h('div', { class: 'card-sub' }, s.subtitle)))),
    h('button', { class: 'row db-row', onclick: () => go({ name: 'database' }) },
      h('div', { class: 'row-icon' }, icon('db')),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, 'Database & extensions'),
        h('div', { class: 'row-sub' }, `${engine.enabledExtensions().length} extensions on · backup, restore, reset`)),
      icon('chevron')));
}

// ---------------- database / extensions ----------------
function databaseView() {
  const selected = new Set(engine.enabledExtensions());
  const applyBtn = h('button', { class: 'btn primary hidden', onclick: async () => {
    applyBtn.textContent = 'Restarting…';
    applyBtn.setAttribute('disabled', '');
    try {
      await engine.setExtensions([...selected]);
      toast('PostgreSQL restarted');
    } catch (e) {
      toast((e as PgError).message, 'err');
    }
    render();
  } }, 'Apply & restart');
  const changed = () => {
    const now = engine.enabledExtensions();
    const diff = now.length !== selected.size || now.some((x) => !selected.has(x));
    applyBtn.classList.toggle('hidden', !diff);
  };

  const groups: ExtGroup[] = ['Popular', 'Search & text', 'Data types', 'Indexing', 'Testing & admin'];
  const ver = engine.getState().version?.match(/PostgreSQL [\d.]+/)?.[0] ?? 'PostgreSQL';
  const st = engine.getState();

  return h('div', { class: 'page' },
    h('header', { class: 'bar' },
      h('button', { class: 'back', onclick: () => go({ name: 'home' }) }, icon('back'), 'Notebooks'),
      h('div', { class: 'bar-title' }, 'Database')),
    st.status === 'error' && h('div', { class: 'error-box' },
      h('b', {}, 'PostgreSQL did not start'), h('div', {}, st.error ?? ''),
      h('div', { class: 'muted' }, 'If you turned an extension off that your tables use, turn it back on. Otherwise restore a backup or reset the database.')),
    h('div', { class: 'info' },
      h('div', {}, h('b', {}, ver), ' running on this device (PGlite, WebAssembly).'),
      h('div', { class: 'muted' }, 'Data is saved automatically a moment after each change.')),
    h('div', { class: 'actions wrap' },
      h('button', { class: 'btn', onclick: async () => {
        const blob = await engine.exportSnapshot();
        await shareFile(`pgnotebook-${new Date().toISOString().slice(0, 10)}.tar.gz`, blob, 'application/gzip');
      } }, icon('export'), 'Back up'),
      h('button', { class: 'btn', onclick: async () => {
        const f = await pickFile();
        if (!f) return;
        if (!(await confirmBox('Restore this backup?', 'The current database is replaced by the backup. Notebooks are not affected.', 'Restore', true))) return;
        try {
          await engine.importSnapshot(f);
          toast('Backup restored');
        } catch (e) {
          toast(`Restore failed: ${(e as PgError).message}`, 'err');
        }
        render();
      } }, icon('import'), 'Restore'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmBox('Reset the database?', 'All tables and data are deleted. Notebooks are kept. This cannot be undone.', 'Reset', true))) return;
        await engine.resetDatabase();
        toast('Database reset');
        render();
      } }, icon('trash'), 'Reset')),
    h('h2', { class: 'section' }, 'Extensions'),
    h('p', { class: 'muted pad' }, 'All extensions are inside the app. Turning one on makes it available to CREATE EXTENSION; PostgreSQL restarts with your data kept.'),
    ...groups.map((g) => [
      h('h3', { class: 'group' }, g),
      h('div', { class: 'list' },
        EXTENSIONS.filter((e) => e.group === g).map((e) => {
          const cb = h('input', { type: 'checkbox', class: 'switch', checked: selected.has(e.id) }) as HTMLInputElement;
          cb.onchange = () => { cb.checked ? selected.add(e.id) : selected.delete(e.id); changed(); };
          return h('label', { class: 'row ext' },
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, e.title, e.sizeKb > 5000 && h('span', { class: 'tag' }, `${Math.round(e.sizeKb / 1024)} MB`)),
              h('div', { class: 'row-sub' }, e.description)),
            cb);
        })),
    ]),
    h('div', { class: 'sticky-apply' }, applyBtn),
    h('h2', { class: 'section' }, 'About'),
    h('div', { class: 'info muted' },
      h('div', {}, 'PG Notebook is open source (MIT): github.com/heyobi/pgnotebook'),
      h('div', {}, 'PostgreSQL © The PostgreSQL Global Development Group. PGlite © ElectricSQL (Apache-2.0). PostGIS is GPL-2.0-or-later; its source is at postgis.net. PostgreSQL is a trademark of the PostgreSQL Community Association; this app is not affiliated with it.')));
}

// ---------------- notebook ----------------
interface CellUi { cell: Cell; el: HTMLElement; run?: () => Promise<boolean>; focus?: () => void }

function notebookView(nb: Notebook) {
  let saveTimer: number | undefined;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveNotebook(nb), 600);
  };
  const uis: CellUi[] = [];
  const cellsEl = h('div', { class: 'cells' });

  const title = h('input', { class: 'nb-title', value: nb.title, 'aria-label': 'Notebook title', enterkeyhint: 'done' }) as HTMLInputElement;
  title.oninput = () => { nb.title = title.value || 'Untitled notebook'; persist(); };
  title.onkeydown = (e) => e.key === 'Enter' && title.blur();

  const rebuild = () => {
    for (const u of uis) u.el.remove();
    uis.length = 0;
    nb.cells.forEach((c) => {
      const u = cellView(c);
      uis.push(u);
      cellsEl.append(u.el);
    });
  };

  const insertAt = (idx: number, type: Cell['type']) => {
    const c: Cell = { id: uid(), type, source: '' };
    nb.cells.splice(idx, 0, c);
    persist();
    rebuild();
    uis[idx]?.focus?.();
  };

  const runAll = async () => {
    for (const u of uis) {
      if (u.run && !(await u.run())) break;
    }
  };

  function cellView(cell: Cell): CellUi {
    const ui: CellUi = { cell, el: h('div') };
    const out = h('div', { class: 'out' });
    const idx = () => nb.cells.indexOf(cell);
    const menu = () => sheet(cell.type === 'sql' ? 'SQL cell' : 'Text cell', [
      { label: 'Insert SQL cell below', run: () => insertAt(idx() + 1, 'sql') },
      { label: 'Insert text cell below', run: () => insertAt(idx() + 1, 'markdown') },
      { label: 'Move up', run: () => { const i = idx(); if (i > 0) { nb.cells.splice(i - 1, 0, nb.cells.splice(i, 1)[0]); persist(); rebuild(); } } },
      { label: 'Move down', run: () => { const i = idx(); if (i < nb.cells.length - 1) { nb.cells.splice(i + 1, 0, nb.cells.splice(i, 1)[0]); persist(); rebuild(); } } },
      { label: cell.type === 'sql' ? 'Change to text' : 'Change to SQL', run: () => { cell.type = cell.type === 'sql' ? 'markdown' : 'sql'; persist(); rebuild(); } },
      { label: 'Delete cell', danger: true, run: () => { nb.cells.splice(idx(), 1); persist(); rebuild(); } },
    ]);

    const onChange = EditorView.updateListener.of((u) => {
      if (u.docChanged) { cell.source = u.state.doc.toString(); persist(); }
      if (u.focusChanged) u.view.hasFocus ? showAccessory(u.view, cell.type) : setTimeout(() => !document.activeElement?.closest('.cm-editor') && hideAccessory(), 50);
    });
    const theme = EditorView.theme({ '&': { fontSize: '15px' }, '.cm-content': { fontFamily: 'var(--mono)' } });
    const makeEditor = (parent: HTMLElement, lang: 'sql' | 'md', extra: unknown[] = []) => {
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: cell.source,
          extensions: [
            basicSetup,
            lang === 'sql' ? schemaComp.of(sql({ dialect: PostgreSQL, schema: schemaCache, upperCaseKeywords: true })) : markdown(),
            EditorView.lineWrapping,
            placeholder(lang === 'sql' ? 'SELECT …' : 'Write notes in Markdown…'),
            theme,
            dark() ? oneDark : [],
            EditorState.tabSize.of(2),
            onChange,
            ...(extra as never[]),
          ],
        }),
      });
      editors.add(view);
      return view;
    };

    if (cell.type === 'sql') {
      const runBtn = h('button', { class: 'run', 'aria-label': 'Run cell' }, icon('play'));
      const ed = h('div', { class: 'editor' });
      const counter = h('span', { class: 'cell-meta' });
      ui.el = h('div', { class: 'cell sql' },
        h('div', { class: 'cell-head' }, runBtn, counter, h('div', { class: 'grow' }), h('button', { class: 'more', 'aria-label': 'Cell actions', onclick: menu }, icon('more'))),
        ed, out);
      const view = makeEditor(ed, 'sql', [keymap.of([{ key: 'Mod-Enter', run: () => (void ui.run!(), true) }, { key: 'Shift-Enter', run: () => (void ui.run!(), true) }])]);
      ui.focus = () => view.focus();
      ui.run = async () => {
        const text = view.state.doc.toString().trim();
        if (!text) return true;
        runBtn.classList.add('busy');
        counter.textContent = 'running…';
        out.replaceChildren();
        try {
          const r = await engine.exec(text);
          renderResult(out, r);
          counter.textContent = `${r.ms < 1000 ? `${Math.max(1, Math.round(r.ms))} ms` : `${(r.ms / 1000).toFixed(2)} s`}`;
          if (/\b(create|drop|alter)\b/i.test(text)) void refreshSchema();
          return true;
        } catch (e) {
          counter.textContent = 'error';
          renderError(out, e as PgError, text);
          return false;
        } finally {
          runBtn.classList.remove('busy');
        }
      };
      runBtn.onclick = () => void ui.run!();
    } else {
      const view = h('div', { class: 'md', html: cell.source.trim() ? (marked.parse(cell.source) as string) : '<p class="muted">Empty text cell — tap to edit</p>' });
      const ed = h('div', { class: 'editor hidden' });
      let editor: EditorView | null = null;
      const done = h('button', { class: 'link hidden' }, 'Done');
      const edit = () => {
        view.classList.add('hidden');
        ed.classList.remove('hidden');
        done.classList.remove('hidden');
        editor ??= makeEditor(ed, 'md');
        editor.focus();
      };
      done.onclick = () => {
        view.innerHTML = cell.source.trim() ? (marked.parse(cell.source) as string) : '<p class="muted">Empty text cell — tap to edit</p>';
        view.classList.remove('hidden');
        ed.classList.add('hidden');
        done.classList.add('hidden');
        hideAccessory();
      };
      view.onclick = edit;
      ui.focus = edit;
      ui.el = h('div', { class: 'cell md-cell' },
        h('div', { class: 'cell-head' }, h('span', { class: 'cell-meta' }, 'Text'), h('div', { class: 'grow' }), done, h('button', { class: 'more', 'aria-label': 'Cell actions', onclick: menu }, icon('more'))),
        view, ed);
      if (!cell.source.trim()) queueMicrotask(edit);
    }
    return ui;
  }

  rebuild();

  const page = h('div', { class: 'page nb' },
    h('header', { class: 'bar' },
      h('button', { class: 'back', onclick: async () => { clearTimeout(saveTimer); await saveNotebook(nb); notebooks.sort((a, b) => b.updated - a.updated); go({ name: 'home' }); } }, icon('back'), 'Notebooks'),
      h('div', { class: 'grow' }),
      statusPill(),
      h('button', { class: 'more', 'aria-label': 'Notebook actions', onclick: () => sheet(nb.title, [
        { label: 'Run all cells', run: runAll },
        { label: 'Share as Jupyter notebook (.ipynb)', run: () => shareFile(`${safeName(nb.title)}.ipynb`, toIpynb(nb), 'application/x-ipynb+json') },
        { label: 'Share as SQL script (.sql)', run: () => shareFile(`${safeName(nb.title)}.sql`, toSql(nb), 'application/sql') },
        { label: 'Duplicate', run: async () => { const copy: Notebook = { ...structuredClone(nb), id: uid(), title: `${nb.title} copy` }; await newNotebook(copy.cells, copy.title); } },
        { label: 'Delete notebook', danger: true, run: async () => {
          if (!(await confirmBox('Delete notebook?', `“${nb.title}” will be deleted. Database tables are not affected.`, 'Delete', true))) return;
          clearTimeout(saveTimer);
          await deleteNotebook(nb.id);
          notebooks = notebooks.filter((n) => n.id !== nb.id);
          go({ name: 'home' });
        } },
      ]) }, icon('more'))),
    title,
    cellsEl,
    h('div', { class: 'nb-foot' },
      h('button', { class: 'btn', onclick: () => insertAt(nb.cells.length, 'sql') }, icon('plus'), 'SQL'),
      h('button', { class: 'btn', onclick: () => insertAt(nb.cells.length, 'markdown') }, icon('plus'), 'Text'),
      h('button', { class: 'btn primary', onclick: runAll }, icon('play'), 'Run all')));
  return page;
}

// ---------------- results ----------------
function fmtValue(v: unknown): { text: string; cls?: string } {
  if (v === null || v === undefined) return { text: 'NULL', cls: 'null' };
  if (typeof v === 'boolean') return { text: v ? 'true' : 'false', cls: 'bool' };
  if (typeof v === 'number') return { text: String(v), cls: 'num' };
  if (typeof v === 'object') {
    const o = v as { $bytes?: number[]; length?: number };
    if (o.$bytes) return { text: '\\x' + o.$bytes.map((b) => b.toString(16).padStart(2, '0')).join('') + (o.length! > 64 ? '…' : ''), cls: 'bytes' };
    return { text: JSON.stringify(v), cls: 'json' };
  }
  const s = String(v);
  return { text: s.length > 500 ? s.slice(0, 500) + '…' : s };
}

function csv(rs: ResultSet): string {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [rs.fields.map((f) => esc(f.name)).join(','), ...rs.rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}

function renderResult(out: HTMLElement, r: ExecOk) {
  for (const n of r.notices) out.append(h('div', { class: `notice ${n.severity.toLowerCase()}` }, `${n.severity}: ${n.message}`));
  const sets = r.results.filter((x) => x.fields.length);
  const last = r.results[r.results.length - 1];
  if (!sets.length) {
    out.append(h('div', { class: 'ok' }, last && last.affectedRows ? `OK · ${last.affectedRows} row${last.affectedRows === 1 ? '' : 's'} affected` : `OK · ${r.results.length} statement${r.results.length === 1 ? '' : 's'}`));
    return;
  }
  for (const rs of sets.slice(-3)) {
    const MAX = 200;
    const table = h('table', {},
      h('thead', {}, h('tr', {}, rs.fields.map((f) => h('th', {}, f.name)))),
      h('tbody', {}, rs.rows.slice(0, MAX).map((row) => h('tr', {}, row.map((v) => { const f = fmtValue(v); return h('td', { class: f.cls }, f.text); })))));
    out.append(
      h('div', { class: 'table-wrap' }, table),
      h('div', { class: 'result-foot' },
        h('span', {}, `${rs.rowCount} row${rs.rowCount === 1 ? '' : 's'}${rs.rowCount > MAX ? ` · showing ${MAX}` : ''}`),
        h('button', { class: 'link', onclick: () => shareFile('result.csv', csv(rs), 'text/csv') }, 'CSV')));
  }
}

function renderError(out: HTMLElement, e: PgError, text: string) {
  const box = h('div', { class: 'error-box' },
    h('b', {}, e.message ?? String(e)),
    e.detail && h('div', {}, e.detail),
    e.hint && h('div', { class: 'muted' }, `Hint: ${e.hint}`));
  // "extension ... is not available": offer to turn it on.
  const wanted = createdExtensions(text).map(extForSqlName).filter((x): x is NonNullable<typeof x> => !!x)
    .filter((x) => !engine.enabledExtensions().includes(x.id));
  if (wanted.length && /extension|control file|could not open/i.test(e.message ?? '')) {
    box.append(h('button', { class: 'btn primary', onclick: async () => {
      await engine.setExtensions([...engine.enabledExtensions(), ...wanted.map((w) => w.id)]);
      toast(`${wanted.map((w) => w.title).join(', ')} turned on — run the cell again`);
      box.remove();
    } }, `Turn on ${wanted.map((w) => w.title).join(', ')}`));
  }
  out.append(box);
}

// ---------------- keyboard accessory (SQL symbols above the keyboard) ----------------
let accessory: HTMLElement | null = null;
let accView: EditorView | null = null;
function showAccessory(view: EditorView, kind: Cell['type']) {
  accView = view;
  hideAccessory(false);
  const keys = kind === 'sql'
    ? ['*', ',', '(', ')', "'", ';', '=', '<', '>', '.', '_', ':', '%', '"', '[', ']', '|']
    : ['#', '*', '`', '-', '[', ']', '(', ')', '>', '_'];
  const ins = (t: string) => {
    const v = accView!;
    const { from, to } = v.state.selection.main;
    v.dispatch({ changes: { from, to, insert: t }, selection: { anchor: from + t.length } });
    v.focus();
  };
  accessory = h('div', { class: 'accessory', onmousedown: (e: Event) => e.preventDefault(), ontouchstart: (e: Event) => e.preventDefault() },
    h('div', { class: 'acc-keys' },
      keys.map((k) => h('button', { onclick: () => ins(k), ontouchend: (e: Event) => { e.preventDefault(); ins(k); } }, k))),
    h('button', { class: 'acc-done', ontouchend: (e: Event) => { e.preventDefault(); accView?.contentDOM.blur(); hideAccessory(); }, onclick: () => { accView?.contentDOM.blur(); hideAccessory(); } }, 'Done'));
  document.body.append(accessory);
  placeAccessory();
}
function hideAccessory(clear = true) {
  accessory?.remove();
  accessory = null;
  if (clear) accView = null;
}
function placeAccessory() {
  if (!accessory || !window.visualViewport) return;
  const vv = window.visualViewport;
  accessory.style.top = `${vv.offsetTop + vv.height - accessory.offsetHeight}px`;
}
window.visualViewport?.addEventListener('resize', placeAccessory);
window.visualViewport?.addEventListener('scroll', placeAccessory);

// ---------------- boot ----------------
async function boot() {
  if (native) {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    StatusBar.setStyle({ style: dark() ? Style.Dark : Style.Light }).catch(() => {});
  }
  notebooks = await loadNotebooks();
  if (!notebooks.length && !localStorage.getItem('pgn-seeded')) {
    const nb = sampleNotebook('welcome', uid());
    await saveNotebook(nb);
    notebooks = [nb];
    try { localStorage.setItem('pgn-seeded', '1'); } catch {}
  }
  render();
  if (native) SplashScreen.hide().catch(() => {});
  engine.start().then(refreshSchema).catch((e) => {
    console.error(e);
    toast('PostgreSQL did not start — see Database', 'err');
  });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
void boot();
