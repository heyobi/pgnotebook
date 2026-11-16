import { describe, expect, it } from 'vitest';
import { createdExtensions, extForSqlName, EXTENSIONS } from '../src/extensions';

// notebook.ts imports storage (Capacitor); test the pure converters through a dynamic import with a stubbed storage.
import { vi } from 'vitest';
vi.mock('../src/storage', () => ({ list: vi.fn(), readText: vi.fn(), remove: vi.fn(), writeText: vi.fn() }));
const { fromIpynb, fromSql, toIpynb, toSql } = await import('../src/notebook');

describe('notebook conversion', () => {
  const nb = {
    id: 'abc',
    title: 'Demo',
    updated: 1,
    cells: [
      { id: '1', type: 'markdown' as const, source: '# Title\nline two' },
      { id: '2', type: 'sql' as const, source: 'SELECT 1;\nSELECT 2;' },
    ],
  };

  it('round-trips through .ipynb', () => {
    const back = fromIpynb(toIpynb(nb), 'x', 'abc');
    expect(back.title).toBe('Demo');
    expect(back.cells.map((c) => [c.type, c.source])).toEqual(nb.cells.map((c) => [c.type, c.source]));
  });

  it('reads Jupyter %%sql cells', () => {
    const j = JSON.stringify({ cells: [{ cell_type: 'code', source: ['%%sql\n', 'SELECT 1'] }], metadata: {} });
    expect(fromIpynb(j, 'Imported').cells[0]).toMatchObject({ type: 'sql', source: 'SELECT 1' });
  });

  it('converts to and from .sql', () => {
    const sql = toSql(nb);
    expect(sql).toContain('-- # Title');
    const back = fromSql(sql, 'S');
    expect(back.cells.map((c) => c.type)).toEqual(['markdown', 'sql']);
    expect(back.cells[1].source).toBe('SELECT 1;\nSELECT 2;');
  });
});

describe('extensions', () => {
  it('finds CREATE EXTENSION names', () => {
    expect(createdExtensions('create extension if not exists postgis; CREATE EXTENSION "uuid-ossp";')).toEqual(['postgis', 'uuid-ossp']);
  });
  it('maps SQL names to bundled extensions', () => {
    expect(extForSqlName('uuid-ossp')?.id).toBe('uuid_ossp');
    expect(extForSqlName('nope')).toBeUndefined();
  });
  it('has unique ids', () => {
    expect(new Set(EXTENSIONS.map((e) => e.id)).size).toBe(EXTENSIONS.length);
  });
});
