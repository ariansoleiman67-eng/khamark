import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, uniqueChannel } from './supabase';
import { Product, SearchFilters, PaginationInfo } from '../types';
import { CACHE_EXPIRATION, PAGINATION } from '../constants/config';
import {
  USE_MOCK_DATA,
  mockGetProducts,
  mockGetProduct,
  mockGetFeatured,
  mockGetByCategory,
  mockGetByIds,
  mockSearch,
  mockGetCategories,
} from './mockData';

// Helper to convert snake_case DB fields to camelCase for the frontend
export const mapProduct = (data: any): Product => ({
  id: data.id,
  name: data.name,
  nameAr: data.name_ar,
  nameKu: data.name_ku,
  partNumber: data.part_number,
  category: data.category,
  categoryAr: data.category_ar,
  categoryKu: data.category_ku,
  priceUSD: data.price_usd,
  purchasePrice: data.purchase_price,
  stockQty: data.stock_qty,
  historicalStockQty: data.historical_stock_qty,
  initialStock: data.initial_stock,
  description: data.description,
  descriptionAr: data.description_ar,
  descriptionKu: data.description_ku,
  isFeatured: data.is_featured,
  isActive: data.is_active,
  brand: data.brand,
  imageUrls: data.image_urls || [],
  compatibleModels: data.compatible_models || [],
  variations: data.variations || [],
  colorVariations: data.color_variations || [],
  priceTiers: data.price_tiers || [],
  shippingRates: data.shipping_rates || [],
  shippingCost: data.shipping_cost,
  specifications: data.specifications || {},
  weight: data.weight,
  videoUrl: data.video_url,
  tenantId: data.tenant_id,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
  status: data.status || 'available',
  // "coming_soon" / "on_the_way" items hold their *incoming* quantity in
  // stock_qty but are NOT actually available — only 'available' counts as in stock.
  // Variation products keep stock_qty=0 (real stock lives per-variation), so also
  // treat any in-stock size/color variation as in stock.
  inStock: (data.status == null || data.status === 'available') &&
    ((data.stock_qty || 0) > 0 ||
     (data.variations || []).some((v: any) => (v?.stockQuantity || 0) > 0) ||
     (data.color_variations || []).some((v: any) => (v?.stockQuantity || 0) > 0)),
});

// Columns needed for product LIST/CARD views. Excludes heavy detail-only fields
// (descriptions, specifications, compatible_models, shipping_rates, color_variations,
// video_url, purchase_price, weight) so lists load fast and stay light on memory.
// The product DETAIL screen fetches the full row separately.
const LIST_COLUMNS =
  'id,name,name_ar,name_ku,part_number,category,category_ar,category_ku,price_usd,stock_qty,status,is_featured,is_active,brand,image_urls,price_tiers,variations,color_variations,shipping_cost,shipping_rates,tenant_id,created_at,updated_at';

// Inverse of `mapProduct`: convert a camelCase product payload (as built by the
// admin product editor) into a snake_case `parts` row. Only keys present in the
// input are emitted, so it is safe for partial UPDATEs. Keys that aren't real
// columns (admin / chat-routing metadata) are returned separately to be merged
// into the `parts.extra_data` jsonb — matching how the Firestore→Supabase sync
// stored them. Unknown keys are dropped, which prevents the PostgREST
// "column does not exist" errors that were silently failing every admin product
// create/edit.
const PART_COLUMN_MAP: Record<string, string> = {
  name: 'name', nameAr: 'name_ar', nameKu: 'name_ku',
  partNumber: 'part_number',
  category: 'category', categoryAr: 'category_ar', categoryKu: 'category_ku',
  priceUSD: 'price_usd', purchasePrice: 'purchase_price',
  stockQty: 'stock_qty', historicalStockQty: 'historical_stock_qty', initialStock: 'initial_stock',
  description: 'description', descriptionAr: 'description_ar', descriptionKu: 'description_ku',
  brand: 'brand', imageUrls: 'image_urls',
  priceTiers: 'price_tiers', compatibleModels: 'compatible_models',
  isFeatured: 'is_featured', isActive: 'is_active',
  status: 'status', variations: 'variations', colorVariations: 'color_variations',
  videoUrl: 'video_url', shippingCost: 'shipping_cost', shippingRates: 'shipping_rates',
  weight: 'weight', sortOrder: 'sort_order', specifications: 'specifications',
};
// Non-column metadata the admin editor sends — folded into `extra_data` jsonb.
const PART_EXTRA_KEYS = ['ownerAdminId', 'adminId', 'coAdminIds', 'options', 'videoUpdatedAt', 'inStock'];

export const toPartRow = (
  input: Record<string, any>
): { row: Record<string, any>; extra: Record<string, any> } => {
  const row: Record<string, any> = {};
  const extra: Record<string, any> = {};
  const snakeColumns = new Set(Object.values(PART_COLUMN_MAP));
  for (const [key, value] of Object.entries(input || {})) {
    if (value === undefined) continue;
    if (PART_COLUMN_MAP[key]) row[PART_COLUMN_MAP[key]] = value;   // camelCase -> column
    else if (snakeColumns.has(key)) row[key] = value;             // already snake_case column
    else if (PART_EXTRA_KEYS.includes(key)) extra[key] = value;   // -> extra_data jsonb
    // else: not a column (id, createdAt, tenantId, …) -> drop
  }
  return { row, extra };
};

export class ProductService {
  private static memoryCache = new Map<string, { data: any; timestamp: number }>();
  // Tracks in-flight stale-while-revalidate refreshes so we never fire duplicate
  // background fetches for the same cache key.
  private static revalidating = new Set<string>();

  static async getProducts(
    filters: SearchFilters = {},
    pageInfo: PaginationInfo = { page: 1, limit: PAGINATION.PRODUCTS_PER_PAGE, total: 0, hasMore: true },
    tenantId?: string,
    forceRefresh = false
  ): Promise<{ products: Product[]; pagination: PaginationInfo }> {
    if (USE_MOCK_DATA) return mockGetProducts(filters, pageInfo);
    try {
      const cacheKey = `products_${JSON.stringify(filters)}_${pageInfo.page}_${pageInfo.limit}_${tenantId || 'global'}`;
      // forceRefresh skips the cache read (e.g. realtime change events) so we
      // always serve the freshly-changed row instead of stale-but-unexpired cache.
      if (!forceRefresh) {
        const cached = await this.getCachedData(cacheKey);
        if (cached && !this.isCacheExpired(cached.timestamp)) return cached.data;
      }

      let query = supabase.from('parts').select(LIST_COLUMNS);

      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.brand) query = query.eq('brand', filters.brand);

      if (filters.sortBy) {
        const ascending = filters.sortOrder === 'asc';
        switch (filters.sortBy) {
          case 'name':
            query = query.order('name', { ascending });
            break;
          case 'price':
            query = query.order('price_usd', { ascending });
            break;
          case 'date':
            query = query.order('created_at', { ascending });
            break;
          default:
            query = query.order('created_at', { ascending: false });
        }
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const from = (pageInfo.page - 1) * pageInfo.limit;
      const to = from + pageInfo.limit - 1;
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) throw error;

      const products = (data || [])
        .map(mapProduct)
        .filter(p => p.isActive !== false)
        // Use the computed inStock (counts variation/color stock + respects status),
        // not raw stock_qty which is 0 for variation products.
        .filter(p => !filters.inStock || p.inStock);

      const result = {
        products,
        pagination: {
          ...pageInfo,
          hasMore: (data || []).length === pageInfo.limit,
        },
      };

      await this.setCachedData(cacheKey, result);
      return result;
    } catch (error: any) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  static async searchProducts(
    searchQuery: string,
    filters: SearchFilters = {},
    tenantId?: string
  ): Promise<Product[]> {
    try {
      if (USE_MOCK_DATA) return mockSearch(searchQuery);
      if (!searchQuery || searchQuery.length < 2) return [];

      const cacheKey = `search_${searchQuery}_${JSON.stringify(filters)}_${tenantId || 'global'}`;
      const cached = await this.getCachedData(cacheKey);
      if (cached && !this.isCacheExpired(cached.timestamp)) return cached.data;

      // Simple text search implementation (fetches broadly then filters client-side like before)
      let query = supabase.from('parts').select(LIST_COLUMNS).order('name');
      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (filters.category) query = query.eq('category', filters.category);

      const { data, error } = await query;
      if (error) throw error;

      const searchLower = searchQuery.toLowerCase();
      let searchResults = (data || [])
        .map(mapProduct)
        // Hide deactivated/hidden products from search, matching getProducts,
        // getProductsByTenantId, getFeaturedProducts and getProductsByCategory.
        .filter((p: any) => p.isActive !== false)
        .filter((p: any) => {
        if (
          (p.name && p.name.toLowerCase().includes(searchLower)) ||
          (p.nameAr && p.nameAr.toLowerCase().includes(searchLower)) ||
          (p.nameKu && p.nameKu.toLowerCase().includes(searchLower)) ||
          (p.partNumber && p.partNumber.toLowerCase().includes(searchLower)) ||
          (p.description && p.description.toLowerCase().includes(searchLower)) ||
          (p.category && p.category.toLowerCase().includes(searchLower)) ||
          (p.brand && p.brand.toLowerCase().includes(searchLower))
        ) return true;
        return false;
      });

      if (filters.minPrice != null) searchResults = searchResults.filter(p => (p.priceUSD || 0) >= filters.minPrice!);
      if (filters.maxPrice != null) searchResults = searchResults.filter(p => (p.priceUSD || 0) <= filters.maxPrice!);
      // Use the computed inStock (counts variation/color stock + respects status),
      // not raw stock_qty which is 0 for variation products — matches getProducts.
      if (filters.inStock) searchResults = searchResults.filter(p => p.inStock);

      await this.setCachedData(cacheKey, searchResults);
      return searchResults;
    } catch (error: any) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  static async getProduct(productId: string, tenantId?: string): Promise<Product | null> {
    if (USE_MOCK_DATA) return mockGetProduct(productId);
    try {
      const cacheKey = `product_${productId}_${tenantId || 'global'}`;
      const cached = await this.getCachedData(cacheKey);
      if (cached && !this.isCacheExpired(cached.timestamp)) return cached.data;

      let query = supabase.from('parts').select('*').eq('id', productId);
      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, error } = await query.single();
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      const product = mapProduct(data);
      await this.setCachedData(cacheKey, product);
      return product;
    } catch (error: any) {
      console.error('Error getting product:', error);
      throw error;
    }
  }

  static async getFeaturedProducts(tenantId?: string): Promise<Product[]> {
    if (USE_MOCK_DATA) return mockGetFeatured();
    try {
      const cacheKey = `featured_products_${tenantId || 'global'}`;
      const cached = await this.getCachedData(cacheKey);
      if (cached && !this.isCacheExpired(cached.timestamp)) return cached.data;

      let query = supabase
        .from('parts')
        .select(LIST_COLUMNS)
        .eq('is_featured', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, error } = await query;
      if (error) throw error;

      const products = (data || []).map(mapProduct);
      await this.setCachedData(cacheKey, products);
      return products;
    } catch (error: any) {
      console.error('Error getting featured products:', error);
      throw error;
    }
  }

  // Fetch many products in ONE query (used by Favorites). Preserves the input order.
  // Cached + stale-while-revalidate: returns instantly from cache (even when stale)
  // and refreshes in the background, so the favorites grid never waits on the network.
  // Pass forceRefresh=true (pull-to-refresh) to bypass the cache.
  static async getProductsByIds(ids: string[], forceRefresh = false): Promise<Product[]> {
    if (USE_MOCK_DATA) return mockGetByIds(ids);
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if (unique.length === 0) return [];

    const cacheKey = `products_by_ids_${[...unique].sort().join(',')}`;
    const fetcher = async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('parts')
        .select(LIST_COLUMNS)
        .in('id', unique);
      if (error) throw error;
      return (data || []).map(mapProduct);
    };
    // Re-apply the caller's requested order (the cache may hold a different order).
    const ordered = (list: Product[]): Product[] => {
      const byId = new Map(list.map(p => [p.id, p]));
      return unique.map(id => byId.get(id)).filter(Boolean) as Product[];
    };

    try {
      if (!forceRefresh) {
        const cached = await this.getCachedData(cacheKey);
        if (cached) {
          if (this.isCacheExpired(cached.timestamp)) this.revalidate(cacheKey, fetcher);
          return ordered(cached.data);
        }
      }
      const products = await fetcher();
      await this.setCachedData(cacheKey, products);
      return ordered(products);
    } catch (error: any) {
      console.error('Error fetching products by ids:', error);
      const cached = await this.getCachedData(cacheKey);
      if (cached) return ordered(cached.data);
      // No cache to fall back on — surface the failure so the caller can show a
      // retry state instead of an empty list that looks like "no favorites".
      throw error;
    }
  }

  // Cached + stale-while-revalidate per tenant (powers Search & Store screens).
  // Pass forceRefresh=true (pull-to-refresh) to bypass the cache.
  static async getProductsByTenantId(tenantId: string, forceRefresh = false): Promise<Product[]> {
    if (USE_MOCK_DATA) {
      const res = await mockGetProducts({}, { page: 1, limit: 200, total: 0, hasMore: true });
      return res.products;
    }
    const cacheKey = `products_by_tenant_${tenantId}`;
    const fetcher = async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('parts')
        .select(LIST_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapProduct).filter(p => p.isActive !== false);
    };

    try {
      if (!forceRefresh) {
        const cached = await this.getCachedData(cacheKey);
        if (cached) {
          if (this.isCacheExpired(cached.timestamp)) this.revalidate(cacheKey, fetcher);
          return cached.data;
        }
      }
      const products = await fetcher();
      await this.setCachedData(cacheKey, products);
      return products;
    } catch (error: any) {
      console.error('Error fetching products by tenant:', error);
      const cached = await this.getCachedData(cacheKey);
      return cached?.data || [];
    }
  }

  static async getProductsByCategory(category: string, tenantId?: string): Promise<Product[]> {
    if (USE_MOCK_DATA) return mockGetByCategory(category);
    try {
      const cacheKey = `category_${category}_${tenantId || 'global'}`;
      const cached = await this.getCachedData(cacheKey);
      if (cached && !this.isCacheExpired(cached.timestamp)) return cached.data;

      let query = supabase
        .from('parts')
        .select(LIST_COLUMNS)
        .eq('category', category)
        .eq('is_active', true)
        .order('stock_qty', { ascending: false })
        .order('created_at', { ascending: false });

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, error } = await query;
      if (error) throw error;

      const products = (data || []).map(mapProduct);
      await this.setCachedData(cacheKey, products);
      return products;
    } catch (error: any) {
      console.error('Error getting products by category:', error);
      throw error;
    }
  }

  static async getCategories(tenantId?: string): Promise<Array<{ name: string; count: number }>> {
    if (USE_MOCK_DATA) return mockGetCategories();
    try {
      const cacheKey = `categories_with_counts_${tenantId || 'global'}`;
      const cached = await this.getCachedData(cacheKey);
      if (cached && !this.isCategoryExpired(cached.timestamp)) return cached.data;

      let query = supabase.from('parts').select('category').eq('is_active', true);
      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, error } = await query;
      if (error) throw error;

      const categoryMap = new Map<string, number>();
      (data || []).forEach(d => {
        if (d.category) categoryMap.set(d.category, (categoryMap.get(d.category) || 0) + 1);
      });

      const categories = Array.from(categoryMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      await this.setCachedData(cacheKey, categories);
      return categories;
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  static subscribeToProducts(
    callback: (products: Product[]) => void,
    filters: SearchFilters = {},
    tenantId?: string
  ) {
    const channel = uniqueChannel('public:parts');
    
    // Note: Complex filtering on client for realtime
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'parts' },
      async () => {
        // Simple strategy: just re-fetch the first page on change.
        // Bypass the cache (forceRefresh) so a change event serves the fresh row,
        // and swallow errors so a failed fetch can't become an unhandled rejection.
        try {
          const result = await this.getProducts(filters, { page: 1, limit: 50, total: 0, hasMore: true }, tenantId, true);
          callback(result.products);
        } catch (error) {
          console.error('Error refreshing products on realtime change:', error);
        }
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  private static async getCachedData(key: string): Promise<any> {
    try {
      const mem = this.memoryCache.get(key);
      if (mem && mem.timestamp) return mem;

      const cached = await AsyncStorage.getItem(`cache_${key}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.timestamp) {
          this.memoryCache.set(key, parsed);
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private static async setCachedData(key: string, data: any): Promise<void> {
    try {
      const cacheData = { data, timestamp: Date.now() };
      this.memoryCache.set(key, cacheData);
      try {
        await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(cacheData));
      } catch {}
    } catch {}
  }

  // Fire-and-forget background refresh for stale-while-revalidate. Dedupes
  // concurrent refreshes per key and writes the fresh result back to cache, so
  // the NEXT read (e.g. next screen focus) gets fresh data with zero blocking.
  private static revalidate(cacheKey: string, fetcher: () => Promise<any>): void {
    if (this.revalidating.has(cacheKey)) return;
    this.revalidating.add(cacheKey);
    fetcher()
      .then(data => this.setCachedData(cacheKey, data))
      .catch(() => {})
      .finally(() => this.revalidating.delete(cacheKey));
  }

  private static isCacheExpired(timestamp: number): boolean {
    return Date.now() - timestamp > CACHE_EXPIRATION.PRODUCTS;
  }

  private static isCategoryExpired(timestamp: number): boolean {
    return Date.now() - timestamp > CACHE_EXPIRATION.CATEGORIES;
  }

  static async clearCache(): Promise<void> {
    try {
      this.memoryCache.clear();
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith('cache_'));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }
}

export default ProductService;
