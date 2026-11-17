import './process-shim';
import { PGlite } from 'pglite17';
import { postgis } from 'pglite17-postgis';
import { vector } from 'pglite17/vector';
import { age } from 'pglite17/age';
import { pgtap } from 'pglite17/pgtap';
import { pg_uuidv7 } from 'pglite17/pg_uuidv7';
import { pg_hashids } from 'pglite17/pg_hashids';
import { pg_ivm } from 'pglite17/pg_ivm';
import { pg_textsearch } from 'pglite17/pg_textsearch';
import { amcheck } from 'pglite17/contrib/amcheck';
import { bloom } from 'pglite17/contrib/bloom';
import { btree_gin } from 'pglite17/contrib/btree_gin';
import { btree_gist } from 'pglite17/contrib/btree_gist';
import { citext } from 'pglite17/contrib/citext';
import { cube } from 'pglite17/contrib/cube';
import { dict_int } from 'pglite17/contrib/dict_int';
import { dict_xsyn } from 'pglite17/contrib/dict_xsyn';
import { earthdistance } from 'pglite17/contrib/earthdistance';
import { fuzzystrmatch } from 'pglite17/contrib/fuzzystrmatch';
import { hstore } from 'pglite17/contrib/hstore';
import { intarray } from 'pglite17/contrib/intarray';
import { isn } from 'pglite17/contrib/isn';
import { lo } from 'pglite17/contrib/lo';
import { ltree } from 'pglite17/contrib/ltree';
import { pageinspect } from 'pglite17/contrib/pageinspect';
import { pg_buffercache } from 'pglite17/contrib/pg_buffercache';
import { pg_trgm } from 'pglite17/contrib/pg_trgm';
import { pg_visibility } from 'pglite17/contrib/pg_visibility';
import { pgcrypto } from 'pglite17/contrib/pgcrypto';
import { seg } from 'pglite17/contrib/seg';
import { tablefunc } from 'pglite17/contrib/tablefunc';
import { tsm_system_rows } from 'pglite17/contrib/tsm_system_rows';
import { tsm_system_time } from 'pglite17/contrib/tsm_system_time';
import { unaccent } from 'pglite17/contrib/unaccent';
import { uuid_ossp } from 'pglite17/contrib/uuid_ossp';
import { serve } from './worker-core';

serve(PGlite, {
  postgis, vector, age, pgtap, pg_uuidv7, pg_hashids, pg_ivm, pg_textsearch,
  amcheck, bloom, btree_gin, btree_gist, citext, cube, dict_int, dict_xsyn, earthdistance, fuzzystrmatch,
  hstore, intarray, isn, lo, ltree, pageinspect, pg_buffercache, pg_trgm, pg_visibility, pgcrypto, seg,
  tablefunc, tsm_system_rows, tsm_system_time, unaccent, uuid_ossp,
});
