import './process-shim';
import { PGlite } from 'pglite16';
import { vector } from 'pglite16/vector';
import { amcheck } from 'pglite16/contrib/amcheck';
import { bloom } from 'pglite16/contrib/bloom';
import { btree_gin } from 'pglite16/contrib/btree_gin';
import { btree_gist } from 'pglite16/contrib/btree_gist';
import { citext } from 'pglite16/contrib/citext';
import { cube } from 'pglite16/contrib/cube';
import { earthdistance } from 'pglite16/contrib/earthdistance';
import { fuzzystrmatch } from 'pglite16/contrib/fuzzystrmatch';
import { hstore } from 'pglite16/contrib/hstore';
import { isn } from 'pglite16/contrib/isn';
import { lo } from 'pglite16/contrib/lo';
import { ltree } from 'pglite16/contrib/ltree';
import { pg_trgm } from 'pglite16/contrib/pg_trgm';
import { seg } from 'pglite16/contrib/seg';
import { tablefunc } from 'pglite16/contrib/tablefunc';
import { tsm_system_rows } from 'pglite16/contrib/tsm_system_rows';
import { tsm_system_time } from 'pglite16/contrib/tsm_system_time';
import { uuid_ossp } from 'pglite16/contrib/uuid_ossp';
import { serve } from './worker-core';

serve(PGlite, {
  vector, amcheck, bloom, btree_gin, btree_gist, citext, cube, earthdistance, fuzzystrmatch, hstore, isn, lo, ltree,
  pg_trgm, seg, tablefunc, tsm_system_rows, tsm_system_time, uuid_ossp,
});
