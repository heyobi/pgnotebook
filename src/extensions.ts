// Catalog of PostgreSQL extensions bundled with the app.
// Every extension ships inside the app binary; nothing is downloaded at run time.
// `sql` is the name used in CREATE EXTENSION (may differ from the id).

export type ExtGroup = 'Popular' | 'Data types' | 'Search & text' | 'Indexing' | 'Testing & admin';

export interface ExtInfo {
  id: string;
  sql: string[];
  title: string;
  description: string;
  group: ExtGroup;
  sizeKb: number;
  license: string;
}

export const EXTENSIONS: ExtInfo[] = [
  { id: 'postgis', sql: ['postgis'], title: 'PostGIS', description: 'Geometry and geography types, spatial functions and indexes.', group: 'Popular', sizeKb: 20400, license: 'GPL-2.0-or-later' },
  { id: 'vector', sql: ['vector'], title: 'pgvector', description: 'Vector similarity search for embeddings (L2, cosine, inner product).', group: 'Popular', sizeKb: 52, license: 'PostgreSQL' },
  { id: 'age', sql: ['age'], title: 'Apache AGE', description: 'Graph database with openCypher queries.', group: 'Popular', sizeKb: 140, license: 'Apache-2.0' },
  { id: 'pgcrypto', sql: ['pgcrypto'], title: 'pgcrypto', description: 'Hashing, encryption and random UUIDs.', group: 'Popular', sizeKb: 60, license: 'PostgreSQL' },
  { id: 'pg_trgm', sql: ['pg_trgm'], title: 'pg_trgm', description: 'Trigram similarity and fast LIKE / ILIKE search.', group: 'Search & text', sizeKb: 40, license: 'PostgreSQL' },
  { id: 'fuzzystrmatch', sql: ['fuzzystrmatch'], title: 'fuzzystrmatch', description: 'Levenshtein, Soundex and Metaphone.', group: 'Search & text', sizeKb: 30, license: 'PostgreSQL' },
  { id: 'unaccent', sql: ['unaccent'], title: 'unaccent', description: 'Remove accents for text search.', group: 'Search & text', sizeKb: 20, license: 'PostgreSQL' },
  { id: 'pg_textsearch', sql: ['pg_textsearch'], title: 'pg_textsearch', description: 'BM25 ranked full-text search.', group: 'Search & text', sizeKb: 152, license: 'PostgreSQL' },
  { id: 'dict_int', sql: ['dict_int'], title: 'dict_int', description: 'Full-text dictionary for integers.', group: 'Search & text', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'dict_xsyn', sql: ['dict_xsyn'], title: 'dict_xsyn', description: 'Extended synonym dictionary.', group: 'Search & text', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'hstore', sql: ['hstore'], title: 'hstore', description: 'Key/value pairs in a single column.', group: 'Data types', sizeKb: 40, license: 'PostgreSQL' },
  { id: 'ltree', sql: ['ltree'], title: 'ltree', description: 'Hierarchical tree-like labels.', group: 'Data types', sizeKb: 40, license: 'PostgreSQL' },
  { id: 'citext', sql: ['citext'], title: 'citext', description: 'Case-insensitive text.', group: 'Data types', sizeKb: 20, license: 'PostgreSQL' },
  { id: 'cube', sql: ['cube'], title: 'cube', description: 'Multi-dimensional cubes.', group: 'Data types', sizeKb: 30, license: 'PostgreSQL' },
  { id: 'earthdistance', sql: ['earthdistance'], title: 'earthdistance', description: 'Great-circle distances (needs cube).', group: 'Data types', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'seg', sql: ['seg'], title: 'seg', description: 'Line segments and floating-point intervals.', group: 'Data types', sizeKb: 20, license: 'PostgreSQL' },
  { id: 'isn', sql: ['isn'], title: 'isn', description: 'ISBN, ISSN, EAN13 and UPC types.', group: 'Data types', sizeKb: 40, license: 'PostgreSQL' },
  { id: 'intarray', sql: ['intarray'], title: 'intarray', description: 'Functions and indexes for integer arrays.', group: 'Data types', sizeKb: 30, license: 'PostgreSQL' },
  { id: 'lo', sql: ['lo'], title: 'lo', description: 'Large object maintenance.', group: 'Data types', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'uuid_ossp', sql: ['uuid-ossp'], title: 'uuid-ossp', description: 'UUID generators (v1, v3, v4, v5).', group: 'Data types', sizeKb: 20, license: 'PostgreSQL' },
  { id: 'pg_uuidv7', sql: ['pg_uuidv7'], title: 'pg_uuidv7', description: 'Time-ordered UUIDv7.', group: 'Data types', sizeKb: 4, license: 'MPL-2.0' },
  { id: 'pg_hashids', sql: ['pg_hashids'], title: 'pg_hashids', description: 'Short unique ids from integers.', group: 'Data types', sizeKb: 4, license: 'MIT' },
  { id: 'tablefunc', sql: ['tablefunc'], title: 'tablefunc', description: 'crosstab() pivot tables and more.', group: 'Data types', sizeKb: 20, license: 'PostgreSQL' },
  { id: 'btree_gin', sql: ['btree_gin'], title: 'btree_gin', description: 'GIN operator classes for B-tree types.', group: 'Indexing', sizeKb: 30, license: 'PostgreSQL' },
  { id: 'btree_gist', sql: ['btree_gist'], title: 'btree_gist', description: 'GiST operator classes for B-tree types.', group: 'Indexing', sizeKb: 60, license: 'PostgreSQL' },
  { id: 'bloom', sql: ['bloom'], title: 'bloom', description: 'Bloom filter index access method.', group: 'Indexing', sizeKb: 20, license: 'PostgreSQL' },
  { id: 'pg_ivm', sql: ['pg_ivm'], title: 'pg_ivm', description: 'Incrementally maintained materialized views.', group: 'Indexing', sizeKb: 28, license: 'PostgreSQL' },
  { id: 'pgmq', sql: ['pgmq'], title: 'pgmq', description: 'Lightweight message queue.', group: 'Testing & admin', sizeKb: 44, license: 'PostgreSQL' },
  { id: 'pgtap', sql: ['pgtap'], title: 'pgTAP', description: 'Unit tests written in SQL.', group: 'Testing & admin', sizeKb: 236, license: 'PostgreSQL' },
  { id: 'tsm_system_rows', sql: ['tsm_system_rows'], title: 'tsm_system_rows', description: 'TABLESAMPLE by row count.', group: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'tsm_system_time', sql: ['tsm_system_time'], title: 'tsm_system_time', description: 'TABLESAMPLE by time limit.', group: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'pageinspect', sql: ['pageinspect'], title: 'pageinspect', description: 'Look inside data pages.', group: 'Testing & admin', sizeKb: 40, license: 'PostgreSQL' },
  { id: 'pg_buffercache', sql: ['pg_buffercache'], title: 'pg_buffercache', description: 'Inspect the shared buffer cache.', group: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'pg_visibility', sql: ['pg_visibility'], title: 'pg_visibility', description: 'Visibility map inspection.', group: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL' },
  { id: 'amcheck', sql: ['amcheck'], title: 'amcheck', description: 'Verify index and heap integrity.', group: 'Testing & admin', sizeKb: 30, license: 'PostgreSQL' },
];

export const DEFAULT_EXTENSIONS = ['vector', 'pgcrypto', 'pg_trgm', 'hstore', 'uuid_ossp'];

/** Extension id for a name used in CREATE EXTENSION, if bundled. */
export function extForSqlName(name: string): ExtInfo | undefined {
  const n = name.replace(/^"|"$/g, '').toLowerCase();
  return EXTENSIONS.find((e) => e.sql.includes(n));
}

/** Names in `CREATE EXTENSION ...` statements of a script. */
export function createdExtensions(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+extension\s+(?:if\s+not\s+exists\s+)?("?[\w-]+"?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) out.push(m[1].replace(/"/g, '').toLowerCase());
  return out;
}
