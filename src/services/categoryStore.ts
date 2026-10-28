// Category store with logos. Lets the admin manage category name + logo (instead
// of the auto letter/gradient icons) shown on the Categories screen tiles.
// Mock-backed (AsyncStorage) so it works offline; mirrors brandService. When live,
// categories come from the Supabase `categories` table via tenantAdminService.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';
import { supabase } from './supabase';
import type { TenantCategory } from './tenantAdminService';
import { categoryOrFilter, groupCategoryNames } from '../utils/categoryMatch';

// Map a Supabase `categories` row to the StoredCategory type.
const mapRow = (r: any): StoredCategory => ({
  id: r.id,
  name: r.name,
  logoUrl: r.image_url ?? undefined,
  isActive: r.is_active ?? true,
  sortOrder: r.sort_order ?? 0,
});

export interface StoredCategory {
  id: string;
  name: string;
  logoUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

const STORAGE_KEY = '@khamark_categories_mock_v1';

// Seed from the demo product categories.
const SEED: StoredCategory[] = [
  'Trackers', 'Power Banks', 'Chargers', 'Security', 'Phones', 'Cables', 'Bags', 'Accessories', 'Smartwatches',
].map((name, i) => ({ id: `cat-${name.toLowerCase().replace(/\s+/g, '-')}`, name, isActive: true, sortOrder: i }));

async function readMock(): Promise<StoredCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to seed
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED)).catch(() => {});
  return SEED.slice();
}

async function writeMock(list: StoredCategory[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list)).catch(() => {});
}

const toTenantCategory = (c: StoredCategory): TenantCategory => ({
  id: c.id,
  name: c.name,
  imageUrl: c.logoUrl,
  productCount: 0,
  isActive: c.isActive,
  sortOrder: c.sortOrder,
  createdAt: '' as any,
  updatedAt: '' as any,
});

export const categoryStore = {
  // tenantId is required for parity with tenantAdminService.getCategories(), which
  // the product editor's category picker uses — it filters on tenant_id, so rows
  // written without one were invisible there ("No categories yet").
  async getAll(tenantId?: string): Promise<StoredCategory[]> {
    if (!USE_MOCK_DATA) {
      let q = supabase.from('categories').select('*');
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.order('sort_order', { ascending: true });
      if (error) { console.error('categoryStore getAll', error); return []; }
      return (data || []).map(mapRow);
    }
    return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  // Consumed by categoryService.getActiveCategories (mock branch) — feeds the
  // Categories screen's iconByName (name -> logo), so tiles show admin logos.
  // tenantId is optional (callers without one still get every shop's categories):
  // pass it from admin screens — the product editor's picker was listing other
  // stores' categories, and picking one wrote that foreign name onto the product.
  async getActiveTenantCategories(tenantId?: string): Promise<TenantCategory[]> {
    if (!USE_MOCK_DATA) {
      let q = supabase.from('categories').select('*').eq('is_active', true);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.order('sort_order', { ascending: true });
      if (error) { console.error('categoryStore getActive', error); return []; }
      return (data || []).map(mapRow).map(toTenantCategory);
    }
    return (await readMock()).filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(toTenantCategory);
  },

  async save(cat: Partial<StoredCategory> & { name: string; tenantId?: string }): Promise<StoredCategory> {
    if (!USE_MOCK_DATA) {
      const row: any = {
        name: cat.name,
        image_url: cat.logoUrl ?? null,
        is_active: cat.isActive ?? true,
        sort_order: cat.sortOrder ?? 0,
      };
      if (cat.id) row.id = cat.id;
      // Always stamp the owning tenant — without it the row is orphaned and the
      // product editor's tenant-scoped picker can't see the category.
      if (cat.tenantId) row.tenant_id = cat.tenantId;

      // A RENAME MUST MOVE THE PRODUCTS. Products name their category by text
      // (parts.category), not by id, so renaming only this row left every
      // product in it under a name no tile has — gone from every category page.
      // Live, 11 products were stranded that way ("Earphone", "Headsets").
      //
      // Products first, tile second: if the rename then fails, a retry still
      // reads the old name here and finishes the job. The other order would
      // leave the products stranded with no way back from this screen.
      if (cat.id) {
        const { data: existing } = await supabase
          .from('categories')
          .select('name')
          .eq('id', cat.id)
          .maybeSingle();
        const before = (existing?.name ?? '').trim();
        const after = cat.name.trim();
        if (before && before !== after) {
          // Every spelling of the old name moves, not just the exact one —
          // "Earphone" products follow an "Earphones" tile (categoryOrFilter).
          let move = supabase.from('parts').update({ category: after }).or(categoryOrFilter(before));
          if (cat.tenantId) move = move.eq('tenant_id', cat.tenantId);
          const { error: moveError } = await move;
          if (moveError) throw moveError;
        }
      }

      const { data, error } = await supabase.from('categories').upsert(row).select().single();
      if (error) throw error;
      return mapRow(data);
    }
    const list = await readMock();
    if (cat.id) {
      const idx = list.findIndex(c => c.id === cat.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...cat } as StoredCategory;
        await writeMock(list);
        return list[idx];
      }
    }
    const created: StoredCategory = {
      id: `cat-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      name: cat.name,
      logoUrl: cat.logoUrl,
      isActive: cat.isActive ?? true,
      sortOrder: cat.sortOrder ?? list.length,
    };
    list.push(created);
    await writeMock(list);
    return created;
  },

  /**
   * How many of the tenant's products are filed under this category name, so a
   * delete can say what it strands. null when it cannot be counted.
   */
  async countProducts(name: string, tenantId?: string): Promise<number | null> {
    if (USE_MOCK_DATA) return null;
    let q = supabase.from('parts').select('id', { count: 'exact', head: true }).or(categoryOrFilter(name));
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { count, error } = await q;
    return error ? null : count ?? 0;
  },

  /**
   * The category names the tenant's products actually use — one entry per
   * category however it is spelled, with a count. Category Manager compares
   * these with its tiles to show what has no tile yet, and to autocorrect a
   * name as it is typed. [] when it cannot be read.
   */
  async productCategoryCounts(tenantId?: string): Promise<Array<{ name: string; count: number }>> {
    if (USE_MOCK_DATA) return [];
    let q = supabase.from('parts').select('category').limit(5000);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error || !data) return [];
    return groupCategoryNames(data.map((r: { category: string | null }) => r.category));
  },

  async remove(id: string): Promise<void> {
    if (!USE_MOCK_DATA) {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      return;
    }
    const list = (await readMock()).filter(c => c.id !== id);
    await writeMock(list);
  },
};
