import './style.css';
import './style2.css';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { EditorView, keymap, placeholder, tooltips } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import type { CompletionContext } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import * as engine from './engine';
import type { PgError } from './engine';
import { CATEGORIES, EXTENSIONS, PG_VERSIONS, createdExtensions, extById, extForSqlName, type ExtInfo, type PgVersion } from './extensions';
import { deleteNotebook, fromIpynb, fromSql, loadNotebooks, saveNotebook, toIpynb, toSql, uid, type Cell, type Notebook } from './notebook';
import { initPro, isPro, onPro, requirePro } from './pro';
import { errorBox, renderResult } from './results';
import { CORE_SAMPLES, extensionSamples, sampleNotebook, type Sample } from './samples';
import { LESSONS } from './lessons';
import SAMPLE_OUTPUTS from './sample-outputs.json';
import type { ExecOk } from './engine';
type SavedOutput = ExecOk | PgError;
import { terminalView } from './terminal';
import { applyTheme, getLangPref, getThemePref, isDark, lang, setLangPref, setThemePref, t, type LangPref, type Theme } from './i18n';
import { querySucceeded } from './review';
import { confirmBox, dark, fmtDate, fmtMs, h, icon, modal, native, pickFile, promptBox, safeName, sheet, shareFile, toast } from './ui';

const app = document.getElementById('app')!;

// ---------------- state ----------------
let notebooks: Notebook[] = [];
const schemaComp = new Compartment();
const editors = new Set<EditorView>();
let termEl: HTMLElement | null = null;

type Tab = 'notebooks' | 'terminal' | 'extensions' | 'databases';
type Route = { tab: Tab; notebook?: string; preview?: string };
let route: Route = { tab: 'notebooks' };

function sqlLang() {
  return sql({ dialect: PostgreSQL, schema: engine.getMeta().schema, upperCaseKeywords: true });
}
// Function-name completion from pg_proc (includes PostGIS ST_*, pgvector, … once installed).
const fnCompletion = PostgreSQL.language.data.of({
  autocomplete: (ctx: CompletionContext) => {
    const w = ctx.matchBefore(/[A-Za-z_][\w]*/);
    if (!w || (w.from === w.to && !ctx.explicit) || w.text.length < 2) return null;
    const lower = w.text.toLowerCase();
    const fns = engine.getMeta().functions.filter((f) => f.toLowerCase().startsWith(lower)).slice(0, 80);
    if (!fns.length) return null;
    return { from: w.from, options: fns.map((f) => ({ label: f, type: 'function', apply: `${f}(`, boost: -1 })), validFor: /^\w*$/ };
  },
});
engine.onMeta(() => {
  for (const v of editors) v.dispatch({ effects: schemaComp.reconfigure(sqlLang()) });
});

// ---------------- shell ----------------
function statusPill() {
  const el = h('button', { class: 'pill', onclick: () => go({ tab: 'databases' }) });
  const off = engine.onState((s) => {
    el.className = `pill ${s.status}`;
    const v = s.db ? `PG ${s.db.version}` : 'PostgreSQL';
    el.textContent = s.status === 'ready' ? `${s.db?.name ?? ''} · ${v}` : s.status === 'starting' ? t('Starting…') : t('Error');
  });
  new MutationObserver(() => { if (!el.isConnected) off(); }).observe(document.body, { childList: true, subtree: true });
  return el;
}

function tabBar() {
  const tabs: [Tab, string, string][] = [['notebooks', 'Notebooks', 'doc'], ['terminal', 'Terminal', 'term'], ['extensions', 'Extensions', 'puzzle'], ['databases', 'Databases', 'db']];
  return h('nav', { class: 'tabbar' }, tabs.map(([tb, label, ic]) =>
    h('button', { class: route.tab === tb && !route.notebook ? 'on' : '', onclick: () => go({ tab: tb }) }, icon(ic), h('span', {}, t(label)))));
}

function go(r: Route) {
  route = r;
  render();
  if (r.tab !== 'terminal') window.scrollTo(0, 0);
}

function render() {
  for (const v of editors) v.destroy();
  editors.clear();
  hideAccessory();
  app.replaceChildren();
  document.body.classList.toggle('in-notebook', !!route.notebook || !!route.preview);
  if (route.preview) {
    const s = allSamples().find((x) => x.key === route.preview);
    if (s) { app.append(previewView(s)); return; }
    route = { tab: route.tab };
  }
  if (route.notebook) {
    const nb = notebooks.find((n) => n.id === route.notebook);
    if (nb) { app.append(notebookView(nb)); return; }
    route = { tab: 'notebooks' };
  }
  const page =
    route.tab === 'terminal' ? terminalPage()
      : route.tab === 'extensions' ? extensionsPage()
        : route.tab === 'databases' ? databasesPage()
          : homePage();
  app.append(page, tabBar());
}

const header = (title: string, ...right: (HTMLElement | false)[]) =>
  h('header', { class: 'bar' }, h('div', { class: 'bar-title big' }, title), ...right.filter(Boolean) as HTMLElement[]);

// ---------------- notebooks home ----------------
async function newNotebook(cells?: Cell[], title = t('Untitled notebook')) {
  const nb: Notebook = { id: uid(), title, updated: Date.now(), cells: cells ?? [{ id: uid(), type: 'sql', source: '' }] };
  await saveNotebook(nb);
  notebooks.unshift(nb);
  go({ tab: 'notebooks', notebook: nb.id });
}

const allSamples = () => [...CORE_SAMPLES, ...extensionSamples()];

/** Read-only example with saved outputs. Anyone can look; running needs Pro for extension examples. */
function previewView(s: Sample) {
  const outputs = (SAMPLE_OUTPUTS as Record<string, (SavedOutput | null)[]>)[s.key] ?? [];
  const e = s.ext ? extById(s.ext) : undefined;
  const locked = !!e && !isPro();
  const cells = s.cells.map(([kind, src], i) => {
    if (kind === 'md') return h('div', { class: 'cell md-cell' }, h('div', { class: 'md', html: marked.parse(src) as string }));
    const ed = h('div', { class: 'editor' });
    const view = new EditorView({
      parent: ed,
      state: EditorState.create({
        doc: src,
        extensions: [basicSetup, sql({ dialect: PostgreSQL }), EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false),
          EditorView.theme({ '&': { fontSize: '15px' }, '.cm-content': { fontFamily: 'var(--mono)', padding: '6px 0' } }), dark() ? oneDark : []],
      }),
    });
    editors.add(view);
    const out = h('div', { class: 'out' });
    const o = outputs[i];
    if (o && 'results' in o) renderResult(out, o);
    else if (o && 'message' in o) out.append(errorBox(o));
    return h('div', { class: 'cell sql' },
      h('div', { class: 'cell-head' }, h('button', { class: 'run ghost', 'aria-label': 'Run', onclick: () => void use() }, icon('play')), h('span', { class: 'cell-meta' }, o && 'ms' in o ? `${fmtMs(o.ms)} · ${t('saved output')}` : t('saved output'))),
      ed, out);
  });
  const use = async () => {
    if (e) {
      const v = engine.active()?.version ?? 18;
      if (!e.versions.includes(v)) { toast(`${e.title} needs PostgreSQL ${e.versions.join(' or ')}. Switch database in Databases.`, 'err'); return; }
      if (!(await requirePro(`${e.title} ${t('is part of Pro.')}`))) return;
    }
    const nb = sampleNotebook(s, uid());
    await newNotebook(nb.cells, nb.title);
  };
  return h('div', { class: 'page nb' },
    h('header', { class: 'bar' },
      h('button', { class: 'back', onclick: () => go({ tab: route.tab }) }, icon('back'), route.tab === 'extensions' ? t('Extensions') : t('Notebooks')),
      h('div', { class: 'grow' }),
      h('span', { class: 'pill' }, t('Preview'))),
    h('div', { class: 'nb-title static' }, s.title),
    h('div', { class: `preview-banner${e ? ` cat-${slug(e.category)}` : ''}` },
      e ? h('div', { class: 'row-icon' }, icon(catIcon(e.category))) : h('div', { class: 'row-icon' }, icon('doc')),
      h('div', { class: 'grow' },
        h('b', {}, e ? `${e.title} example` : t('Example notebook')),
        h('div', { class: 'small muted' }, locked ? t('These are saved results. Unlock Pro to run and edit it on your own database.') : t('These are saved results. Open it to run and edit the cells.'))),
      h('button', { class: 'btn primary', onclick: () => void use() }, locked ? t('Unlock') : 'Run')),
    h('div', { class: 'cells' }, cells),
    h('div', { class: 'nb-foot' },
      h('button', { class: 'btn primary big', onclick: use }, icon('play'), locked ? t('Unlock Pro & run') : t('Open & run'))));
}

/** Free examples, and every example for Pro users, open as a runnable notebook. Others see the saved-output preview. */
function openPreview(s: Sample) {
  if (!s.ext || isPro()) { void openSample(s); return; }
  go({ tab: route.tab, preview: s.key });
}

async function openSample(s: Sample) {
  if (s.ext) {
    const e = extById(s.ext)!;
    const v = engine.active()?.version ?? 18;
    if (!e.versions.includes(v)) { toast(`${e.title} is not available on PostgreSQL ${v}. Switch database in Databases.`, 'err'); return; }
    if (!(await requirePro(`${e.title} ${t('is part of Pro.')}`))) return;
  }
  // Re-opening a lesson continues the copy you already have instead of making another one.
  const existing = s.key.startsWith('learn-') ? notebooks.find((n) => n.title === s.title) : undefined;
  if (existing) { go({ tab: 'notebooks', notebook: existing.id }); return; }
  const nb = sampleNotebook(s, uid());
  await newNotebook(nb.cells, nb.title);
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
    go({ tab: 'notebooks', notebook: nb.id });
  } catch (e) {
    toast(`Could not import: ${(e as Error).message}`, 'err');
  }
}

function homePage() {
  const extSamples = extensionSamples();
  return h('div', { class: 'page' },
    header(t('Notebooks'), statusPill()),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => newNotebook() }, icon('plus'), t('New notebook')),
      h('button', { class: 'btn', onclick: importNotebook }, icon('import'), t('Import'))),
    notebooks.length
      ? h('div', { class: 'list' }, notebooks.map((nb) => h('button', { class: 'row', onclick: () => go({ tab: 'notebooks', notebook: nb.id }) },
          h('div', { class: 'row-icon' }, icon('doc')),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, nb.title),
            h('div', { class: 'row-sub' }, `${nb.cells.length} ${t(nb.cells.length === 1 ? 'cell' : 'cells')} · ${fmtDate(nb.updated)}`)),
          icon('chevron'))))
      : h('div', { class: 'empty' }, t('No notebooks yet. Start with an example below.')),
    h('h2', { class: 'section' }, t('Learn PostgreSQL'), h('span', { class: 'section-note' }, `${LESSONS.length} ${t('lessons · free')}`)),
    h('p', { class: 'muted pad' }, t('A short course from your first SELECT to window functions, indexes and transactions. Each lesson explains, runs and ends with an exercise.')),
    h('div', { class: 'list lessons' }, LESSONS.map((l) => {
      const started = notebooks.some((n) => n.title === l.title);
      return h('button', { class: 'row', onclick: () => openSample(l) },
        h('div', { class: `lesson-n ${started ? 'started' : ''}` }, String(l.n)),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, l.title),
          h('div', { class: 'row-sub' }, `${l.subtitle}`),
          h('div', { class: 'lesson-meta' }, h('span', { class: `lvl lvl-${l.level.toLowerCase()}` }, t(l.level)), `${l.minutes} ${lang() === 'tr' ? 'dk' : 'min'}${started ? ` · ${t('in your notebooks')}` : ''}`)),
        icon('chevron'));
    })),
    h('h3', { class: 'group' }, t('More examples')),
    h('div', { class: 'cards' }, CORE_SAMPLES.slice(1).map((s) => h('button', { class: 'card', onclick: () => openPreview(s) },
      h('div', { class: 'card-title' }, s.title), h('div', { class: 'card-sub' }, s.subtitle)))),
    h('h2', { class: 'section' }, t('Extension examples'), !isPro() && h('span', { class: 'pro-tag' }, 'PRO')),
    h('div', { class: 'hscroll' }, extSamples.map((s) => {
      const e = extById(s.ext!)!;
      return h('button', { class: `card ext-card cat-${slug(e.category)}`, onclick: () => openPreview(s) },
        h('div', { class: 'ext-ico' }, icon(catIcon(e.category))),
        h('div', { class: 'card-title' }, e.title), h('div', { class: 'card-sub' }, e.tagline));
    })));
}

// ---------------- terminal ----------------
function terminalPage() {
  termEl ??= terminalView();
  return h('div', { class: 'page term-page' }, header(t('Terminal'), statusPill()), termEl);
}

// ---------------- extensions store ----------------
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');
function catIcon(c: string) {
  return ({ Geospatial: 'globe', 'AI & vectors': 'spark', Graph: 'graph', 'Search & text': 'search', 'Data types': 'shapes', Security: 'lock', Indexing: 'bolt', 'Testing & admin': 'wrench' } as Record<string, string>)[c] ?? 'puzzle';
}

function extStatus(e: ExtInfo): { label: string; cls: string } {
  const v = engine.active()?.version ?? 18;
  if (!e.versions.includes(v)) return { label: `PG ${e.versions.join('/')}`, cls: 'na' };
  if (engine.isInstalled(e.id)) return { label: t('Installed'), cls: 'on' };
  return { label: isPro() ? t('Get') : 'Pro', cls: 'get' };
}

function extensionsPage() {
  let q = '';
  const listEl = h('div');
  const search = h('input', { class: 'search', type: 'search', placeholder: `${t('Search extensions')} (${EXTENSIONS.length})`, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const draw = () => {
    const match = (e: ExtInfo) => !q || `${e.title} ${e.tagline} ${e.about} ${e.category}`.toLowerCase().includes(q);
    const installed = EXTENSIONS.filter((e) => engine.isInstalled(e.id) && match(e));
    const parts: unknown[] = [
      !q && h('div', { class: 'featured' }, EXTENSIONS.filter((e) => e.featured).slice(0, 4).map((e) =>
        h('button', { class: `feat cat-${slug(e.category)}`, onclick: () => extDetail(e, draw) },
          h('div', { class: 'feat-ico' }, icon(catIcon(e.category))),
          h('div', { class: 'feat-title' }, e.title),
          h('div', { class: 'feat-sub' }, e.tagline),
          h('span', { class: `badge ${extStatus(e).cls}` }, extStatus(e).label)))),
      installed.length > 0 && [h('h3', { class: 'group' }, t('Installed in this database')), extList(installed, draw)],
      ...CATEGORIES.map((c) => {
        const items = EXTENSIONS.filter((e) => e.category === c && match(e));
        return items.length ? [h('h3', { class: 'group' }, icon(catIcon(c)), t(c)), extList(items, draw)] : null;
      }),
    ];
    listEl.replaceChildren(...(parts.flat(2).filter(Boolean) as HTMLElement[]));
  };
  search.oninput = () => { q = search.value.trim().toLowerCase(); draw(); };
  search.setAttribute('enterkeyhint', 'search');
  search.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); search.blur(); } };
  // Inside a form iOS labels the return key "Search"; submitting just closes the keyboard.
  const searchForm = h('form', { action: '', onsubmit: (e: Event) => { e.preventDefault(); search.blur(); } }, search);
  const off = engine.onMeta(() => draw());
  const offPro = onPro(() => render());
  new MutationObserver(() => { if (!listEl.isConnected) { off(); offPro(); } }).observe(document.body, { childList: true, subtree: true });
  draw();
  return h('div', { class: 'page' },
    header(t('Extensions'), statusPill()),
    !isPro() && h('button', { class: 'pro-banner', onclick: () => requirePro().then(() => render()) },
      h('div', {}, h('b', {}, t('Unlock every extension')), h('div', { class: 'small' }, t('PostGIS, pgvector, Apache AGE and 30+ more · one-time purchase'))),
      h('span', { class: 'pro-tag big' }, 'PRO')),
    searchForm,
    listEl);
}

function extList(items: ExtInfo[], redraw: () => void) {
  return h('div', { class: 'list' }, items.map((e) => {
    const st = extStatus(e);
    return h('button', { class: 'row', onclick: () => extDetail(e, redraw) },
      h('div', { class: `row-icon cat-${slug(e.category)}` }, icon(catIcon(e.category))),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, e.title), h('div', { class: 'row-sub' }, e.tagline)),
      h('span', { class: `badge ${st.cls}` }, st.label));
  }));
}

function extDetail(e: ExtInfo, redraw: () => void) {
  const v = engine.active()?.version ?? 18;
  const available = e.versions.includes(v);
  const installed = engine.isInstalled(e.id);
  const actionBtn = h('button', { class: `btn big ${installed ? 'danger' : 'primary'}`, disabled: !available }, installed ? t('Remove from database') : isPro() ? t('Install') : t('Install · Pro'));
  actionBtn.onclick = async () => {
    if (!installed && !(await requirePro(`${e.title} ${t('is part of Pro.')}`))) return;
    // Ask before touching the button, so "Removing…" only appears after the user confirmed.
    if (installed && !(await confirmBox(`Remove ${e.title}?`, t('DROP EXTENSION … CASCADE also drops columns and objects that use it.'), t('Remove'), true))) return;
    actionBtn.setAttribute('disabled', '');
    actionBtn.textContent = installed ? t('Removing…') : e.sizeKb > 5000 ? t('Installing… (large, a few seconds)') : t('Installing…');
    try {
      if (installed) {
        await engine.removeExtension(e.id);
        toast(`${e.title} removed`);
      } else {
        await engine.installExtension(e.id);
        toast(`${e.title} installed`);
      }
      close();
      redraw();
    } catch (err) {
      toast((err as PgError).message, 'err');
      actionBtn.removeAttribute('disabled');
    }
  };
  const sample = e.example ? extensionSamples().find((s) => s.ext === e.id) : undefined;
  const content = h('div', { class: 'ext-detail' },
    h('div', { class: `ext-hero cat-${slug(e.category)}` }, h('div', { class: 'feat-ico big' }, icon(catIcon(e.category)))),
    h('h1', {}, e.title),
    h('div', { class: 'muted center' }, e.tagline),
    h('p', {}, e.about),
    h('div', { class: 'kv' },
      h('div', {}, h('span', {}, t('Category')), h('b', {}, t(e.category))),
      h('div', {}, h('span', {}, 'CREATE EXTENSION'), h('code', {}, e.sql[0])),
      h('div', {}, h('span', {}, 'PostgreSQL'), h('b', {}, e.versions.join(', '))),
      h('div', {}, h('span', {}, t('Size')), h('b', {}, e.sizeKb >= 1024 ? `${(e.sizeKb / 1024).toFixed(1)} MB` : `${e.sizeKb} KB`)),
      h('div', {}, h('span', {}, t('Licence')), h('b', {}, e.license)),
      e.homepage && h('div', {}, h('span', {}, t('Project')), h('b', {}, e.homepage)),
      e.requires && h('div', {}, h('span', {}, t('Requires')), h('b', {}, e.requires.join(', ')))),
    !available && h('div', { class: 'error-box' }, `Not available on PostgreSQL ${v}. Create a PostgreSQL ${e.versions[e.versions.length - 1]} database in Databases to use it.`),
    actionBtn,
    sample && h('button', { class: 'btn big', onclick: () => { close(); openPreview(sample); } }, icon('doc'), t('See example notebook')));
  const close = modal(content);
}

// ---------------- databases ----------------
function databasesPage() {
  const st = engine.getState();
  const cur = engine.active();
  const sizeEl = h('span', {}, '…');
  if (cur) engine.sizeOf(cur.id).then((b) => { sizeEl.textContent = b ? `${(b / 1048576).toFixed(1)} MB saved` : t('not saved yet'); });

  const page = h('div', { class: 'page' },
    header(t('Databases'), statusPill()),
    st.status === 'error' && errorBox({ message: `PostgreSQL did not start: ${st.error}` }, h('div', { class: 'muted' }, 'Restore a backup or reset this database.')),
    cur && h('div', { class: 'db-hero' },
      h('div', { class: 'db-hero-top' },
        h('div', { class: 'row-icon big' }, icon('db')),
        h('div', { class: 'grow' }, h('div', { class: 'db-name' }, cur.name), h('div', { class: 'muted small' }, st.version?.split(' on ')[0] ?? `PostgreSQL ${cur.version}`, ' · ', sizeEl)),
        h('span', { class: `pill ${st.status}` }, st.status === 'ready' ? t('Running') : st.status)),
      h('div', { class: 'chips wrap' }, engine.getMeta().installed.filter((x) => x.name !== 'plpgsql').map((x) => h('span', { class: 'chip' }, `${x.name} ${x.version}`)),
        !engine.getMeta().installed.some((x) => x.name !== 'plpgsql') && h('span', { class: 'muted small' }, t('No extensions installed'))),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn', onclick: async () => shareFile(`${safeName(cur.name)}-pg${cur.version}-${new Date().toISOString().slice(0, 10)}.tar.gz`, await engine.exportSnapshot(), 'application/gzip') }, icon('export'), t('Back up')),
        h('button', { class: 'btn', onclick: async () => {
          const f = await pickFile();
          if (!f) return;
          if (!(await confirmBox(t('Restore this backup?'), `“${cur.name}” is replaced by the backup. It must come from PostgreSQL ${cur.version}.`, t('Restore'), true))) return;
          try { await engine.importSnapshot(f); toast('Backup restored'); } catch (e) { toast(`Restore failed: ${(e as PgError).message}`, 'err'); }
          render();
        } }, icon('import'), t('Restore')),
        h('button', { class: 'btn', onclick: async () => { const n = await promptBox(t('Rename database'), 'Name', cur.name, t('Rename')); if (n) { await engine.renameDatabase(cur.id, n); render(); } } }, t('Rename')),
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmBox(`Reset “${cur.name}”?`, 'All tables and data in this database are deleted. Notebooks are kept. This cannot be undone.', t('Reset'), true))) return;
          await engine.resetDatabase(); toast('Database reset'); render();
        } }, icon('trash'), t('Reset')))),
    h('h2', { class: 'section' }, t('All databases')),
    h('div', { class: 'list' }, engine.databases().map((d) => h('button', { class: `row${d.id === cur?.id ? ' current' : ''}`, onclick: async () => {
      if (d.id === cur?.id) return;
      sheet(d.name, [
        { label: `Switch to ${d.name}`, run: async () => { toast(`Starting ${d.name}…`); try { await engine.switchDatabase(d.id); } catch (e) { toast((e as PgError).message, 'err'); } render(); } },
        { label: t('Delete database'), danger: true, run: async () => {
          if (!(await confirmBox(`Delete “${d.name}”?`, 'The database and all its data are deleted. This cannot be undone.', t('Delete'), true))) return;
          await engine.deleteDatabase(d.id); render();
        } },
      ]);
    } },
      h('div', { class: 'row-icon' }, h('b', { class: 'ver' }, String(d.version))),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, d.name), h('div', { class: 'row-sub' }, `PostgreSQL ${d.version}${d.extensions.length ? ` · ${d.extensions.length} ${t(d.extensions.length === 1 ? 'extension' : 'extensions')}` : ''}`)),
      d.id === cur?.id ? h('span', { class: 'badge on' }, t('Active')) : icon('chevron')))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: newDatabase }, icon('plus'), t('New database'))),
    h('h2', { class: 'section' }, t('Settings')),
    h('div', { class: 'list' },
      settingRow('sun', t('Appearance'), { system: t('System'), light: t('Light'), dark: t('Dark') }, getThemePref(), (v) => { setThemePref(v as Theme); applyStatusBar(); render(); }),
      settingRow('globe', t('Language'), { system: t('System'), en: 'English', tr: 'Türkçe' }, getLangPref(), (v) => { setLangPref(v as LangPref); termEl = null; render(); })),
    h('h2', { class: 'section' }, 'Tuple'),
    h('div', { class: 'list' },
      h('button', { class: 'row', onclick: () => requirePro().then(() => render()) },
        h('div', { class: 'row-icon' }, icon('spark')),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, isPro() ? t('Pro is active') : t('Unlock Pro')), h('div', { class: 'row-sub' }, isPro() ? t('Thank you for supporting Tuple') : t('All extensions · one-time purchase'))),
        isPro() ? h('span', { class: 'badge on' }, 'PRO') : icon('chevron'))),
    h('div', { class: 'info muted small' },
      h('div', {}, 'Open source (MIT): github.com/heyobi/pgnotebook'),
      h('div', {}, 'PostgreSQL © The PostgreSQL Global Development Group. PGlite © ElectricSQL (Apache-2.0). PostGIS is GPL-2.0-or-later (source: postgis.net). Map data: Natural Earth (public domain). PostgreSQL is a trademark of the PostgreSQL Community Association; this app is not affiliated with it.')));
  return page;
}

function settingRow(ic: string, title: string, options: Record<string, string>, current: string, onPick: (v: string) => void) {
  return h('button', { class: 'row', onclick: () => sheet(title, Object.entries(options).map(([k, label]) => ({ label: (k === current ? '✓ ' : '') + label, run: () => onPick(k) }))) },
    h('div', { class: 'row-icon' }, icon(ic)),
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, title)),
    h('span', { class: 'setting-value' }, options[current] ?? current), icon('chevron'));
}

function applyStatusBar() {
  if (!native) return;
  const pref = getThemePref();
  StatusBar.setStyle({ style: pref === 'system' ? Style.Default : pref === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
}

async function newDatabase() {
  let n = engine.databases().length + 1;
  while (engine.databases().some((d) => d.name === `db${n}`)) n++;
  const name = await promptBox(t('New database'), `Name (empty = db${n})`, '', t('Next'), `db${n}`);
  if (!name) return;
  sheet(t('PostgreSQL version'), PG_VERSIONS.map((p) => ({
    label: `${p.label} — ${p.note}`,
    run: async () => {
      const db = await engine.createDatabase(name, p.v as PgVersion);
      toast(`Starting ${db.name} (PostgreSQL ${p.v})…`);
      try { await engine.switchDatabase(db.id); } catch (e) { toast((e as PgError).message, 'err'); }
      render();
    },
  })));
}

// ---------------- notebook editor ----------------
interface CellUi { cell: Cell; el: HTMLElement; run?: () => Promise<boolean>; focus?: () => void }

function notebookView(nb: Notebook) {
  let saveTimer: number | undefined;
  const persist = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(() => void saveNotebook(nb), 600); };
  const uis: CellUi[] = [];
  const cellsEl = h('div', { class: 'cells' });

  const title = h('input', { class: 'nb-title', value: nb.title, 'aria-label': t('Notebook title'), enterkeyhint: 'done' }) as HTMLInputElement;
  title.oninput = () => { nb.title = title.value || t('Untitled notebook'); persist(); };
  title.onkeydown = (e) => e.key === 'Enter' && title.blur();

  const rebuild = () => {
    for (const u of uis) u.el.remove();
    uis.length = 0;
    nb.cells.forEach((c, i) => { const u = cellView(c, i); uis.push(u); cellsEl.append(u.el); });
  };
  const insertAt = (idx: number, type: Cell['type']) => {
    nb.cells.splice(idx, 0, { id: uid(), type, source: '' });
    persist(); rebuild();
    uis[idx]?.focus?.();
  };
  const runAll = async () => { for (const u of uis) if (u.run && !(await u.run())) break; };

  function cellView(cell: Cell, index: number): CellUi {
    const ui: CellUi = { cell, el: h('div') };
    const out = h('div', { class: 'out' });
    const idx = () => nb.cells.indexOf(cell);
    const move = (d: number) => { const i = idx(), j = i + d; if (j < 0 || j >= nb.cells.length) return; nb.cells.splice(j, 0, nb.cells.splice(i, 1)[0]); persist(); rebuild(); };
    const menu = () => sheet(cell.type === 'sql' ? t('SQL cell') : t('Text cell'), [
      ...(cell.type === 'markdown' ? [{ label: t('Edit text'), run: () => ui.focus?.() }] : []),
      { label: t('Insert SQL cell below'), run: () => insertAt(idx() + 1, 'sql') },
      { label: t('Insert text cell below'), run: () => insertAt(idx() + 1, 'markdown') },
      { label: t('Move up'), run: () => move(-1) },
      { label: t('Move down'), run: () => move(1) },
      { label: t('Duplicate'), run: () => { nb.cells.splice(idx() + 1, 0, { ...cell, id: uid() }); persist(); rebuild(); } },
      { label: cell.type === 'sql' ? t('Change to text') : t('Change to SQL'), run: () => { cell.type = cell.type === 'sql' ? 'markdown' : 'sql'; persist(); rebuild(); } },
      { label: t('Clear output'), run: () => out.replaceChildren() },
      { label: t('Delete cell'), danger: true, run: () => { nb.cells.splice(idx(), 1); persist(); rebuild(); } },
    ]);

    const onChange = EditorView.updateListener.of((u) => {
      if (u.docChanged) { cell.source = u.state.doc.toString(); persist(); }
      if (u.focusChanged) u.view.hasFocus ? showAccessory(u.view, cell.type) : setTimeout(() => !document.activeElement?.closest('.cm-editor') && hideAccessory(), 60);
    });
    const theme = EditorView.theme({
      '&': { fontSize: '15px' },
      '.cm-content': { fontFamily: 'var(--mono)', padding: '6px 0' },
      '.cm-gutters': { minWidth: '28px' },
    });
    const makeEditor = (parent: HTMLElement, lang: 'sql' | 'md', extra: unknown[] = []) => {
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: cell.source,
          extensions: [
            basicSetup,
            // Render completion popups on <body> so cell borders never clip them.
            tooltips({ parent: document.body, position: 'fixed' }),
            lang === 'sql' ? [schemaComp.of(sqlLang()), fnCompletion] : markdown(),
            EditorView.lineWrapping,
            placeholder(lang === 'sql' ? 'SELECT …' : t('Write notes in Markdown…')),
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
      const counter = h('span', { class: 'cell-meta' }, `[${index + 1}]`);
      ui.el = h('div', { class: 'cell sql' },
        h('div', { class: 'cell-head' }, runBtn, counter, h('div', { class: 'grow' }),
          h('button', { class: 'more', 'aria-label': 'Cell actions', onclick: menu }, icon('more'))),
        ed, out);
      const view = makeEditor(ed, 'sql', [keymap.of([{ key: 'Mod-Enter', run: () => (void ui.run!(), true) }, { key: 'Shift-Enter', run: () => (void ui.run!(), true) }])]);
      ui.focus = () => view.focus();
      ui.run = async () => {
        const text = view.state.doc.toString().trim();
        if (!text) return true;
        runBtn.classList.add('busy');
        counter.textContent = t('running…');
        out.replaceChildren();
        try {
          const wanted = createdExtensions(text).map(extForSqlName).filter((x): x is ExtInfo => !!x);
          if (wanted.length) {
            const v = engine.active()?.version ?? 18;
            const na = wanted.filter((w) => !w.versions.includes(v));
            if (na.length) throw { message: `${na.map((n) => n.title).join(', ')} is not available on PostgreSQL ${v}`, hint: `Create a PostgreSQL ${na[0].versions[na[0].versions.length - 1]} database in Databases.` } as PgError;
            if (!(await requirePro(`${wanted.map((w) => w.title).join(', ')} ${t('is part of Pro.')}`))) throw { message: 'Extensions need Tuple Pro' } as PgError;
            const missing = wanted.filter((w) => !engine.isLoaded(w.id));
            if (missing.length) { counter.textContent = `loading ${missing.map((m) => m.title).join(', ')}…`; await engine.loadExtensions(missing.map((m) => m.id)); }
          }
          const r = await engine.exec(text);
          renderResult(out, r);
          counter.textContent = fmtMs(r.ms);
          querySucceeded();
          return true;
        } catch (e) {
          counter.textContent = 'error';
          out.append(errorBox(e as PgError));
          return false;
        } finally {
          runBtn.classList.remove('busy');
        }
      };
      runBtn.onclick = () => void ui.run!();
    } else {
      const render = () => (cell.source.trim() ? (marked.parse(cell.source) as string) : `<p class="muted">${t('Empty text cell — tap to edit')}</p>`);
      const view = h('div', { class: 'md', html: render() });
      const ed = h('div', { class: 'editor hidden' });
      let editor: EditorView | null = null;
      const done = h('button', { class: 'link hidden' }, t('Done'));
      const edit = () => {
        view.classList.add('hidden'); ed.classList.remove('hidden'); done.classList.remove('hidden');
        editor ??= makeEditor(ed, 'md');
        editor.focus();
      };
      done.onclick = () => { view.innerHTML = render(); view.classList.remove('hidden'); ed.classList.add('hidden'); done.classList.add('hidden'); hideAccessory(); };
      // Reading comes first: a single tap never opens the editor (lessons are full of tappable solutions).
      // Double-tap, the cell menu, or tapping an empty cell edits it.
      view.ondblclick = (e) => { if (!(e.target as HTMLElement).closest('details, a')) edit(); };
      view.onclick = () => { if (!cell.source.trim()) edit(); };
      ui.focus = edit;
      ui.el = h('div', { class: 'cell md-cell' },
        h('div', { class: 'cell-head' }, h('span', { class: 'cell-meta' }, 'Text'), h('div', { class: 'grow' }), done,
          h('button', { class: 'more', 'aria-label': 'Cell actions', onclick: menu }, icon('more'))),
        view, ed);
      if (!cell.source.trim()) queueMicrotask(edit);
    }
    return ui;
  }

  rebuild();

  return h('div', { class: 'page nb' },
    h('header', { class: 'bar' },
      h('button', { class: 'back', onclick: async () => { clearTimeout(saveTimer); await saveNotebook(nb); notebooks.sort((a, b) => b.updated - a.updated); go({ tab: 'notebooks' }); } }, icon('back'), 'Notebooks'),
      h('div', { class: 'grow' }),
      statusPill(),
      h('button', { class: 'more', 'aria-label': 'Notebook actions', onclick: () => sheet(nb.title, [
        { label: t('Run all cells'), run: runAll },
        { label: t('Share as Jupyter notebook (.ipynb)'), run: () => shareFile(`${safeName(nb.title)}.ipynb`, toIpynb(nb), 'application/x-ipynb+json') },
        { label: t('Share as SQL script (.sql)'), run: () => shareFile(`${safeName(nb.title)}.sql`, toSql(nb), 'application/sql') },
        { label: t('Duplicate notebook'), run: async () => { const copy = structuredClone(nb); await newNotebook(copy.cells.map((c) => ({ ...c, id: uid() })), `${nb.title} copy`); } },
        { label: t('Delete notebook'), danger: true, run: async () => {
          if (!(await confirmBox(t('Delete notebook?'), `“${nb.title}” will be deleted. Database tables are not affected.`, t('Delete'), true))) return;
          clearTimeout(saveTimer);
          await deleteNotebook(nb.id);
          notebooks = notebooks.filter((n) => n.id !== nb.id);
          go({ tab: 'notebooks' });
        } },
      ]) }, icon('more'))),
    title,
    cellsEl,
    h('div', { class: 'nb-foot' },
      h('button', { class: 'btn', onclick: () => insertAt(nb.cells.length, 'sql') }, icon('plus'), 'SQL'),
      h('button', { class: 'btn', onclick: () => insertAt(nb.cells.length, 'markdown') }, icon('plus'), 'Text'),
      h('button', { class: 'btn primary', onclick: runAll }, icon('play'), t('Run all'))));
}

// ---------------- keyboard accessory (symbols above the keyboard) ----------------
let accessory: HTMLElement | null = null;
let accView: EditorView | null = null;
function showAccessory(view: EditorView, kind: Cell['type']) {
  accView = view;
  hideAccessory(false);
  const keys = kind === 'sql'
    ? ['⇥', '*', ',', '(', ')', "'", ';', '=', '<', '>', '.', '_', ':', '%', '"', '[', ']', '|', '-', '+', '/']
    : ['#', '*', '`', '-', '[', ']', '(', ')', '>', '_'];
  const ins = (t: string) => {
    const v = accView!;
    const { from, to } = v.state.selection.main;
    const text = t === '⇥' ? '  ' : t;
    v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    v.focus();
  };
  const run = () => { const cell = accView?.dom.closest('.cell'); (cell?.querySelector('.run') as HTMLButtonElement | null)?.click(); };
  accessory = h('div', { class: 'accessory', onmousedown: (e: Event) => e.preventDefault(), ontouchstart: (e: Event) => e.preventDefault() },
    kind === 'sql' && h('button', { class: 'acc-run', ontouchend: (e: Event) => { e.preventDefault(); run(); }, onclick: run }, icon('play')),
    h('div', { class: 'acc-keys' }, keys.map((k) => h('button', { onclick: () => ins(k), ontouchend: (e: Event) => { e.preventDefault(); ins(k); } }, k))),
    h('button', { class: 'acc-done', ontouchend: (e: Event) => { e.preventDefault(); accView?.contentDOM.blur(); hideAccessory(); }, onclick: () => { accView?.contentDOM.blur(); hideAccessory(); } }, t('Done')));
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
// Hide the tab bar while the keyboard is up: it only takes space above the keys.
// Tapping anywhere that is not a text field closes the keyboard, as in native iOS apps.
function dismissKeyboardOnTapOutside() {
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return;
    if (target.closest('input, textarea, .cm-editor, .accessory, .term-keys, .term-row, .dialog, .sheet')) return;
    active.blur();
  }, true);
  // Scrolling the page also puts the keyboard away (as in iOS lists), except while editing code or terminal input.
  document.addEventListener('touchmove', () => {
    const a = document.activeElement as HTMLElement | null;
    if (a && a.matches('input.search, input.field')) a.blur();
  }, { passive: true });
}

function trackKeyboard() {
  const set = (open: boolean) => document.body.classList.toggle('kb-open', open);
  if (native) {
    Keyboard.addListener('keyboardWillShow', () => set(true));
    Keyboard.addListener('keyboardWillHide', () => set(false));
  } else {
    document.addEventListener('focusin', (e) => set(!!(e.target as HTMLElement).closest('input, textarea, .cm-content')));
    document.addEventListener('focusout', () => setTimeout(() => set(!!document.activeElement?.closest('input, textarea, .cm-content')), 50));
  }
}

async function boot() {
  trackKeyboard();
  dismissKeyboardOnTapOutside();
  if (native) {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    applyStatusBar();
  }
  notebooks = await loadNotebooks();
  if (!notebooks.length) {
    let seeded = false;
    try { seeded = localStorage.getItem('pgn-seeded') === '1'; } catch { /* ignore */ }
    if (!seeded) {
      const nb = sampleNotebook(CORE_SAMPLES[0], uid());
      await saveNotebook(nb);
      notebooks = [nb];
      try { localStorage.setItem('pgn-seeded', '1'); } catch { /* ignore */ }
    }
  }
  render();
  if (native) SplashScreen.hide().catch(() => {});
  void initPro().then(() => route.tab !== 'terminal' && !route.notebook && !route.preview && render());
  engine.start().catch((e) => { console.error(e); toast('PostgreSQL did not start — see Databases', 'err'); });
}

// Automated checks (WebKit via Playwright) reach the engine through this hook; only with ?selftest in the URL.
if (new URLSearchParams(location.search).has('selftest')) Object.assign(window, { __engine: engine, __lessons: LESSONS });

engine.onState((s) => { if (s.status !== 'starting' && route.tab === 'databases' && !route.notebook) render(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); if (route.tab !== 'terminal') render(); });
void boot();
