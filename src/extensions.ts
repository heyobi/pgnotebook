// Catalog of PostgreSQL extensions bundled with the app. Nothing is downloaded at run time.
// `sql` = names used in CREATE EXTENSION. `versions` = PostgreSQL majors whose build ships it.
// `example` = a short notebook that shows the extension off (opened from the extension's page).

export type PgVersion = 16 | 17 | 18;
export const PG_VERSIONS: { v: PgVersion; label: string; note: string }[] = [
  { v: 18, label: 'PostgreSQL 18.6', note: 'Latest. All extensions.' },
  { v: 17, label: 'PostgreSQL 17.5', note: 'Most extensions, including PostGIS.' },
  { v: 16, label: 'PostgreSQL 16.4', note: 'Core contrib extensions and pgvector.' },
];

export type ExtCategory = 'Featured' | 'Geospatial' | 'AI & vectors' | 'Graph' | 'Search & text' | 'Data types' | 'Indexing' | 'Security' | 'Testing & admin';

export interface ExtInfo {
  id: string;
  sql: string[];
  title: string;
  tagline: string;
  about: string;
  category: ExtCategory;
  featured?: boolean;
  sizeKb: number;
  license: string;
  versions: PgVersion[];
  requires?: string[];
  homepage?: string;
  example?: { title: string; cells: ['md' | 'sql', string][] };
}

const ALL3: PgVersion[] = [16, 17, 18];
const NEW2: PgVersion[] = [17, 18];

export const EXTENSIONS: ExtInfo[] = [
  {
    id: 'postgis', sql: ['postgis'], title: 'PostGIS', category: 'Geospatial', featured: true, sizeKb: 20400, license: 'GPL-2.0-or-later', versions: NEW2,
    homepage: 'postgis.net',
    tagline: 'Maps, geometry and spatial queries',
    about: 'Adds geometry and geography types, 1000+ spatial functions (distance, area, buffers, intersections, transformations) and spatial indexes. Results with geometry columns can be shown on a map.',
    example: {
      title: 'PostGIS: cities on a map',
      cells: [
        ['md', '# PostGIS\nGeometry columns can be shown on a **map**: run a cell, then tap **Map** above the result.'],
        ['sql', 'CREATE EXTENSION IF NOT EXISTS postgis;'],
        ['sql', `CREATE TABLE IF NOT EXISTS cities (name text PRIMARY KEY, geom geometry(Point, 4326));
INSERT INTO cities VALUES
  ('Istanbul', 'POINT(28.98 41.01)'), ('Ankara', 'POINT(32.86 39.93)'), ('Izmir', 'POINT(27.14 38.42)'),
  ('Berlin', 'POINT(13.40 52.52)'), ('London', 'POINT(-0.13 51.51)'), ('New York', 'POINT(-74.01 40.71)'),
  ('Tokyo', 'POINT(139.69 35.69)'), ('Cairo', 'POINT(31.24 30.04)'), ('São Paulo', 'POINT(-46.63 -23.55)')
ON CONFLICT DO NOTHING;`],
        ['sql', 'SELECT name, geom FROM cities;'],
        ['md', 'Distances on the globe use the `geography` type:'],
        ['sql', `SELECT a.name AS from_city, b.name AS to_city,
       round((ST_Distance(a.geom::geography, b.geom::geography) / 1000)::numeric) AS km
FROM cities a JOIN cities b ON a.name < b.name
ORDER BY km LIMIT 10;`],
        ['md', 'A 1000 km circle around Istanbul and the cities inside it:'],
        ['sql', `SELECT 'Istanbul +1000 km' AS name, ST_Buffer('POINT(28.98 41.01)'::geography, 1000000)::geometry AS geom
UNION ALL
SELECT name, geom FROM cities WHERE ST_DWithin(geom::geography, 'POINT(28.98 41.01)'::geography, 1000000);`],
      ],
    },
  },
  {
    id: 'vector', sql: ['vector'], title: 'pgvector', category: 'AI & vectors', featured: true, sizeKb: 52, license: 'PostgreSQL', versions: ALL3,
    homepage: 'github.com/pgvector/pgvector',
    tagline: 'Vector similarity search for AI embeddings',
    about: 'Store embeddings next to your data and find nearest neighbours by L2, cosine or inner-product distance, with HNSW and IVFFlat indexes. Vector columns can be shown as a 2-D plot.',
    example: {
      title: 'pgvector: semantic neighbours',
      cells: [
        ['md', '# pgvector\nEmbeddings are lists of numbers that place similar things close together. These are tiny hand-made 4-D ones. Tap **Plot** above a result to see vectors in 2-D.'],
        ['sql', `CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS words (word text PRIMARY KEY, embedding vector(4));
INSERT INTO words VALUES
  ('cat', '[0.9,0.8,0.1,0.0]'), ('dog', '[0.85,0.9,0.15,0.05]'), ('kitten', '[0.95,0.7,0.05,0.0]'),
  ('car', '[0.1,0.05,0.9,0.8]'), ('truck', '[0.05,0.1,0.95,0.9]'), ('bike', '[0.2,0.1,0.7,0.6]'),
  ('apple', '[0.3,0.1,0.1,0.95]'), ('banana', '[0.25,0.15,0.05,0.9]')
ON CONFLICT DO NOTHING;`],
        ['sql', 'SELECT word, embedding FROM words;'],
        ['md', 'Five nearest neighbours of **cat** by cosine distance (`<=>`):'],
        ['sql', `SELECT word, round((embedding <=> (SELECT embedding FROM words WHERE word = 'cat'))::numeric, 4) AS distance
FROM words WHERE word <> 'cat'
ORDER BY distance LIMIT 5;`],
        ['sql', `CREATE INDEX IF NOT EXISTS words_hnsw ON words USING hnsw (embedding vector_cosine_ops);
EXPLAIN SELECT word FROM words ORDER BY embedding <=> '[0.1,0.1,0.9,0.85]' LIMIT 3;`],
      ],
    },
  },
  {
    id: 'age', sql: ['age'], title: 'Apache AGE', category: 'Graph', featured: true, sizeKb: 140, license: 'Apache-2.0', versions: NEW2,
    homepage: 'age.apache.org',
    tagline: 'Graph database with openCypher',
    about: 'Store nodes and edges and query them with openCypher (the Neo4j query language) from SQL.',
    example: {
      title: 'Apache AGE: a social graph',
      cells: [
        ['md', '# Apache AGE\nEvery cell starts with `LOAD` and `SET search_path`, which AGE needs in each session.'],
        ['sql', `CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT create_graph('social') WHERE NOT EXISTS (SELECT 1 FROM ag_graph WHERE name = 'social');`],
        ['sql', `LOAD 'age'; SET search_path = ag_catalog, "$user", public;
SELECT * FROM cypher('social', $$
  CREATE (ada:Person {name: 'Ada'}), (alan:Person {name: 'Alan'}), (grace:Person {name: 'Grace'}), (linus:Person {name: 'Linus'}),
         (ada)-[:KNOWS]->(alan), (alan)-[:KNOWS]->(grace), (grace)-[:KNOWS]->(linus)
$$) AS (v agtype);`],
        ['sql', `LOAD 'age'; SET search_path = ag_catalog, "$user", public;
SELECT * FROM cypher('social', $$
  MATCH (a:Person {name: 'Ada'})-[:KNOWS*1..3]->(f) RETURN f.name
$$) AS (reachable agtype);`],
      ],
    },
  },
  {
    id: 'pgcrypto', sql: ['pgcrypto'], title: 'pgcrypto', category: 'Security', featured: true, sizeKb: 1150, license: 'PostgreSQL', versions: NEW2,
    tagline: 'Hashing, encryption, password hashing',
    about: 'Cryptographic functions: digest(), hmac(), crypt() with bcrypt, symmetric and PGP encryption, gen_random_bytes().',
    example: { title: 'pgcrypto: hashes and passwords', cells: [
      ['sql', 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'],
      ['sql', `SELECT encode(digest('hello', 'sha256'), 'hex') AS sha256,
       crypt('secret', gen_salt('bf')) AS bcrypt_hash;`],
      ['sql', `SELECT crypt('secret', h) = h AS password_ok FROM (SELECT crypt('secret', gen_salt('bf')) AS h) s;`],
    ] },
  },
  {
    id: 'pg_trgm', sql: ['pg_trgm'], title: 'pg_trgm', category: 'Search & text', featured: true, sizeKb: 40, license: 'PostgreSQL', versions: ALL3,
    tagline: 'Fuzzy search and fast LIKE',
    about: 'Trigram similarity for typo-tolerant search, plus GIN/GiST indexes that speed up LIKE, ILIKE and regex searches.',
    example: { title: 'pg_trgm: typo-tolerant search', cells: [
      ['sql', `CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS products (name text);
INSERT INTO products VALUES ('iPhone'), ('iPad'), ('MacBook Pro'), ('Magic Mouse'), ('AirPods');`],
      ['sql', `SELECT name, round(similarity(name, 'macbok')::numeric, 2) AS score
FROM products ORDER BY score DESC LIMIT 3;`],
    ] },
  },
  {
    id: 'uuid_ossp', sql: ['uuid-ossp'], title: 'uuid-ossp', category: 'Data types', featured: true, sizeKb: 20, license: 'PostgreSQL', versions: ALL3,
    tagline: 'UUID generators v1, v3, v4, v5',
    about: 'Functions to generate universally unique identifiers.',
    example: { title: 'uuid-ossp', cells: [['sql', 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\nSELECT uuid_generate_v4(), uuid_generate_v5(uuid_ns_url(), \'https://postgresql.org\');']] },
  },
  {
    id: 'hstore', sql: ['hstore'], title: 'hstore', category: 'Data types', sizeKb: 40, license: 'PostgreSQL', versions: ALL3,
    tagline: 'Key/value pairs in one column', about: 'A key/value map type with operators and index support.',
    example: { title: 'hstore', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS hstore;\nSELECT 'color=>red, size=>XL'::hstore -> 'size' AS size;`]] },
  },
  {
    id: 'ltree', sql: ['ltree'], title: 'ltree', category: 'Data types', sizeKb: 40, license: 'PostgreSQL', versions: ALL3,
    tagline: 'Tree paths like a.b.c', about: 'Hierarchical labels with fast ancestor/descendant queries.',
    example: { title: 'ltree: categories', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS ltree;
CREATE TABLE IF NOT EXISTS cats (path ltree);
INSERT INTO cats VALUES ('shop'), ('shop.phones'), ('shop.phones.iphone'), ('shop.laptops');
SELECT path FROM cats WHERE path <@ 'shop.phones';`]] },
  },
  { id: 'citext', sql: ['citext'], title: 'citext', category: 'Data types', sizeKb: 20, license: 'PostgreSQL', versions: ALL3, tagline: 'Case-insensitive text', about: 'A text type that compares case-insensitively — handy for e-mail addresses.',
    example: { title: 'citext', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS citext;\nSELECT 'Ada@Example.com'::citext = 'ada@example.com' AS same;`]] } },
  { id: 'tablefunc', sql: ['tablefunc'], title: 'tablefunc', category: 'Data types', sizeKb: 20, license: 'PostgreSQL', versions: ALL3, tagline: 'Pivot tables with crosstab()', about: 'crosstab() for pivot tables, normal_rand() and connectby().',
    example: { title: 'tablefunc: crosstab', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS tablefunc;
SELECT * FROM crosstab(
  $$SELECT city, quarter, sales FROM (VALUES ('Ankara','Q1',10),('Ankara','Q2',15),('Izmir','Q1',7),('Izmir','Q2',12)) t(city,quarter,sales) ORDER BY 1,2$$
) AS ct(city text, q1 int, q2 int);`]] } },
  { id: 'fuzzystrmatch', sql: ['fuzzystrmatch'], title: 'fuzzystrmatch', category: 'Search & text', sizeKb: 30, license: 'PostgreSQL', versions: ALL3, tagline: 'Levenshtein, Soundex, Metaphone', about: 'String similarity and phonetic matching.',
    example: { title: 'fuzzystrmatch', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;\nSELECT levenshtein('kitten', 'sitting'), soundex('Robert'), soundex('Rupert');`]] } },
  { id: 'unaccent', sql: ['unaccent'], title: 'unaccent', category: 'Search & text', sizeKb: 20, license: 'PostgreSQL', versions: NEW2, tagline: 'Remove accents', about: 'Strips accents so "Türkçe" matches "Turkce" in searches.',
    example: { title: 'unaccent', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS unaccent;\nSELECT unaccent('Çağrı Öztürk — São Paulo');`]] } },
  { id: 'pg_textsearch', sql: ['pg_textsearch'], title: 'pg_textsearch', category: 'Search & text', sizeKb: 152, license: 'PostgreSQL', versions: NEW2, tagline: 'BM25 ranked full-text search', about: 'Relevance-ranked (BM25) full-text search indexes.' },
  { id: 'dict_int', sql: ['dict_int'], title: 'dict_int', category: 'Search & text', sizeKb: 10, license: 'PostgreSQL', versions: NEW2, tagline: 'Text-search dictionary for integers', about: 'Controls how integers are indexed in full-text search.' },
  { id: 'dict_xsyn', sql: ['dict_xsyn'], title: 'dict_xsyn', category: 'Search & text', sizeKb: 10, license: 'PostgreSQL', versions: NEW2, tagline: 'Synonym dictionary', about: 'Extended synonym dictionary for full-text search.' },
  { id: 'cube', sql: ['cube'], title: 'cube', category: 'Data types', sizeKb: 30, license: 'PostgreSQL', versions: ALL3, tagline: 'Multi-dimensional cubes', about: 'Points and boxes in n dimensions.' },
  { id: 'earthdistance', sql: ['earthdistance'], title: 'earthdistance', category: 'Geospatial', sizeKb: 10, license: 'PostgreSQL', versions: ALL3, requires: ['cube'], tagline: 'Great-circle distances', about: 'Simple distances on the Earth without PostGIS.',
    example: { title: 'earthdistance', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS cube;\nCREATE EXTENSION IF NOT EXISTS earthdistance;\nSELECT round((earth_distance(ll_to_earth(41.01, 28.98), ll_to_earth(39.93, 32.86)) / 1000)::numeric) AS istanbul_ankara_km;`]] } },
  { id: 'seg', sql: ['seg'], title: 'seg', category: 'Data types', sizeKb: 20, license: 'PostgreSQL', versions: ALL3, tagline: 'Intervals and measurements', about: 'Line segments / floating-point intervals with uncertainty.' },
  { id: 'isn', sql: ['isn'], title: 'isn', category: 'Data types', sizeKb: 40, license: 'PostgreSQL', versions: ALL3, tagline: 'ISBN, EAN13, UPC', about: 'Validated product and book numbers.' },
  { id: 'intarray', sql: ['intarray'], title: 'intarray', category: 'Data types', sizeKb: 30, license: 'PostgreSQL', versions: NEW2, tagline: 'Integer array operators', about: 'Fast functions and indexes for integer arrays.' },
  { id: 'lo', sql: ['lo'], title: 'lo', category: 'Data types', sizeKb: 10, license: 'PostgreSQL', versions: ALL3, tagline: 'Large object maintenance', about: 'Helpers for large objects.' },
  { id: 'pg_uuidv7', sql: ['pg_uuidv7'], title: 'pg_uuidv7', category: 'Data types', sizeKb: 4, license: 'MPL-2.0', versions: NEW2, tagline: 'Time-ordered UUIDv7', about: 'Sortable UUIDs that index well.',
    example: { title: 'pg_uuidv7', cells: [['sql', 'CREATE EXTENSION IF NOT EXISTS pg_uuidv7;\nSELECT uuid_generate_v7() FROM generate_series(1, 3);']] } },
  { id: 'pg_hashids', sql: ['pg_hashids'], title: 'pg_hashids', category: 'Data types', sizeKb: 4, license: 'MIT', versions: NEW2, tagline: 'Short ids from integers', about: 'YouTube-style short ids from numbers.' },
  { id: 'btree_gin', sql: ['btree_gin'], title: 'btree_gin', category: 'Indexing', sizeKb: 30, license: 'PostgreSQL', versions: ALL3, tagline: 'GIN for scalar types', about: 'Lets GIN indexes include ordinary columns.' },
  { id: 'btree_gist', sql: ['btree_gist'], title: 'btree_gist', category: 'Indexing', sizeKb: 60, license: 'PostgreSQL', versions: ALL3, tagline: 'GiST for scalar types', about: 'Needed for exclusion constraints on ordinary columns (e.g. no overlapping bookings).' },
  { id: 'bloom', sql: ['bloom'], title: 'bloom', category: 'Indexing', sizeKb: 20, license: 'PostgreSQL', versions: ALL3, tagline: 'Bloom filter indexes', about: 'Space-efficient index over many columns.' },
  { id: 'pg_ivm', sql: ['pg_ivm'], title: 'pg_ivm', category: 'Indexing', sizeKb: 28, license: 'PostgreSQL', versions: NEW2, tagline: 'Live materialized views', about: 'Materialized views that update incrementally as data changes.' },
  { id: 'pgmq', sql: ['pgmq'], title: 'pgmq', category: 'Testing & admin', sizeKb: 44, license: 'PostgreSQL', versions: [18], tagline: 'Message queue', about: 'A lightweight message queue like SQS, inside PostgreSQL.',
    example: { title: 'pgmq: a queue', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS pgmq;\nSELECT pgmq.create('jobs');\nSELECT pgmq.send('jobs', '{"task":"email"}');\nSELECT msg_id, message FROM pgmq.read('jobs', 30, 1);`]] } },
  { id: 'pgtap', sql: ['pgtap'], title: 'pgTAP', category: 'Testing & admin', sizeKb: 236, license: 'PostgreSQL', versions: NEW2, tagline: 'Unit tests in SQL', about: 'TAP-style assertions for schemas, functions and data.',
    example: { title: 'pgTAP', cells: [['sql', `CREATE EXTENSION IF NOT EXISTS pgtap;\nSELECT plan(2);\nSELECT ok(1 + 1 = 2, 'math works');\nSELECT has_function('now');\nSELECT * FROM finish();`]] } },
  { id: 'tsm_system_rows', sql: ['tsm_system_rows'], title: 'tsm_system_rows', category: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL', versions: ALL3, tagline: 'TABLESAMPLE by rows', about: 'Sample a fixed number of rows.' },
  { id: 'tsm_system_time', sql: ['tsm_system_time'], title: 'tsm_system_time', category: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL', versions: ALL3, tagline: 'TABLESAMPLE by time', about: 'Sample for a fixed number of milliseconds.' },
  { id: 'pageinspect', sql: ['pageinspect'], title: 'pageinspect', category: 'Testing & admin', sizeKb: 40, license: 'PostgreSQL', versions: NEW2, tagline: 'Look inside data pages', about: 'Low-level view of heap and index pages — great for learning internals.' },
  { id: 'pg_buffercache', sql: ['pg_buffercache'], title: 'pg_buffercache', category: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL', versions: NEW2, tagline: 'Shared buffer contents', about: 'See what is in the buffer cache.' },
  { id: 'pg_visibility', sql: ['pg_visibility'], title: 'pg_visibility', category: 'Testing & admin', sizeKb: 10, license: 'PostgreSQL', versions: NEW2, tagline: 'Visibility map', about: 'Inspect the visibility map.' },
  { id: 'amcheck', sql: ['amcheck'], title: 'amcheck', category: 'Testing & admin', sizeKb: 30, license: 'PostgreSQL', versions: ALL3, tagline: 'Verify indexes', about: 'Check B-tree and heap integrity.' },
];

export const CATEGORIES: ExtCategory[] = ['Geospatial', 'AI & vectors', 'Graph', 'Search & text', 'Data types', 'Security', 'Indexing', 'Testing & admin'];

export const extById = (id: string) => EXTENSIONS.find((e) => e.id === id);

/** Extension for a name used in CREATE EXTENSION, if bundled. */
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

export function withDeps(ids: string[]): string[] {
  const s = new Set(ids);
  for (const id of ids) for (const r of extById(id)?.requires ?? []) s.add(r);
  return [...s];
}
