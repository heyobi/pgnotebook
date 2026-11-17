/// <reference lib="webworker" />
// Shared PostgreSQL worker logic. Each PG major has a tiny entry file (pg16/17/18.worker.ts) that passes its PGlite
// class and the extensions its build ships. Request/response protocol: see engine.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Req =
  | { id: number; op: 'init'; ext: string[]; dump?: Blob | null }
  | { id: number; op: 'exec'; sql: string }
  | { id: number; op: 'dump' }
  | { id: number; op: 'meta' }
  | { id: number; op: 'close' };

const typeNames = new Map<number, string>();

function plain(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (v instanceof Uint8Array) return { $bytes: Array.from(v.subarray(0, 64)), length: v.length };
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(plain);
  return v;
}

const FN_SQL = `select distinct p.proname as name from pg_proc p
  where p.prokind in ('f','a','w') and left(p.proname, 1) <> '_'
    and p.proname !~ '(_in|_out|_recv|_send|_typmod_in|_typmod_out|_analyze|_support|_handler)$'
  order by 1`;

const COLS_SQL = `select case when table_schema = 'public' then table_name else table_schema || '.' || table_name end as t,
       column_name as c
  from information_schema.columns
 where table_schema not in ('pg_catalog', 'information_schema', 'ag_catalog', 'tiger', 'topology')
 order by table_schema, table_name, ordinal_position`;

export function serve(PGlite: any, available: Record<string, any>) {
  let db: any = null;

  async function names(oids: number[]) {
    const missing = [...new Set(oids)].filter((o) => !typeNames.has(o));
    if (!missing.length) return;
    try {
      const r = await db.query('select oid::int as oid, typname from pg_type where oid = any($1::oid[])', [missing]);
      for (const row of r.rows) typeNames.set(row.oid, row.typname);
    } catch {
      /* type names are cosmetic */
    }
  }

  async function handle(req: Req): Promise<unknown> {
    switch (req.op) {
      case 'init': {
        if (db) await db.close().catch(() => {});
        typeNames.clear();
        const extensions: Record<string, any> = {};
        for (const id of req.ext) if (available[id]) extensions[id] = available[id];
        const t0 = performance.now();
        const opts: any = { extensions, relaxedDurability: true };
        if (req.dump && req.dump.size > 0) opts.loadDataDir = req.dump;
        db = await PGlite.create(opts);
        const v = await db.query('select version()');
        return { ms: Math.round(performance.now() - t0), version: v.rows[0].version, available: Object.keys(available) };
      }
      case 'exec': {
        if (!db) throw new Error('Database is not running');
        const notices: { severity: string; message: string }[] = [];
        const t0 = performance.now();
        const asText = (v: string) => v;
        const results = await db.exec(req.sql, {
          parsers: { 1082: asText, 1083: asText, 1114: asText, 1184: asText, 1186: asText, 1266: asText },
          onNotice: (n: any) => notices.push({ severity: n.severity ?? 'NOTICE', message: n.message ?? '' }),
        });
        const ms = performance.now() - t0;
        await names(results.flatMap((r: any) => r.fields.map((f: any) => f.dataTypeID)));
        return {
          ms,
          notices,
          results: results.map((r: any) => ({
            fields: r.fields.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID, type: typeNames.get(f.dataTypeID) ?? '' })),
            rows: r.rows.slice(0, 5000).map((row: any) => r.fields.map((f: any) => plain(row[f.name]))),
            rowCount: r.rows.length,
            affectedRows: r.affectedRows ?? 0,
          })),
        };
      }
      case 'dump': {
        if (!db) throw new Error('Database is not running');
        return await db.dumpDataDir('gzip');
      }
      case 'meta': {
        if (!db) return { schema: {}, functions: [], installed: [] };
        const cols = await db.query(COLS_SQL);
        const schema: Record<string, string[]> = {};
        for (const row of cols.rows) (schema[row.t] ??= []).push(row.c);
        const fn = await db.query(FN_SQL);
        const ext = await db.query('select extname as name, extversion as version from pg_extension');
        return { schema, functions: fn.rows.map((r: any) => r.name), installed: ext.rows };
      }
      case 'close': {
        if (db) await db.close();
        db = null;
        return true;
      }
    }
  }

  self.onmessage = async (e: MessageEvent<Req>) => {
    const req = e.data;
    try {
      const result = await handle(req);
      (self as unknown as Worker).postMessage({ id: req.id, ok: true, result });
    } catch (err) {
      const x = err as { message?: string; detail?: string; hint?: string; position?: string; code?: string };
      (self as unknown as Worker).postMessage({
        id: req.id,
        ok: false,
        error: { message: x?.message ?? String(err), detail: x?.detail, hint: x?.hint, position: x?.position, code: x?.code },
      });
    }
  };
}
