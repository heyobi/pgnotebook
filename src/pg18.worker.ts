import './process-shim';
import { PGlite } from '@electric-sql/pglite';
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
import { serve } from './worker-core';

serve(PGlite, {
  postgis, vector, age, pgtap, pg_uuidv7, pg_hashids, pg_ivm, pgmq, pg_textsearch,
  amcheck, bloom, btree_gin, btree_gist, citext, cube, dict_int, dict_xsyn, earthdistance, fuzzystrmatch,
  hstore, intarray, isn, lo, ltree, pageinspect, pg_buffercache, pg_trgm, pg_visibility, pgcrypto, seg,
  tablefunc, tsm_system_rows, tsm_system_time, unaccent, uuid_ossp,
});
