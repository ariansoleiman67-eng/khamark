// Category store with logos. Lets the admin manage category name + logo (instead
// of the auto letter/gradient icons) shown on the Categories screen tiles.
// Mock-backed (AsyncStorage) so it works offline; mirrors brandService. When live,
// categories come from the Supabase `categories` table via tenantAdminService.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';
import { supabase } from './supabase';
import type { TenantCategory } from './tenantAdminService';

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

const STORAGE_KEY = '@asankary_categories_mock_v1';

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
  async getAll(): Promise<StoredCategory[]> {
    if (!USE_MOCK_DATA) {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });
      if (error) { console.error('categoryStore getAll', error); return []; }
      return (data || []).map(mapRow);
    }
    return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  // Consumed by categoryService.getActiveCategories (mock branch) — feeds the
  // Categories screen's iconByName (name -> logo), so tiles show admin logos.
  async getActiveTenantCategories(): Promise<TenantCategory[]> {
    if (!USE_MOCK_DATA) {
      const { data, error } = await supabase.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true });
      if (error) { console.error('categoryStore getActive', error); return []; }
      return (data || []).map(mapRow).map(toTenantCategory);
    }
    return (await readMock()).filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(toTenantCategory);
  },

  async save(cat: Partial<StoredCategory> & { name: string }): Promise<StoredCategory> {
    if (!USE_MOCK_DATA) {
      const row: any = {
        name: cat.name,
        image_url: cat.logoUrl ?? null,
        is_active: cat.isActive ?? true,
        sort_order: cat.sortOrder ?? 0,
      };
      if (cat.id) row.id = cat.id;
      if ((cat as any).tenantId) row.tenant_id = (cat as any).tenantId;
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
