/// <reference lib="webworker" />
// Runs PostgreSQL (PGlite) off the UI thread. Tiny request/response protocol, see engine.ts.
import { PGlite, type Extensions } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { vector } from '@electric-sql/pglite-pgvector';
import { age } from '@electric-sql/pglite-age';
import { pgtap } from '@electric-sql/pglite-pgtap';
import { pg_uuidv7 } from '@electric-sql/pglite-pg_uuidv7';
import { pg_hashids } from '@electric-sql/pglite-pg_hashids';
import { pg_ivm } from '@electric-sql/pglite-pg_ivm';
import { pgmq } from '@electric-sql/pglite-pgmq';
import { pg_textsearch } from '@electric-sql/pglite-pg_textsearch';
import { amcheck } from '@electric-sql/pglite/contrib/amcheck';
import { bloom } from '@electric-sql/pglite/contrib/bloom';
import { btree_gin } from '@electric-sql/pglite/contrib/btree_gin';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { cube } from '@electric-sql/pglite/contrib/cube';
import { dict_int } from '@electric-sql/pglite/contrib/dict_int';
import { dict_xsyn } from '@electric-sql/pglite/contrib/dict_xsyn';
import { earthdistance } from '@electric-sql/pglite/contrib/earthdistance';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import { hstore } from '@electric-sql/pglite/contrib/hstore';
import { intarray } from '@electric-sql/pglite/contrib/intarray';
import { isn } from '@electric-sql/pglite/contrib/isn';
import { lo } from '@electric-sql/pglite/contrib/lo';
import { ltree } from '@electric-sql/pglite/contrib/ltree';
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect';
import { pg_buffercache } from '@electric-sql/pglite/contrib/pg_buffercache';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pg_visibility } from '@electric-sql/pglite/contrib/pg_visibility';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { seg } from '@electric-sql/pglite/contrib/seg';
import { tablefunc } from '@electric-sql/pglite/contrib/tablefunc';
import { tsm_system_rows } from '@electric-sql/pglite/contrib/tsm_system_rows';
import { tsm_system_time } from '@electric-sql/pglite/contrib/tsm_system_time';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const ALL: Extensions = {
  postgis, vector, age, pgtap, pg_uuidv7, pg_hashids, pg_ivm, pgmq, pg_textsearch,
  amcheck, bloom, btree_gin, btree_gist, citext, cube, dict_int, dict_xsyn, earthdistance, fuzzystrmatch,
  hstore, intarray, isn, lo, ltree, pageinspect, pg_buffercache, pg_trgm, pg_visibility, pgcrypto, seg,
  tablefunc, tsm_system_rows, tsm_system_time, unaccent, uuid_ossp,
};

let db: PGlite | null = null;

type Req =
  | { id: number; op: 'init'; ext: string[]; dump?: Blob | null }
  | { id: number; op: 'exec'; sql: string }
  | { id: number; op: 'dump' }
  | { id: number; op: 'schema' }
  | { id: number; op: 'close' };

function plain(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (v instanceof Uint8Array) return { $bytes: Array.from(v.subarray(0, 64)), length: v.length };
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') return v;
  return v;
}

async function handle(req: Req): Promise<unknown> {
  switch (req.op) {
    case 'init': {
      if (db) await db.close().catch(() => {});
      const extensions: Extensions = {};
      for (const id of req.ext) if (ALL[id]) extensions[id] = ALL[id];
      const t0 = performance.now();
      db = await PGlite.create({ extensions, loadDataDir: req.dump ?? undefined, relaxedDurability: true });
      const v = await db.query<{ version: string }>('select version()');
      return { ms: Math.round(performance.now() - t0), version: v.rows[0].version };
    }
    case 'exec': {
      if (!db) throw new Error('Database is not running');
      const notices: { severity: string; message: string }[] = [];
      const t0 = performance.now();
      const asText = (v: string) => v;
      const results = await db.exec(req.sql, {
        // Show date/time values exactly as PostgreSQL prints them instead of converting to JS Dates.
        parsers: { 1082: asText, 1083: asText, 1114: asText, 1184: asText, 1186: asText, 1266: asText },
        onNotice: (n: { severity?: string; message?: string }) => notices.push({ severity: n.severity ?? 'NOTICE', message: n.message ?? '' }),
      } as never);
      const ms = performance.now() - t0;
      return {
        ms,
        notices,
        results: results.map((r) => ({
          fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
          rows: r.rows.slice(0, 2000).map((row) => {
            const o = row as Record<string, unknown>;
            return r.fields.map((f) => plain(o[f.name]));
          }),
          rowCount: r.rows.length,
          affectedRows: r.affectedRows ?? 0,
        })),
      };
    }
    case 'dump': {
      if (!db) throw new Error('Database is not running');
      return await db.dumpDataDir('gzip');
    }
    case 'schema': {
      if (!db) return {};
      const r = await db.query<{ t: string; c: string }>(
        `select case when table_schema = 'public' then table_name else table_schema || '.' || table_name end as t, column_name as c
           from information_schema.columns
          where table_schema not in ('pg_catalog', 'information_schema') order by table_schema, table_name, ordinal_position`
      );
      const schema: Record<string, string[]> = {};
      for (const row of r.rows) (schema[row.t] ??= []).push(row.c);
      return schema;
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
