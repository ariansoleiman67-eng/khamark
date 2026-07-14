// Category store with logos. Lets the admin manage category name + logo (instead
// of the auto letter/gradient icons) shown on the Categories screen tiles.
// Mock-backed (AsyncStorage) so it works offline; mirrors brandService. When live,
// categories come from the Supabase `categories` table via tenantAdminService.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';
import type { TenantCategory } from './tenantAdminService';

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
    if (!USE_MOCK_DATA) return [];
    return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  // Consumed by categoryService.getActiveCategories (mock branch) — feeds the
  // Categories screen's iconByName (name -> logo), so tiles show admin logos.
  async getActiveTenantCategories(): Promise<TenantCategory[]> {
    if (!USE_MOCK_DATA) return [];
    return (await readMock()).filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(toTenantCategory);
  },

  async save(cat: Partial<StoredCategory> & { name: string }): Promise<StoredCategory> {
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
      id: `cat-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${list.length}`,
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
    const list = (await readMock()).filter(c => c.id !== id);
    await writeMock(list);
  },
};
