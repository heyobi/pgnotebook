// psql-like terminal: SQL plus the most used backslash commands, output formatted like psql.
import * as engine from './engine';
import type { ExecOk, PgError, ResultSet } from './engine';
import { extForSqlName, createdExtensions } from './extensions';
import { requirePro } from './pro';
import { fmtValue } from './results';
import { h, fmtMs } from './ui';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const HELP = `General
  \\?               this help
  \\l               list databases        \\c NAME     switch database
  \\conninfo        current connection    \\timing     toggle timing
  \\x               toggle expanded output \\clear      clear the screen
Informational
  \\d [NAME]        list relations, or describe a table/view/index
  \\dt [PATTERN]    tables               \\dv         views
  \\di              indexes              \\ds         sequences
  \\df [PATTERN]    functions            \\dn         schemas
  \\dx              installed extensions \\du         roles
Any other input is sent to PostgreSQL. End statements with ;`;

const META: Record<string, (arg: string) => string> = {
  dt: (p) => `SELECT n.nspname AS "Schema", c.relname AS "Name", 'table' AS "Type", pg_size_pretty(pg_total_relation_size(c.oid)) AS "Size"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
     ${p ? `AND c.relname ILIKE ${lit(p.replace(/\*/g, '%'))}` : ''} ORDER BY 1, 2`,
  dv: () => `SELECT n.nspname AS "Schema", c.relname AS "Name", 'view' AS "Type" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('v','m') AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1, 2`,
  di: () => `SELECT schemaname AS "Schema", indexname AS "Name", tablename AS "Table", indexdef AS "Definition" FROM pg_indexes
   WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1, 3, 2`,
  ds: () => `SELECT sequence_schema AS "Schema", sequence_name AS "Name", data_type AS "Type" FROM information_schema.sequences ORDER BY 1, 2`,
  df: (p) => `SELECT n.nspname AS "Schema", p.proname AS "Name", pg_get_function_result(p.oid) AS "Result type",
       pg_get_function_arguments(p.oid) AS "Argument types"
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE ${p ? `p.proname ILIKE ${lit(p.replace(/\*/g, '%'))}` : `n.nspname NOT IN ('pg_catalog','information_schema')`}
   ORDER BY 1, 2 LIMIT 200`,
  dn: () => `SELECT nspname AS "Name", pg_get_userbyid(nspowner) AS "Owner" FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY 1`,
  dx: () => `SELECT e.extname AS "Name", e.extversion AS "Version", n.nspname AS "Schema", obj_description(e.oid, 'pg_extension') AS "Description"
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1`,
  du: () => `SELECT rolname AS "Role name", CASE WHEN rolsuper THEN 'Superuser' ELSE '' END AS "Attributes" FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY 1`,
};

const DESCRIBE = (name: string) => `SELECT a.attname AS "Column", format_type(a.atttypid, a.atttypmod) AS "Type",
       CASE WHEN a.attnotnull THEN 'not null' ELSE '' END AS "Nullable", coalesce(pg_get_expr(d.adbin, d.adrelid), '') AS "Default"
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE a.attrelid = ${lit(name)}::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT indexname AS "Indexes", indexdef AS "Definition" FROM pg_indexes WHERE (schemaname || '.' || tablename = ${lit(name)} OR tablename = ${lit(name)});`;

function psqlTable(rs: ResultSet, expanded: boolean): string {
  const cells = rs.rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : fmtValue(v).text.replace(/\n/g, '↵'))));
  const names = rs.fields.map((f) => f.name);
  if (expanded) {
    const w = Math.max(...names.map((n) => n.length));
    return cells.map((r, i) => `-[ RECORD ${i + 1} ]${'-'.repeat(Math.max(0, w - 8))}\n` + r.map((v, j) => `${names[j].padEnd(w)} | ${v}`).join('\n')).join('\n') +
      `\n(${rs.rowCount} row${rs.rowCount === 1 ? '' : 's'})`;
  }
  const widths = names.map((n, j) => Math.min(60, Math.max(n.length, ...cells.map((r) => r[j].length))));
  const clip = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + '…' : s);
  const num = rs.fields.map((f) => /^(int|float|numeric|oid)/.test(f.type));
  const head = names.map((n, j) => { const pad = widths[j] - n.length; return ' '.repeat(Math.floor(pad / 2)) + n + ' '.repeat(Math.ceil(pad / 2)); }).join(' | ');
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
  const body = cells.map((r) => r.map((v, j) => (num[j] ? clip(v, widths[j]).padStart(widths[j]) : clip(v, widths[j]).padEnd(widths[j]))).join(' | '));
  return [' ' + head, '-' + sep + '-', ...body.map((b) => ' ' + b), `(${rs.rowCount} row${rs.rowCount === 1 ? '' : 's'})`].join('\n');
}

export function terminalView(): HTMLElement {
  const screen = h('div', { class: 'term-screen', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'term-input', rows: '1', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'SQL input' }) as HTMLTextAreaElement;
  const prompt = h('span', { class: 'term-prompt' });
  let buffer = '';
  let timing = true;
  let expanded = false;
  const history: string[] = (() => { try { return JSON.parse(localStorage.getItem('pgn-history') || '[]'); } catch { return []; } })();
  let hi = history.length;

  const dbName = () => engine.active()?.name ?? 'postgres';
  const setPrompt = () => { prompt.textContent = `${dbName()}${buffer ? '-#' : '=#'} `; };
  const print = (text: string, cls = '') => {
    screen.append(h('pre', { class: `term-line ${cls}` }, text));
    screen.scrollTop = screen.scrollHeight;
    requestAnimationFrame(() => input.scrollIntoView({ block: 'nearest' }));
  };

  const printResult = (r: ExecOk) => {
    for (const n of r.notices) print(`${n.severity}:  ${n.message}`, 'muted');
    for (const rs of r.results) {
      if (rs.fields.length) print(psqlTable(rs, expanded));
      else print(rs.affectedRows ? `OK, ${rs.affectedRows} row${rs.affectedRows === 1 ? '' : 's'}` : 'OK', 'ok');
    }
    if (timing) print(`Time: ${fmtMs(r.ms)}`, 'muted');
  };
  const printError = (e: PgError) => {
    print(`ERROR:  ${e.message}${e.detail ? `\nDETAIL:  ${e.detail}` : ''}${e.hint ? `\nHINT:  ${e.hint}` : ''}`, 'err');
  };

  async function runSql(sql: string) {
    const wanted = createdExtensions(sql).map(extForSqlName).filter((x): x is NonNullable<typeof x> => !!x);
    if (wanted.length) {
      if (!(await requirePro(`${wanted.map((w) => w.title).join(', ')} is part of Pro.`))) { print('Cancelled: extensions need Pro.', 'err'); return; }
      const missing = wanted.filter((w) => !engine.isLoaded(w.id));
      if (missing.length) { print(`Loading ${missing.map((m) => m.title).join(', ')}… (PostgreSQL restarts, data kept)`, 'muted'); await engine.loadExtensions(missing.map((m) => m.id)); }
    }
    try { printResult(await engine.exec(sql)); } catch (e) { printError(e as PgError); }
  }

  async function meta(line: string) {
    const [cmd, ...rest] = line.slice(1).trim().split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case '?': case 'h': print(HELP); return;
      case 'clear': screen.replaceChildren(); return;
      case 'timing': timing = !timing; print(`Timing is ${timing ? 'on' : 'off'}.`); return;
      case 'x': expanded = !expanded; print(`Expanded display is ${expanded ? 'on' : 'off'}.`); return;
      case 'conninfo': { const d = engine.active(); print(`You are connected to database "${d?.name}" (${engine.getState().version?.split(' on ')[0]}) on this device.`); return; }
      case 'l': print(psqlTable({ fields: [{ name: 'Name', dataTypeID: 0, type: 'text' }, { name: 'Version', dataTypeID: 0, type: 'text' }, { name: 'Extensions', dataTypeID: 0, type: 'text' }], rows: engine.databases().map((d) => [(d.id === engine.active()?.id ? '* ' : '') + d.name, `PostgreSQL ${d.version}`, d.extensions.join(', ')]), rowCount: engine.databases().length, affectedRows: 0 }, false)); return;
      case 'c': case 'connect': {
        const d = engine.databases().find((x) => x.name === arg);
        if (!d) { print(`database "${arg}" does not exist`, 'err'); return; }
        print('Switching…', 'muted');
        await engine.switchDatabase(d.id);
        print(`You are now connected to database "${d.name}" (PostgreSQL ${d.version}).`, 'ok');
        setPrompt();
        return;
      }
      case 'd': if (arg) { try { printResult(await engine.exec(DESCRIBE(arg))); } catch (e) { printError(e as PgError); } return; }
        try { printResult(await engine.exec(`SELECT n.nspname AS "Schema", c.relname AS "Name", CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' WHEN 'i' THEN 'index' WHEN 'S' THEN 'sequence' WHEN 'p' THEN 'partitioned table' ELSE c.relkind::text END AS "Type"
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m','S') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' ORDER BY 1, 2`)); } catch (e) { printError(e as PgError); }
        return;
      default:
        if (META[cmd]) { try { printResult(await engine.exec(META[cmd](arg))); } catch (e) { printError(e as PgError); } return; }
        print(`invalid command \\${cmd}\nTry \\? for help.`, 'err');
    }
  }

  async function submit() {
    const line = input.value;
    input.value = '';
    autosize();
    print(prompt.textContent + line, 'echo');
    if (!line.trim() && !buffer) return;
    if (!buffer && line.trim().startsWith('\\')) {
      remember(line.trim());
      await meta(line.trim());
      setPrompt();
      return;
    }
    buffer += (buffer ? '\n' : '') + line;
    if (!/;\s*$/.test(buffer)) { setPrompt(); return; }
    const sql = buffer;
    buffer = '';
    setPrompt();
    remember(sql);
    input.disabled = true;
    await runSql(sql);
    input.disabled = false;
    input.focus();
  }

  function remember(cmd: string) {
    if (history[history.length - 1] !== cmd) history.push(cmd);
    while (history.length > 200) history.shift();
    hi = history.length;
    try { localStorage.setItem('pgn-history', JSON.stringify(history)); } catch { /* ignore */ }
  }
  const recall = (d: number) => {
    if (!history.length) return;
    hi = Math.max(0, Math.min(history.length, hi + d));
    input.value = history[hi] ?? '';
    autosize();
  };
  const autosize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(160, input.scrollHeight)}px`; };
  input.oninput = autosize;
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
    else if (e.key === 'ArrowUp' && !input.value.includes('\n')) { e.preventDefault(); recall(-1); }
    else if (e.key === 'ArrowDown' && !input.value.includes('\n')) { e.preventDefault(); recall(1); }
  };

  const ins = (t: string) => { const s = input.selectionStart, e = input.selectionEnd; input.setRangeText(t, s, e, 'end'); input.focus(); autosize(); };
  const keys = h('div', { class: 'term-keys', onmousedown: (e: Event) => e.preventDefault() },
    [['↑', () => recall(-1)], ['↓', () => recall(1)], ['\\', () => ins('\\')], [';', () => ins(';')], ['*', () => ins('*')], ['(', () => ins('(')], [')', () => ins(')')], ["'", () => ins("'")], ['=', () => ins('=')], [',', () => ins(',')], ['\\dt', () => { input.value = '\\dt'; void submit(); }], ['\\d', () => ins('\\d ')], ['\\dx', () => { input.value = '\\dx'; void submit(); }], ['\\?', () => { input.value = '\\?'; void submit(); }]]
      .map(([t, fn]) => h('button', { onclick: fn as () => void }, t as string)));

  print(`PG Notebook terminal — ${engine.getState().version?.split(' on ')[0] ?? 'PostgreSQL'}\nType \\? for help. End SQL with ;`, 'muted');
  setPrompt();
  engine.onState(() => setPrompt());

  const view = h('div', { class: 'term' },
    screen,
    h('div', { class: 'term-row' }, prompt, input, h('button', { class: 'term-send', 'aria-label': 'Run', onclick: () => void submit() }, '⏎')),
    keys);
  view.addEventListener('click', (e) => { if (e.target === screen || (e.target as HTMLElement).classList.contains('term-line')) { if (!getSelection()?.toString()) input.focus(); } });
  return view;
}
