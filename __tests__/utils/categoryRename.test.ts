/**
 * Products name their category by TEXT (parts.category), not by id. Renaming a
 * category used to rename only the tile, so every product in it kept the old
 * name and dropped out of every category page. Live, 11 active products sit in
 * categories that have no tile ("Earphone" 9, "Headsets" 2).
 */

type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
let existingName: string | null = null;

function mockBuilder(table: string) {
  const record = (op: string, args: unknown[]) => calls.push({ table, op, args });
  const b: any = {
    select: (...a: unknown[]) => (record('select', a), b),
    eq: (...a: unknown[]) => (record('eq', a), b),
    or: (...a: unknown[]) => (record('or', a), b),
    update: (...a: unknown[]) => (record('update', a), b),
    upsert: (...a: unknown[]) => (record('upsert', a), b),
    maybeSingle: async () => ({ data: existingName === null ? null : { name: existingName }, error: null }),
    single: async () => {
      const row = (calls.filter(c => c.table === table && c.op === 'upsert').pop()?.args[0] ?? {}) as any;
      return { data: { ...row, id: row.id ?? 'new-id' }, error: null };
    },
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  };
  return b;
}

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../../src/services/mockData', () => ({ USE_MOCK_DATA: false }));
jest.mock('../../src/services/supabase', () => ({ supabase: { from: (t: string) => mockBuilder(t) } }));

import { categoryStore } from '../../src/services/categoryStore';

const partsUpdates = () => calls.filter(c => c.table === 'parts' && c.op === 'update');
const partsFilters = () =>
  calls.filter(c => c.table === 'parts' && (c.op === 'eq' || c.op === 'or')).map(c => [c.op, ...c.args]);

beforeEach(() => {
  calls.length = 0;
  existingName = null;
});

describe('categoryStore.save — renaming moves the products with it', () => {
  it('moves products from the old name to the new one, within the tenant', async () => {
    existingName = 'Headsets';
    await categoryStore.save({ id: 'c1', name: 'Headphones', tenantId: 't1' });

    expect(partsUpdates()).toHaveLength(1);
    expect(partsUpdates()[0].args[0]).toEqual({ category: 'Headphones' });
    // Every spelling of the old name moves ("Headsets" and "Headset").
    expect(partsFilters()).toEqual([
      ['or', 'category.ilike."Headsets",category.ilike."Headset"'],
      ['eq', 'tenant_id', 't1'],
    ]);
  });

  it('moves the products BEFORE renaming the tile, so a failed save can be retried', async () => {
    existingName = 'Headsets';
    await categoryStore.save({ id: 'c1', name: 'Headphones', tenantId: 't1' });

    const order = calls.filter(c => c.op === 'update' || c.op === 'upsert').map(c => `${c.table}.${c.op}`);
    expect(order).toEqual(['parts.update', 'categories.upsert']);
  });

  it('touches no products when only the logo or order changed', async () => {
    existingName = 'Phones';
    await categoryStore.save({ id: 'c2', name: 'Phones', tenantId: 't1', sortOrder: 3 });
    expect(partsUpdates()).toHaveLength(0);
  });

  it('ignores padding: " Phones " is not a rename of "Phones"', async () => {
    existingName = 'Phones';
    await categoryStore.save({ id: 'c2', name: ' Phones ', tenantId: 't1' });
    expect(partsUpdates()).toHaveLength(0);
  });

  it('touches no products when creating a new category', async () => {
    await categoryStore.save({ name: 'Cables', tenantId: 't1' });
    expect(partsUpdates()).toHaveLength(0);
  });
});
