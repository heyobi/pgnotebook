// Built-in example notebooks for core PostgreSQL (free). Extension examples live in extensions.ts.
import type { Notebook } from './notebook';
import { EXTENSIONS } from './extensions';

export interface Sample { key: string; title: string; subtitle: string; ext?: string; cells: ['md' | 'sql', string][] }

export const CORE_SAMPLES: Sample[] = [
  {
    key: 'welcome',
    title: 'Welcome to PG Notebook',
    subtitle: 'Tables, joins, aggregates and a chart',
    cells: [
      ['md', '# Welcome\nThis is a real **PostgreSQL** server running on your iPhone — no network, no account.\n\nTap ▶ on a cell to run it, or **Run all** at the bottom. Results with numbers can be shown as a **Chart**.'],
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
      ['sql', `SELECT c.name, count(o.*) AS orders, sum(o.amount) AS total
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY total DESC;`],
      ['md', '## Window functions\nDaily revenue and a running total — tap **Chart** to see it as a line:'],
      ['sql', `SELECT ordered_at, sum(amount) AS revenue,
       sum(sum(amount)) OVER (ORDER BY ordered_at) AS running_total
FROM orders
GROUP BY ordered_at
ORDER BY ordered_at;`],
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
    key: 'recursive',
    title: 'Recursive queries',
    subtitle: 'Org charts and sequences with WITH RECURSIVE',
    cells: [
      ['md', '# WITH RECURSIVE\nWalk a hierarchy without knowing its depth.'],
      ['sql', `CREATE TABLE IF NOT EXISTS staff (id int PRIMARY KEY, name text, manager_id int);
INSERT INTO staff VALUES (1,'CEO',NULL),(2,'CTO',1),(3,'CFO',1),(4,'Dev lead',2),(5,'Developer',4),(6,'Accountant',3)
ON CONFLICT DO NOTHING;`],
      ['sql', `WITH RECURSIVE chain AS (
  SELECT id, name, manager_id, 0 AS depth, name::text AS path FROM staff WHERE manager_id IS NULL
  UNION ALL
  SELECT s.id, s.name, s.manager_id, c.depth + 1, c.path || ' › ' || s.name
  FROM staff s JOIN chain c ON s.manager_id = c.id
)
SELECT repeat('   ', depth) || name AS org, path FROM chain ORDER BY path;`],
      ['md', 'Fibonacci numbers — tap **Chart**:'],
      ['sql', `WITH RECURSIVE fib(n, a, b) AS (
  SELECT 1, 0::numeric, 1::numeric
  UNION ALL SELECT n + 1, b, a + b FROM fib WHERE n < 25
)
SELECT n, a AS fibonacci FROM fib;`],
    ],
  },
  {
    key: 'plpgsql',
    title: 'Functions & triggers',
    subtitle: 'PL/pgSQL, triggers and constraints',
    cells: [
      ['md', '# PL/pgSQL\nServer-side functions and triggers work exactly as on a big server.'],
      ['sql', `CREATE TABLE IF NOT EXISTS accounts (id serial PRIMARY KEY, owner text, balance numeric CHECK (balance >= 0), updated_at timestamptz);

CREATE OR REPLACE FUNCTION touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_touch ON accounts;
CREATE TRIGGER accounts_touch BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION touch();`],
      ['sql', `CREATE OR REPLACE FUNCTION transfer(src int, dst int, amount numeric) RETURNS void AS $$
BEGIN
  UPDATE accounts SET balance = balance - amount WHERE id = src;
  UPDATE accounts SET balance = balance + amount WHERE id = dst;
  RAISE NOTICE 'moved % from % to %', amount, src, dst;
END $$ LANGUAGE plpgsql;

INSERT INTO accounts (owner, balance) VALUES ('Ada', 100), ('Alan', 50);
SELECT transfer(1, 2, 30);
SELECT * FROM accounts ORDER BY id;`],
      ['md', 'The CHECK constraint stops overdrafts:'],
      ['sql', 'SELECT transfer(2, 1, 1000);'],
    ],
  },
];

export function extensionSamples(): Sample[] {
  return EXTENSIONS.filter((e) => e.example).map((e) => ({ key: `ext:${e.id}`, title: e.example!.title, subtitle: e.tagline, ext: e.id, cells: e.example!.cells }));
}

export function sampleNotebook(s: Sample, id: string): Notebook {
  let n = 0;
  return {
    id,
    title: s.title,
    updated: Date.now(),
    cells: s.cells.map(([t, src]) => ({ id: `${id}-${n++}`, type: t === 'md' ? 'markdown' : 'sql', source: src })),
  };
}
