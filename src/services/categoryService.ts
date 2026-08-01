import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { TenantCategory } from './tenantAdminService';
import { USE_MOCK_DATA } from './mockData';
import { categoryStore } from './categoryStore';

// Categories are near-static but were fetched on every Categories-screen focus,
// so the tiles waited on the network each visit. Serve the last result instantly
// and refresh in the background.
const CATEGORY_TTL_MS = 10 * 60 * 1000;
const categoryMemoryCache = new Map<string, { data: TenantCategory[]; timestamp: number }>();
const CATEGORY_CACHE_PREFIX = 'cache_categories_v1_';
const categoryCacheKey = (tenantId?: string) => `${CATEGORY_CACHE_PREFIX}${tenantId || 'all'}`;

// snake_case DB row -> camelCase domain (same shape as tenantAdminService.mapCategory).
const mapCategory = (row: any): TenantCategory => ({
  id: row.id,
  name: row.name,
  nameAr: row.name_ar ?? undefined,
  nameKu: row.name_ku ?? undefined,
  description: row.description ?? undefined,
  imageUrl: row.image_url ?? undefined,
  productCount: row.product_count ?? 0,
  isActive: row.is_active ?? true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const categoryService = {
  /**
   * Active categories for a shop — used by the customer Categories screen and
   * anywhere outside the admin (tenant-scoped) context. Read-only; best-effort
   * (returns [] on error so the UI can fall back to its default icons).
   */
  // tenantId is optional: customers browse without one (only admins resolve a
  // tenant), and bailing out on a missing id meant admin-uploaded category images
  // never reached the storefront. Filter by tenant only when we actually have one.
  async getActiveCategories(tenantId?: string): Promise<TenantCategory[]> {
    if (USE_MOCK_DATA) return categoryStore.getActiveTenantCategories();

    const key = categoryCacheKey(tenantId);
    const cached = categoryMemoryCache.get(key) ?? (await readCategoryCache(key));
    if (cached) {
      categoryMemoryCache.set(key, cached);
      if (Date.now() - cached.timestamp > CATEGORY_TTL_MS) {
        // Stale: hand back what we have now, refresh for next time.
        fetchActiveCategories(tenantId)
          .then((fresh) => writeCategoryCache(key, fresh))
          .catch(() => {});
      }
      return cached.data;
    }

    try {
      const fresh = await fetchActiveCategories(tenantId);
      await writeCategoryCache(key, fresh);
      return fresh;
    } catch (error: any) {
      console.warn('getActiveCategories failed', error?.message);
      return [];
    }
  },

  /** Drop cached categories (call after an admin add/edit/delete). */
  async clearCache(): Promise<void> {
    categoryMemoryCache.clear();
    try {
      // Clear by key prefix, not by the keys loaded this session: after a cold start
      // the memory map is empty, so the old code removed nothing and an edited
      // category kept showing its stale name/logo until the TTL ran out.
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(CATEGORY_CACHE_PREFIX)));
    } catch {
      // ignore
    }
  },
};

async function fetchActiveCategories(tenantId?: string): Promise<TenantCategory[]> {
  let query = supabase
    .from('categories')
    .select('*')
    .eq('is_active', true);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapCategory);
}

async function readCategoryCache(key: string): Promise<{ data: TenantCategory[]; timestamp: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.data) && parsed.timestamp ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCategoryCache(key: string, data: TenantCategory[]): Promise<void> {
  const entry = { data, timestamp: Date.now() };
  categoryMemoryCache.set(key, entry);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // non-fatal
  }
}
