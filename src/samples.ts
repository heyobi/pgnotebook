// Built-in example notebooks for core PostgreSQL (free). Extension examples live in extensions.ts.
import type { Notebook } from './notebook';
import { EXTENSIONS } from './extensions';

export interface Sample { key: string; title: string; subtitle: string; ext?: string; cells: ['md' | 'sql', string][] }

export const CORE_SAMPLES: Sample[] = [
  {
    key: 'welcome',
    title: 'Welcome to Tuple',
    subtitle: 'Tables, joins, aggregates and a chart',
    cells: [
      ['md', '# Welcome\nThis is a real **PostgreSQL** server running on your iPhone — no network, no account.\n\nTap ▶ on a cell to run it, or **Run all** at the bottom. Results with numbers can be shown as a **Chart**.'],
      ['sql', `DROP TABLE IF EXISTS shop_customers CASCADE;
CREATE TABLE shop_customers (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  city  text
);
DROP TABLE IF EXISTS shop_orders CASCADE;
CREATE TABLE shop_orders (
  id          serial PRIMARY KEY,
  customer_id int REFERENCES shop_customers(id),
  amount      numeric(10,2),
  ordered_at  date DEFAULT current_date
);`],
      ['sql', `INSERT INTO shop_customers (name, city) VALUES
  ('Ada', 'London'), ('Linus', 'Helsinki'), ('Grace', 'New York'), ('Edsger', 'Rotterdam');

INSERT INTO shop_orders (customer_id, amount, ordered_at)
SELECT 1 + (i % 4), round((random() * 200)::numeric, 2), current_date - (i % 30)
FROM generate_series(1, 200) AS i;`],
      ['sql', `SELECT c.name, count(o.*) AS shop_orders, sum(o.amount) AS total
FROM shop_customers c
JOIN shop_orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY total DESC;`],
      ['md', '## Window functions\nDaily revenue and a running total — tap **Chart** to see it as a line:'],
      ['sql', `SELECT ordered_at, sum(amount) AS revenue,
       sum(sum(amount)) OVER (ORDER BY ordered_at) AS running_total
FROM shop_orders
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
      ['sql', `DROP TABLE IF EXISTS app_events CASCADE;
CREATE TABLE app_events (id serial PRIMARY KEY, payload jsonb);
INSERT INTO app_events (payload) VALUES
  ('{"type":"signup","user":{"name":"Mia","country":"TR"},"tags":["web"]}'),
  ('{"type":"purchase","user":{"name":"Leo","country":"DE"},"total":42.5,"tags":["ios","promo"]}'),
  ('{"type":"purchase","user":{"name":"Mia","country":"TR"},"total":13,"tags":["ios"]}');`],
      ['sql', `SELECT payload->'user'->>'name' AS user,
       payload->>'type' AS type,
       (payload->>'total')::numeric AS total
FROM app_events
WHERE payload @> '{"tags":["ios"]}';`],
      ['sql', `SELECT jsonb_pretty(jsonb_agg(payload->'user')) FROM app_events;`],
    ],
  },
  {
    key: 'recursive',
    title: 'Recursive queries',
    subtitle: 'Org charts and sequences with WITH RECURSIVE',
    cells: [
      ['md', '# WITH RECURSIVE\nWalk a hierarchy without knowing its depth.'],
      ['sql', `DROP TABLE IF EXISTS org_staff CASCADE;
CREATE TABLE org_staff (id int PRIMARY KEY, name text, manager_id int);
INSERT INTO org_staff VALUES (1,'CEO',NULL),(2,'CTO',1),(3,'CFO',1),(4,'Dev lead',2),(5,'Developer',4),(6,'Accountant',3);`],
      ['sql', `WITH RECURSIVE chain AS (
  SELECT id, name, manager_id, 0 AS depth, name::text AS path FROM org_staff WHERE manager_id IS NULL
  UNION ALL
  SELECT s.id, s.name, s.manager_id, c.depth + 1, c.path || ' › ' || s.name
  FROM org_staff s JOIN chain c ON s.manager_id = c.id
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
      ['sql', `DROP TABLE IF EXISTS bank_accounts CASCADE;
CREATE TABLE bank_accounts (id serial PRIMARY KEY, owner text, balance numeric CHECK (balance >= 0), updated_at timestamptz);

CREATE OR REPLACE FUNCTION bank_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bank_accounts_touch ON bank_accounts;
CREATE TRIGGER bank_accounts_touch BEFORE INSERT OR UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION bank_touch();`],
      ['sql', `CREATE OR REPLACE FUNCTION bank_transfer(src int, dst int, amount numeric) RETURNS void AS $$
BEGIN
  UPDATE bank_accounts SET balance = balance - amount WHERE id = src;
  UPDATE bank_accounts SET balance = balance + amount WHERE id = dst;
  RAISE NOTICE 'moved % from % to %', amount, src, dst;
END $$ LANGUAGE plpgsql;

INSERT INTO bank_accounts (owner, balance) VALUES ('Ada', 100), ('Alan', 50);
SELECT bank_transfer(1, 2, 30);
SELECT * FROM bank_accounts ORDER BY id;`],
      ['md', 'The CHECK constraint stops overdrafts:'],
      ['sql', 'SELECT bank_transfer(2, 1, 1000);'],
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
