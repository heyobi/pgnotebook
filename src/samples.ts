// Built-in example notebooks. They generate their own data, so nothing is downloaded.
import type { Notebook } from './notebook';

type Sample = { key: string; title: string; subtitle: string; needs?: string[]; cells: [ 'md' | 'sql', string ][] };

export const SAMPLES: Sample[] = [
  {
    key: 'welcome',
    title: 'Welcome to PG Notebook',
    subtitle: 'Tables, joins and aggregates in 5 cells',
    cells: [
      ['md', '# Welcome\nThis is a real **PostgreSQL 18** server running on your iPhone — no network, no account.\n\nTap ▶ on a cell to run it, or **Run all** at the bottom. Everything you create is saved on the device.'],
      ['sql', `CREATE TABLE IF NOT EXISTS customers (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  city  text
);
CREATE TABLE IF NOT EXISTS orders (
  id          serial PRIMARY KEY,
  customer_id int REFERENCES customers(id),
  amount      numeric(10,2),
  ordered_at  date DEFAULT current_date
);`],
      ['sql', `INSERT INTO customers (name, city) VALUES
  ('Ada', 'London'), ('Linus', 'Helsinki'), ('Grace', 'New York'), ('Edsger', 'Rotterdam');

INSERT INTO orders (customer_id, amount, ordered_at)
SELECT 1 + (i % 4), round((random() * 200)::numeric, 2), current_date - (i % 30)
FROM generate_series(1, 200) AS i;`],
      ['sql', `SELECT c.name, c.city, count(o.*) AS orders, sum(o.amount) AS total
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY total DESC;`],
      ['md', '## Window functions\nRunning total of revenue per day:'],
      ['sql', `SELECT ordered_at, sum(amount) AS revenue,
       sum(sum(amount)) OVER (ORDER BY ordered_at) AS running_total
FROM orders
GROUP BY ordered_at
ORDER BY ordered_at
LIMIT 10;`],
    ],
  },
  {
    key: 'jsonb',
    title: 'JSON & JSONB',
    subtitle: 'Store documents, query them with SQL',
    cells: [
      ['md', '# JSONB\nPostgreSQL can store and index JSON documents next to normal columns.'],
      ['sql', `CREATE TABLE IF NOT EXISTS events (id serial PRIMARY KEY, payload jsonb);
INSERT INTO events (payload) VALUES
  ('{"type":"signup","user":{"name":"Mia","country":"TR"},"tags":["web"]}'),
  ('{"type":"purchase","user":{"name":"Leo","country":"DE"},"total":42.5,"tags":["ios","promo"]}'),
  ('{"type":"purchase","user":{"name":"Mia","country":"TR"},"total":13,"tags":["ios"]}');`],
      ['sql', `SELECT payload->'user'->>'name' AS user,
       payload->>'type' AS type,
       (payload->>'total')::numeric AS total
FROM events
WHERE payload @> '{"tags":["ios"]}';`],
      ['sql', `SELECT jsonb_pretty(jsonb_agg(payload->'user')) FROM events;`],
    ],
  },
  {
    key: 'postgis',
    title: 'PostGIS basics',
    subtitle: 'Points, distances and buffers',
    needs: ['postgis'],
    cells: [
      ['md', '# PostGIS\nTurn on **PostGIS** in *Extensions* first (it is 20 MB, so it is off by default).'],
      ['sql', `CREATE EXTENSION IF NOT EXISTS postgis;
SELECT postgis_version();`],
      ['sql', `CREATE TABLE IF NOT EXISTS cities (name text, geom geography(Point, 4326));
INSERT INTO cities VALUES
  ('Istanbul', 'POINT(28.9784 41.0082)'),
  ('Ankara',   'POINT(32.8597 39.9334)'),
  ('Izmir',    'POINT(27.1428 38.4237)'),
  ('Berlin',   'POINT(13.4050 52.5200)'),
  ('London',   'POINT(-0.1276 51.5072)');`],
      ['md', 'Distance between every pair of cities, in kilometres:'],
      ['sql', `SELECT a.name AS from_city, b.name AS to_city,
       round((ST_Distance(a.geom, b.geom) / 1000)::numeric) AS km
FROM cities a JOIN cities b ON a.name < b.name
ORDER BY km;`],
      ['sql', `SELECT name, ST_AsText(geom) FROM cities
WHERE ST_DWithin(geom, 'POINT(28.9784 41.0082)'::geography, 500000);`],
    ],
  },
  {
    key: 'vector',
    title: 'pgvector similarity',
    subtitle: 'Nearest neighbours on embeddings',
    needs: ['vector'],
    cells: [
      ['md', '# pgvector\nVectors are how AI embeddings are stored. Here we use tiny 3-dimensional ones.'],
      ['sql', `CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS items (id serial PRIMARY KEY, label text, embedding vector(3));
INSERT INTO items (label, embedding) VALUES
  ('cat', '[0.9, 0.1, 0.1]'), ('dog', '[0.8, 0.2, 0.1]'),
  ('car', '[0.1, 0.9, 0.2]'), ('bus', '[0.1, 0.8, 0.3]'),
  ('apple', '[0.2, 0.1, 0.9]');`],
      ['sql', `SELECT label, embedding <-> '[0.85, 0.15, 0.1]' AS distance
FROM items
ORDER BY distance
LIMIT 3;`],
      ['sql', `CREATE INDEX IF NOT EXISTS items_hnsw ON items USING hnsw (embedding vector_cosine_ops);
EXPLAIN SELECT label FROM items ORDER BY embedding <=> '[0.1, 0.85, 0.25]' LIMIT 2;`],
    ],
  },
  {
    key: 'graph',
    title: 'Graphs with Apache AGE',
    subtitle: 'openCypher inside PostgreSQL',
    needs: ['age'],
    cells: [
      ['md', '# Apache AGE\nTurn on **Apache AGE** in *Extensions*, then run the cells.'],
      ['sql', `CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT create_graph('friends');`],
      ['sql', `LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT * FROM cypher('friends', $$
  CREATE (a:Person {name: 'Ada'})-[:KNOWS]->(b:Person {name: 'Alan'}),
         (b)-[:KNOWS]->(c:Person {name: 'Grace'})
$$) AS (v agtype);`],
      ['sql', `LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT * FROM cypher('friends', $$
  MATCH (a:Person {name: 'Ada'})-[:KNOWS*1..2]->(f) RETURN f.name
$$) AS (friend agtype);`],
    ],
  },
];

export function sampleNotebook(key: string, id: string): Notebook {
  const s = SAMPLES.find((x) => x.key === key)!;
  let n = 0;
  return {
    id,
    title: s.title,
    updated: Date.now(),
    cells: s.cells.map(([t, src]) => ({ id: `${id}-${n++}`, type: t === 'md' ? 'markdown' : 'sql', source: src })),
  };
}
