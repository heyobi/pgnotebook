// "Learn PostgreSQL": a short course. Each lesson is a self-contained notebook — its first SQL cell (re)creates the
// tables it uses, so lessons can be run in any order and re-run any time. Exercises keep their solution in a
// collapsed <details> block.
import type { Sample } from './samples';

export interface Lesson extends Sample { n: number; level: 'Basics' | 'Intermediate' | 'Advanced'; minutes: number }

const sol = (sql: string) => `<details><summary>Show solution</summary>\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n</details>`;

export const LESSONS: Lesson[] = [
  {
    n: 1, key: 'learn-1', level: 'Basics', minutes: 5,
    title: 'Your first queries',
    subtitle: 'SELECT, expressions, types and NULL',
    cells: [
      ['md', `# 1 · Your first queries
Everything in PostgreSQL starts with **SELECT**. You do not even need a table: SELECT can compute values.

Tap ▶ on each grey box to run it. The result appears underneath.`],
      ['sql', `SELECT 1 + 1 AS two, 'Hello' || ' ' || 'PostgreSQL' AS greeting, now() AS right_now;`],
      ['md', `## Types
Every value has a **type**. \`::\` converts (casts) a value to another type.`],
      ['sql', `SELECT 42 AS integer_value,
       42 / 5 AS integer_division,
       42 / 5.0 AS decimal_division,
       '2026-01-15'::date + 30 AS a_month_later,
       '3.14'::numeric * 2 AS cast_text_to_number,
       pg_typeof(42.0) AS what_type;`],
      ['md', `## NULL means "unknown"
NULL is not zero and not an empty string. Anything combined with NULL is NULL, so use \`IS NULL\` and \`coalesce()\`.`],
      ['sql', `SELECT NULL = NULL AS equals_is_unknown,
       NULL IS NULL AS is_null,
       1 + NULL AS math_with_null,
       coalesce(NULL, 'fallback') AS coalesce_picks_first_non_null;`],
      ['md', `## Try it
Write a query that returns your name in upper case and the number of characters in it. *Hint:* \`upper()\` and \`length()\`.

${sol(`SELECT upper('Ada Lovelace') AS name, length('Ada Lovelace') AS letters;`)}`],
      ['sql', `SELECT upper('your name') AS name, length('your name') AS letters;`],
    ],
  },
  {
    n: 2, key: 'learn-2', level: 'Basics', minutes: 6,
    title: 'Tables and constraints',
    subtitle: 'CREATE TABLE, keys, NOT NULL, CHECK',
    cells: [
      ['md', `# 2 · Tables and constraints
A **table** stores rows with the same columns. **Constraints** are rules PostgreSQL enforces for you, so bad data never gets in.`],
      ['sql', `DROP TABLE IF EXISTS books, authors;

CREATE TABLE authors (
  id      int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name    text NOT NULL UNIQUE,
  born    int CHECK (born > 1000)
);

CREATE TABLE books (
  id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      text NOT NULL,
  author_id  int NOT NULL REFERENCES authors(id),
  pages      int CHECK (pages > 0),
  published  date
);`],
      ['md', `- **PRIMARY KEY** – unique, never NULL; \`GENERATED ALWAYS AS IDENTITY\` numbers rows for you.
- **REFERENCES** – a *foreign key*: every book must point to an existing author.
- **CHECK** – any condition that must be true.`],
      ['sql', `INSERT INTO authors (name, born) VALUES ('Ursula K. Le Guin', 1929), ('Italo Calvino', 1923);
INSERT INTO books (title, author_id, pages, published) VALUES
  ('A Wizard of Earthsea', 1, 205, '1968-11-01'),
  ('The Dispossessed', 1, 387, '1974-05-01'),
  ('Invisible Cities', 2, 165, '1972-11-01');
SELECT * FROM books;`],
      ['md', `Now watch the constraints protect the data. Each of these fails with a clear error:`],
      ['sql', `INSERT INTO books (title, author_id, pages) VALUES ('Ghost book', 99, 100);`],
      ['sql', `INSERT INTO books (title, author_id, pages) VALUES ('Negative book', 1, -5);`],
      ['md', `## Try it
Add a column \`isbn text UNIQUE\` to **books** and give *Invisible Cities* the ISBN \`978-0156453806\`.

${sol(`ALTER TABLE books ADD COLUMN isbn text UNIQUE;
UPDATE books SET isbn = '978-0156453806' WHERE title = 'Invisible Cities';
SELECT title, isbn FROM books;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 3, key: 'learn-3', level: 'Basics', minutes: 6,
    title: 'Changing data',
    subtitle: 'INSERT, UPDATE, DELETE, RETURNING, UPSERT',
    cells: [
      ['md', `# 3 · Changing data
\`INSERT\` adds rows, \`UPDATE\` changes them, \`DELETE\` removes them. **RETURNING** shows you the rows that were affected.`],
      ['sql', `DROP TABLE IF EXISTS inventory;
CREATE TABLE inventory (sku text PRIMARY KEY, name text, qty int NOT NULL DEFAULT 0);

INSERT INTO inventory VALUES ('A1', 'Notebook', 10), ('B2', 'Pen', 50), ('C3', 'Stapler', 3)
RETURNING *;`],
      ['sql', `UPDATE inventory SET qty = qty - 2 WHERE sku = 'A1' RETURNING sku, qty AS new_qty;`],
      ['sql', `DELETE FROM inventory WHERE qty < 5 RETURNING name AS removed;`],
      ['md', `## UPSERT: insert or update
\`ON CONFLICT\` decides what happens when a row with the same key already exists.`],
      ['sql', `INSERT INTO inventory (sku, name, qty) VALUES ('B2', 'Pen', 25), ('D4', 'Ruler', 7)
ON CONFLICT (sku) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty
RETURNING *;`],
      ['md', `\`EXCLUDED\` is the row you tried to insert. Pens went from 50 to 75; the ruler was new.

## Try it
Increase the quantity of every item by 10 % (round to whole numbers) and return the new list.

${sol(`UPDATE inventory SET qty = round(qty * 1.1) RETURNING *;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 4, key: 'learn-4', level: 'Basics', minutes: 7,
    title: 'Filtering and sorting',
    subtitle: 'WHERE, LIKE, IN, BETWEEN, ORDER BY, LIMIT',
    cells: [
      ['md', `# 4 · Filtering and sorting
We will use a small table of countries.`],
      ['sql', `DROP TABLE IF EXISTS countries;
CREATE TABLE countries (name text, continent text, population_m numeric, area_km2 int);
INSERT INTO countries VALUES
  ('Türkiye','Asia',85.3,783562), ('Germany','Europe',84.5,357588), ('Japan','Asia',124.5,377975),
  ('Brazil','South America',216.4,8515767), ('Nigeria','Africa',223.8,923768), ('Canada','North America',39.6,9984670),
  ('Iceland','Europe',0.39,103000), ('Egypt','Africa',112.7,1002450), ('India','Asia',1428.6,3287263),
  ('Mexico','North America',128.5,1964375), ('Chile','South America',19.6,756102), ('Norway','Europe',5.5,385207);`],
      ['sql', `SELECT name, population_m FROM countries
WHERE continent = 'Europe' AND population_m > 1
ORDER BY population_m DESC;`],
      ['md', `**Patterns and lists:** \`LIKE\` uses \`%\` for "anything" (\`ILIKE\` ignores case), \`IN\` matches a list, \`BETWEEN\` a range.`],
      ['sql', `SELECT name FROM countries WHERE name ILIKE '%an%';`],
      ['sql', `SELECT name, continent FROM countries
WHERE continent IN ('Africa', 'South America') AND population_m BETWEEN 20 AND 250;`],
      ['md', `**Computed columns, sorting and paging:**`],
      ['sql', `SELECT name, round(population_m * 1e6 / area_km2) AS people_per_km2
FROM countries
ORDER BY people_per_km2 DESC
LIMIT 5;`],
      ['md', `## Try it
List the three largest countries by area that are **not** in Asia.

${sol(`SELECT name, area_km2 FROM countries WHERE continent <> 'Asia' ORDER BY area_km2 DESC LIMIT 3;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 5, key: 'learn-5', level: 'Basics', minutes: 7,
    title: 'Aggregates and GROUP BY',
    subtitle: 'count, sum, avg, GROUP BY, HAVING, FILTER',
    cells: [
      ['md', `# 5 · Aggregates and GROUP BY
Aggregate functions turn many rows into one value. **GROUP BY** computes them per group.`],
      ['sql', `DROP TABLE IF EXISTS sales;
CREATE TABLE sales (day date, region text, product text, amount numeric);
INSERT INTO sales
SELECT date '2026-01-01' + (i % 60),
       (ARRAY['North','South','East','West'])[1 + i % 4],
       (ARRAY['Tea','Coffee','Cocoa'])[1 + (i / 4) % 3],
       round((20 + random() * 80)::numeric, 2)
FROM generate_series(1, 400) AS i;
SELECT count(*) AS rows, sum(amount) AS total, round(avg(amount), 2) AS average, min(day), max(day) FROM sales;`],
      ['sql', `SELECT region, count(*) AS orders, sum(amount) AS revenue
FROM sales
GROUP BY region
ORDER BY revenue DESC;`],
      ['md', `**HAVING** filters groups (WHERE filters rows *before* grouping). **FILTER** counts only some rows inside an aggregate. Tap **Chart** on the next result.`],
      ['sql', `SELECT product,
       sum(amount) AS revenue,
       sum(amount) FILTER (WHERE region = 'North') AS north_revenue
FROM sales
GROUP BY product
HAVING sum(amount) > 1000
ORDER BY revenue DESC;`],
      ['sql', `SELECT date_trunc('week', day)::date AS week, sum(amount) AS revenue
FROM sales GROUP BY week ORDER BY week;`],
      ['md', `## Try it
For each region, show the best-selling product and its revenue. *Hint:* group by two columns, then think about how to keep only the top row — or peek at lesson 8.

${sol(`SELECT DISTINCT ON (region) region, product, sum(amount) AS revenue
FROM sales GROUP BY region, product
ORDER BY region, revenue DESC;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 6, key: 'learn-6', level: 'Intermediate', minutes: 8,
    title: 'Joins',
    subtitle: 'INNER, LEFT, FULL and self joins',
    cells: [
      ['md', `# 6 · Joins
A **join** combines rows from two tables that belong together.`],
      ['sql', `DROP TABLE IF EXISTS enrolments, students, courses;
CREATE TABLE students (id int PRIMARY KEY, name text, mentor_id int);
CREATE TABLE courses  (id int PRIMARY KEY, title text);
CREATE TABLE enrolments (student_id int REFERENCES students, course_id int REFERENCES courses, grade int);
INSERT INTO students VALUES (1,'Ada',NULL),(2,'Alan',1),(3,'Grace',1),(4,'Linus',2);
INSERT INTO courses VALUES (10,'Databases'),(20,'Compilers'),(30,'Graphics');
INSERT INTO enrolments VALUES (1,10,95),(2,10,88),(2,20,91),(3,20,97);`],
      ['md', `**INNER JOIN** keeps only matching pairs:`],
      ['sql', `SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses  c ON c.id = e.course_id
ORDER BY s.name;`],
      ['md', `**LEFT JOIN** keeps every row from the left table, with NULLs where nothing matches — Linus has no course:`],
      ['sql', `SELECT s.name, count(e.course_id) AS courses
FROM students s LEFT JOIN enrolments e ON e.student_id = s.id
GROUP BY s.name ORDER BY s.name;`],
      ['md', `**Anti-join:** courses nobody takes. **Self join:** a table joined to itself — each student with their mentor:`],
      ['sql', `SELECT c.title FROM courses c
WHERE NOT EXISTS (SELECT 1 FROM enrolments e WHERE e.course_id = c.id);`],
      ['sql', `SELECT s.name AS student, m.name AS mentor
FROM students s LEFT JOIN students m ON m.id = s.mentor_id;`],
      ['md', `## Try it
Show each course with its average grade, including courses with no students (they should show NULL).

${sol(`SELECT c.title, round(avg(e.grade), 1) AS avg_grade
FROM courses c LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.title ORDER BY c.title;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 7, key: 'learn-7', level: 'Intermediate', minutes: 7,
    title: 'Subqueries and CTEs',
    subtitle: 'IN, EXISTS, scalar subqueries, WITH',
    cells: [
      ['md', `# 7 · Subqueries and CTEs
A query can use the result of another query. **WITH** (a common table expression, CTE) gives sub-results a name so long queries read top to bottom.`],
      ['sql', `DROP TABLE IF EXISTS employees;
CREATE TABLE employees (name text, dept text, salary int);
INSERT INTO employees VALUES ('Mia','Eng',95),('Leo','Eng',120),('Ava','Eng',105),('Noah','Sales',70),
  ('Emma','Sales',82),('Liam','Ops',64),('Zoe','Ops',71),('Kai','Eng',88);`],
      ['md', `**Scalar subquery** – one value used in a comparison:`],
      ['sql', `SELECT name, salary FROM employees
WHERE salary > (SELECT avg(salary) FROM employees)
ORDER BY salary DESC;`],
      ['md', `**Correlated subquery** – re-evaluated per row; here, people earning above their own department's average:`],
      ['sql', `SELECT name, dept, salary FROM employees e
WHERE salary > (SELECT avg(salary) FROM employees WHERE dept = e.dept);`],
      ['md', `**CTE** – the same question, readable step by step:`],
      ['sql', `WITH dept_avg AS (
  SELECT dept, avg(salary) AS avg_salary FROM employees GROUP BY dept
)
SELECT e.name, e.dept, e.salary, round(d.avg_salary) AS dept_avg
FROM employees e JOIN dept_avg d USING (dept)
WHERE e.salary > d.avg_salary;`],
      ['md', `## Try it
Using a CTE, list departments whose total salary is more than 30 % of the company total.

${sol(`WITH totals AS (SELECT dept, sum(salary) AS total FROM employees GROUP BY dept)
SELECT dept, total FROM totals
WHERE total > 0.3 * (SELECT sum(total) FROM totals);`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 8, key: 'learn-8', level: 'Intermediate', minutes: 8,
    title: 'Window functions',
    subtitle: 'ROW_NUMBER, RANK, running totals, LAG',
    cells: [
      ['md', `# 8 · Window functions
A window function looks at *related rows* without collapsing them like GROUP BY does. The magic word is **OVER**.`],
      ['sql', `DROP TABLE IF EXISTS scores;
CREATE TABLE scores (player text, game int, points int);
INSERT INTO scores VALUES ('Ada',1,30),('Ada',2,45),('Ada',3,25),('Ada',4,50),
  ('Alan',1,40),('Alan',2,20),('Alan',3,60),('Alan',4,35),('Grace',1,55),('Grace',2,50),('Grace',3,40),('Grace',4,65);`],
      ['md', `**Ranking** within each player (PARTITION BY) by points:`],
      ['sql', `SELECT player, game, points,
       rank() OVER (PARTITION BY player ORDER BY points DESC) AS best_game_rank
FROM scores ORDER BY player, best_game_rank;`],
      ['md', `**Running totals and moving averages** — tap **Chart**:`],
      ['sql', `SELECT game, player,
       sum(points) OVER (PARTITION BY player ORDER BY game) AS running_total
FROM scores ORDER BY game, player;`],
      ['md', `**LAG / LEAD** look at the previous / next row — game-to-game change:`],
      ['sql', `SELECT player, game, points,
       points - lag(points) OVER (PARTITION BY player ORDER BY game) AS change
FROM scores ORDER BY player, game;`],
      ['md', `**Top-N per group** is a classic: number the rows, keep number 1.`],
      ['sql', `SELECT player, game, points FROM (
  SELECT *, row_number() OVER (PARTITION BY player ORDER BY points DESC) AS rn FROM scores
) t WHERE rn = 1;`],
      ['md', `## Try it
For every game, show each player's share of that game's total points as a percentage.

${sol(`SELECT game, player, points,
       round(100.0 * points / sum(points) OVER (PARTITION BY game), 1) AS pct
FROM scores ORDER BY game, pct DESC;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 9, key: 'learn-9', level: 'Intermediate', minutes: 7,
    title: 'JSON and JSONB',
    subtitle: 'Documents inside a relational database',
    cells: [
      ['md', `# 9 · JSON and JSONB
**jsonb** stores JSON in a binary form you can query and index. \`->\` returns JSON, \`->>\` returns text, \`@>\` tests containment.`],
      ['sql', `DROP TABLE IF EXISTS events;
CREATE TABLE events (id serial PRIMARY KEY, payload jsonb);
INSERT INTO events (payload) VALUES
  ('{"type":"signup","user":{"name":"Mia","country":"TR"},"tags":["web"]}'),
  ('{"type":"purchase","user":{"name":"Leo","country":"DE"},"total":42.5,"tags":["ios","promo"]}'),
  ('{"type":"purchase","user":{"name":"Mia","country":"TR"},"total":13,"tags":["ios"]}');`],
      ['sql', `SELECT payload->'user'->>'name' AS user,
       payload->>'type' AS type,
       (payload->>'total')::numeric AS total
FROM events WHERE payload @> '{"tags":["ios"]}';`],
      ['md', `**Turning JSON into rows** and **building JSON from rows**:`],
      ['sql', `SELECT e.id, t.tag FROM events e, jsonb_array_elements_text(e.payload->'tags') AS t(tag);`],
      ['sql', `SELECT payload->'user'->>'country' AS country,
       jsonb_agg(payload->'user'->>'name') AS users,
       jsonb_build_object('purchases', count(*) FILTER (WHERE payload->>'type' = 'purchase')) AS stats
FROM events GROUP BY 1;`],
      ['md', `A **GIN index** makes \`@>\` searches fast on large tables:`],
      ['sql', `CREATE INDEX events_payload_gin ON events USING gin (payload);
EXPLAIN SELECT * FROM events WHERE payload @> '{"type":"purchase"}';`],
      ['md', `## Try it
Add the tag "vip" to every purchase over 40 (*hint:* \`jsonb_set\` or the \`||\` operator on the tags array).

${sol(`UPDATE events SET payload = jsonb_set(payload, '{tags}', (payload->'tags') || '"vip"')
WHERE payload->>'type' = 'purchase' AND (payload->>'total')::numeric > 40
RETURNING payload;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 10, key: 'learn-10', level: 'Intermediate', minutes: 6,
    title: 'Dates, arrays and series',
    subtitle: 'generate_series, intervals, arrays',
    cells: [
      ['md', `# 10 · Dates, arrays and series
\`generate_series\` creates rows out of thin air — perfect for calendars and test data.`],
      ['sql', `SELECT d::date AS day, to_char(d, 'Dy') AS weekday
FROM generate_series(date '2026-03-01', date '2026-03-10', interval '1 day') AS d;`],
      ['sql', `SELECT age(date '2026-11-17', date '1990-05-04') AS age,
       date '2026-12-31' - current_date AS days_to_new_year,
       extract(isodow FROM now()) AS iso_weekday,
       now() AT TIME ZONE 'Europe/Istanbul' AS istanbul_time;`],
      ['md', `**Arrays** are first-class values:`],
      ['sql', `SELECT ARRAY[3,1,2] AS arr,
       array_length(ARRAY[3,1,2], 1) AS len,
       (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[3,1,2]) x) AS sorted,
       'b' = ANY (ARRAY['a','b','c']) AS contains_b,
       string_to_array('red,green,blue', ',') AS split;`],
      ['md', `## Try it
Generate every Monday of 2026 and count them.

${sol(`SELECT count(*) FROM generate_series(date '2026-01-01', date '2026-12-31', interval '1 day') d
WHERE extract(isodow FROM d) = 1;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 11, key: 'learn-11', level: 'Advanced', minutes: 8,
    title: 'Indexes and EXPLAIN',
    subtitle: 'Why some queries are fast',
    cells: [
      ['md', `# 11 · Indexes and EXPLAIN
**EXPLAIN** shows the plan PostgreSQL chose. **EXPLAIN ANALYZE** also runs it and reports real timings.`],
      ['sql', `DROP TABLE IF EXISTS readings;
CREATE TABLE readings (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sensor int, taken_at timestamptz, value numeric);
INSERT INTO readings (sensor, taken_at, value)
SELECT 1 + (i % 500), now() - i * interval '1 minute', round((random() * 100)::numeric, 2)
FROM generate_series(1, 50000) i;
ANALYZE readings;
SELECT count(*) FROM readings;`],
      ['md', `Without an index, finding one sensor means reading every row (a **Seq Scan**):`],
      ['sql', `EXPLAIN ANALYZE SELECT avg(value) FROM readings WHERE sensor = 42;`],
      ['sql', `CREATE INDEX readings_sensor_idx ON readings (sensor);
EXPLAIN ANALYZE SELECT avg(value) FROM readings WHERE sensor = 42;`],
      ['md', `Now it is a **Bitmap/Index Scan** and much faster. Compare the *Execution Time* lines.

A **multi-column index** can serve filtering *and* sorting:`],
      ['sql', `CREATE INDEX readings_sensor_time_idx ON readings (sensor, taken_at DESC);
EXPLAIN SELECT * FROM readings WHERE sensor = 7 ORDER BY taken_at DESC LIMIT 10;`],
      ['md', `Indexes are not free: they take space and slow down writes.`],
      ['sql', `SELECT relname AS index, pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class WHERE relname LIKE 'readings%' ORDER BY relname;`],
      ['md', `## Try it
Find out whether this query uses an index, then create one that helps:
\`SELECT * FROM readings WHERE value > 99.9;\`

${sol(`EXPLAIN SELECT * FROM readings WHERE value > 99.9;
CREATE INDEX readings_value_idx ON readings (value);
EXPLAIN SELECT * FROM readings WHERE value > 99.9;`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 12, key: 'learn-12', level: 'Advanced', minutes: 6,
    title: 'Transactions',
    subtitle: 'BEGIN, COMMIT, ROLLBACK, SAVEPOINT',
    cells: [
      ['md', `# 12 · Transactions
A transaction groups statements so they succeed or fail **together**. Either both halves of a bank transfer happen, or neither does.

A notebook cell is one round-trip, so put a whole transaction in one cell.`],
      ['sql', `DROP TABLE IF EXISTS wallet;
CREATE TABLE wallet (owner text PRIMARY KEY, balance numeric CHECK (balance >= 0));
INSERT INTO wallet VALUES ('Ada', 100), ('Alan', 50);`],
      ['md', `**ROLLBACK** undoes everything since BEGIN:`],
      ['sql', `BEGIN;
UPDATE wallet SET balance = balance - 30 WHERE owner = 'Ada';
UPDATE wallet SET balance = balance + 30 WHERE owner = 'Alan';
ROLLBACK;
SELECT * FROM wallet ORDER BY owner;`],
      ['md', `**COMMIT** makes it permanent:`],
      ['sql', `BEGIN;
UPDATE wallet SET balance = balance - 30 WHERE owner = 'Ada';
UPDATE wallet SET balance = balance + 30 WHERE owner = 'Alan';
COMMIT;
SELECT * FROM wallet ORDER BY owner;`],
      ['md', `**SAVEPOINT** lets you undo part of a transaction. Here we keep the first change, change our mind about the second, and roll back only to the savepoint:`],
      ['sql', `BEGIN;
UPDATE wallet SET balance = balance + 5 WHERE owner = 'Ada';
SAVEPOINT before_big_one;
UPDATE wallet SET balance = balance - 5 WHERE owner = 'Alan';
ROLLBACK TO SAVEPOINT before_big_one;
COMMIT;
SELECT * FROM wallet ORDER BY owner;`],
      ['md', `If any statement fails inside a transaction, PostgreSQL refuses further work until ROLLBACK — the CHECK constraint makes this one fail and nothing changes:`],
      ['sql', `BEGIN;
UPDATE wallet SET balance = balance + 1000 WHERE owner = 'Ada';
UPDATE wallet SET balance = balance - 1000 WHERE owner = 'Alan';
COMMIT;`],
      ['sql', `ROLLBACK;
SELECT * FROM wallet ORDER BY owner;`],
    ],
  },
  {
    n: 13, key: 'learn-13', level: 'Advanced', minutes: 8,
    title: 'Views, functions and triggers',
    subtitle: 'Reusable SQL and PL/pgSQL',
    cells: [
      ['md', `# 13 · Views, functions and triggers
A **view** is a saved query. A **function** is reusable logic. A **trigger** runs a function automatically when data changes.`],
      ['sql', `DROP TABLE IF EXISTS orders_log, orders CASCADE;
CREATE TABLE orders (id serial PRIMARY KEY, customer text, amount numeric, status text DEFAULT 'new', updated_at timestamptz);
CREATE TABLE orders_log (order_id int, old_status text, new_status text, changed_at timestamptz DEFAULT now());
INSERT INTO orders (customer, amount) VALUES ('Mia', 30), ('Leo', 120), ('Mia', 75);`],
      ['sql', `CREATE OR REPLACE VIEW customer_totals AS
SELECT customer, count(*) AS orders, sum(amount) AS total FROM orders GROUP BY customer;
SELECT * FROM customer_totals;`],
      ['md', `A **SQL function** and a **PL/pgSQL function** (with variables, IF and RAISE):`],
      ['sql', `CREATE OR REPLACE FUNCTION with_vat(amount numeric, rate numeric DEFAULT 0.20)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT round(amount * (1 + rate), 2) $$;

CREATE OR REPLACE FUNCTION discount_for(cust text) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE spent numeric;
BEGIN
  SELECT coalesce(sum(amount), 0) INTO spent FROM orders WHERE customer = cust;
  IF spent > 100 THEN RETURN 0.10; END IF;
  RAISE NOTICE '% has spent only %', cust, spent;
  RETURN 0;
END $$;

SELECT with_vat(100) AS gross, discount_for('Mia') AS mia, discount_for('Leo') AS leo;`],
      ['md', `A **trigger** that stamps \`updated_at\` and logs every status change:`],
      ['sql', `CREATE OR REPLACE FUNCTION orders_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO orders_log (order_id, old_status, new_status) VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_audit BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION orders_audit();

UPDATE orders SET status = 'shipped' WHERE id = 2;
SELECT * FROM orders_log;`],
      ['md', `## Try it
Write a function \`order_count(cust text)\` that returns how many orders a customer has, and call it for Mia.

${sol(`CREATE OR REPLACE FUNCTION order_count(cust text) RETURNS bigint LANGUAGE sql AS
$$ SELECT count(*) FROM orders WHERE customer = cust $$;
SELECT order_count('Mia');`)}`],
      ['sql', `-- your answer`],
    ],
  },
  {
    n: 14, key: 'learn-14', level: 'Advanced', minutes: 7,
    title: 'Recursive queries and full-text search',
    subtitle: 'WITH RECURSIVE, tsvector, ranking',
    cells: [
      ['md', `# 14 · Recursive queries and full-text search
**WITH RECURSIVE** walks hierarchies of any depth.`],
      ['sql', `DROP TABLE IF EXISTS staff, articles;
CREATE TABLE staff (id int PRIMARY KEY, name text, manager_id int);
INSERT INTO staff VALUES (1,'CEO',NULL),(2,'CTO',1),(3,'CFO',1),(4,'Dev lead',2),(5,'Developer',4),(6,'Accountant',3);

WITH RECURSIVE chain AS (
  SELECT id, name, 0 AS depth, name::text AS path FROM staff WHERE manager_id IS NULL
  UNION ALL
  SELECT s.id, s.name, c.depth + 1, c.path || ' › ' || s.name FROM staff s JOIN chain c ON s.manager_id = c.id
)
SELECT repeat('    ', depth) || name AS org_chart, path FROM chain ORDER BY path;`],
      ['md', `**Full-text search** is built into PostgreSQL: words are normalised (*running* → *run*), so searches match meaning, not exact strings.`],
      ['sql', `CREATE TABLE articles (id serial PRIMARY KEY, title text, body text,
  doc tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED);
CREATE INDEX articles_doc_idx ON articles USING gin (doc);
INSERT INTO articles (title, body) VALUES
  ('Running a database on a phone', 'PostgreSQL runs offline on iPhone with WebAssembly.'),
  ('Indexes explained', 'B-tree and GIN indexes make searches fast.'),
  ('Learning SQL', 'Window functions and joins are the heart of analytical queries.'),
  ('Phones and batteries', 'Battery life depends on how apps run in the background.');`],
      ['sql', `SELECT title, ts_rank(doc, q) AS rank
FROM articles, websearch_to_tsquery('english', 'running phones') q
WHERE doc @@ q ORDER BY rank DESC;`],
      ['sql', `SELECT title, ts_headline('english', body, websearch_to_tsquery('english', 'index search')) AS snippet
FROM articles WHERE doc @@ websearch_to_tsquery('english', 'index search');`],
      ['md', `## Where next?
- Open **Extensions** for PostGIS maps, pgvector similarity search and graph queries.
- Use the **Terminal** tab for psql commands like \`\\dt\` and \`\\d table\`.
- Create a new database with **PostgreSQL 16 or 17** in **Databases** to compare versions.`],
    ],
  },
];
