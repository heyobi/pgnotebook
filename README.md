# Tuple — SQL Notebook

**PostgreSQL notebooks that run entirely on your iPhone.** A real PostgreSQL 18 server, PostGIS, pgvector,
Apache AGE and 30+ other extensions, Jupyter-style cells, no network and no account.

Tuple is to PostgreSQL what Juno is to Python: you write SQL in cells, run them, and see the results as
tables. Everything stays on the device.

## Features

- **Real PostgreSQL 18** via [PGlite](https://pglite.dev) (PostgreSQL compiled to WebAssembly), running in a
  background worker so the UI stays responsive.
- **Notebooks**: SQL and Markdown cells, run one or *Run all*, results as scrollable tables, NOTICE output,
  timings, CSV export of any result.
- **Jupyter compatible**: notebooks are stored as `.ipynb` files (SQL kernel) in *Files › On My iPhone ›
  Tuple › Notebooks*. Import `.ipynb` or `.sql`, share as either.
- **Extensions** bundled in the app (nothing is downloaded): PostGIS, pgvector, Apache AGE, pgcrypto, pg_trgm,
  hstore, ltree, citext, uuid-ossp, pg_uuidv7, pg_hashids, tablefunc, pg_ivm, pgmq, pgTAP, pg_textsearch,
  btree_gin/gist, bloom and more. Turn them on in *Database*; `CREATE EXTENSION` on one that is off offers to turn it on.
- **Autocomplete** for keywords, tables and columns of your database.
- **Backups**: export the whole database as a `.tar.gz`, restore it later or on another device.
- SQL symbol bar above the keyboard, light and dark mode.

## How it works

```
iOS app (Capacitor, WKWebView)
 ├─ UI: TypeScript + CodeMirror 6           src/main.ts
 ├─ Web Worker: PGlite + extensions         src/pg.worker.ts
 ├─ Snapshot of PGDATA (gzip tar)           Library/pgnotebook/main.tar.gz
 └─ Notebooks (.ipynb)                      Documents/Notebooks/
```

App Store rules allow apps to run code the user writes, as long as the interpreter ships inside the app and no
executable code is downloaded. PostgreSQL and every extension are compiled to WebAssembly and bundled; the app
makes no network requests.

## Develop

```bash
npm install
npm run dev        # http://localhost:5199 — the whole app runs in a desktop browser too
npm test
npm run cap:sync   # build and copy into ios/ (open ios/App/App.xcodeproj in Xcode on a Mac)
```

## Release (GitHub Actions → TestFlight)

`.github/workflows/ios-testflight.yml` builds every push to `main` on a macOS runner, signs it and uploads it to
App Store Connect. Repository secrets it needs:

| Secret | What |
|---|---|
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY` | App Store Connect API key (.p8 contents) |
| `BUILD_CERTIFICATE_BASE64`, `P12_PASSWORD` | Apple Distribution certificate (.p12, base64) and its password |
| `KEYCHAIN_PASSWORD` | Any random string for the temporary CI keychain |

The workflow registers the bundle ID and creates the App Store provisioning profile itself; the App Store
Connect app record must exist (bundle ID `com.heyobi.pgnotebook`).

## Roadmap

- Map view for PostGIS geometry columns
- Several databases, each with its own extensions
- `COPY FROM` a CSV picked in Files
- EXPLAIN plan visualiser
- Go and other languages as sibling apps

## Licence

Tuple's own code is MIT licensed (see `LICENSE`).

Bundled third-party software keeps its own licence: PostgreSQL (PostgreSQL Licence), PGlite (Apache-2.0),
PostGIS (GPL-2.0-or-later, source at [postgis.net](https://postgis.net) and
[electric-sql/pglite](https://github.com/electric-sql/pglite)), Apache AGE (Apache-2.0), pgvector (PostgreSQL
Licence), CodeMirror (MIT), Capacitor (MIT). PostgreSQL is a trademark of the PostgreSQL Community Association;
this project is not affiliated with or endorsed by it.
