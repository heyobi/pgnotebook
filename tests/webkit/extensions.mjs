// Installs every bundled extension on one PostgreSQL major inside WebKit (the iOS engine) using the production build.
// Usage: npx vite preview & node tests/webkit/extensions.mjs 18
import { webkit } from 'playwright';
const v = +process.argv[2];
const b = await webkit.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:4173/?pro&selftest'); await p.waitForTimeout(7000);
const log = await p.evaluate(async (v) => {
  const E = window.__engine; const log = [];
  const step = async (name, fn) => { try { const r = await fn(); log.push(name + ' ok' + (r ? ' ' + r : '')); return true; } catch (e) { log.push(name + ' ERR ' + (e.message || JSON.stringify(e)).slice(0, 120)); return false; } };
  await step('ready', () => E.ready());
  let db; await step('create', async () => { db = await E.createDatabase('t' + v, v); });
  await step('switch', () => E.switchDatabase(db.id));
  log.push('version ' + (E.getState().version || '').slice(0, 25));
  const all = ['postgis','vector','age','pgcrypto','pg_trgm','fuzzystrmatch','unaccent','pg_textsearch','dict_int','dict_xsyn','hstore','ltree','citext','cube','earthdistance','seg','isn','intarray','lo','uuid_ossp','pg_uuidv7','pg_hashids','tablefunc','btree_gin','btree_gist','bloom','pg_ivm','pgmq','pgtap','tsm_system_rows','tsm_system_time','pageinspect','pg_buffercache','pg_visibility','amcheck'];
  const v16 = ['vector','pg_trgm','fuzzystrmatch','hstore','ltree','citext','cube','earthdistance','seg','isn','lo','uuid_ossp','tablefunc','btree_gin','btree_gist','bloom','tsm_system_rows','tsm_system_time','amcheck'];
  const ids = v === 16 ? v16 : v === 17 ? all.filter(i => i !== 'pgmq') : all;
  const fails = [];
  for (const id of ids) { try { await E.installExtension(id); } catch (e) { fails.push(id + ': ' + (e.message || JSON.stringify(e)).slice(0, 100)); } }
  log.push(`installed ${ids.length - fails.length}/${ids.length}`);
  log.push(...fails);
  if (v !== 16) await step('postgis query', async () => JSON.stringify((await E.exec('select postgis_version()')).results[0].rows));
  await step('vector query', async () => JSON.stringify((await E.exec("select '[1,2]'::vector <-> '[2,2]' d")).results[0].rows));
  return log;
}, v);
console.log(JSON.stringify(log, null, 1));
await b.close();
const bad = log.filter((l) => / ERR |: /.test(l) && !l.startsWith('version'));
if (bad.length || !log.some((l) => /^installed (\d+)\/\1$/.test(l))) { console.error(`PostgreSQL ${v}: extension check failed`); process.exit(1); }
