import { supabase } from './supabase';
import type { TenantCategory } from './tenantAdminService';
import { USE_MOCK_DATA, mockActiveCategories } from './mockData';

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
  async getActiveCategories(tenantId: string): Promise<TenantCategory[]> {
    if (USE_MOCK_DATA) return mockActiveCategories() as unknown as TenantCategory[];
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      console.warn('getActiveCategories failed', error.message);
      return [];
    }
    return (data || []).map(mapCategory);
  },
};
