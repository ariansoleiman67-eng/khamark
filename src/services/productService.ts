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
  // Postgres numeric can arrive as a string; coerce money/stock so price math and
  // the stock_qty > 0 in-stock check stay consistent with the other coerced fields.
  priceUSD: data.price_usd != null ? Number(data.price_usd) : data.price_usd,
  // Set only for products the shop priced in dinar. Left undefined otherwise so
  // isIQDPriced() stays false and every existing USD path behaves as before.
  priceIQD: data.price_iqd != null ? Number(data.price_iqd) : undefined,
  vipPriceUSD: data.vip_price_usd != null ? Number(data.vip_price_usd) : undefined,
  vipPriceIQD: data.vip_price_iqd != null ? Number(data.vip_price_iqd) : undefined,
  compareAtPriceUSD: data.compare_at_price_usd != null ? Number(data.compare_at_price_usd) : undefined,
  compareAtPriceIQD: data.compare_at_price_iqd != null ? Number(data.compare_at_price_iqd) : undefined,
  storageOptions: data.storage_options || [],
  purchasePrice: data.purchase_price != null ? Number(data.purchase_price) : data.purchase_price,
  // Admin paths only: purchase_price_iqd is not granted to anon/authenticated and
  // is absent from LIST_COLUMNS/DETAIL_COLUMNS, exactly like purchase_price.
  purchasePriceIQD: data.purchase_price_iqd != null ? Number(data.purchase_price_iqd) : undefined,
  stockQty: data.stock_qty != null ? Number(data.stock_qty) : data.stock_qty,
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
  warranty: data.warranty,
  sku: data.sku,
  barcode: data.barcode,
  dimensions: data.dimensions || undefined,
  // Defaults to 'new' so a row written before the column existed still reads sensibly.
  condition: data.condition || 'new',
  videoUrl: data.video_url,
  // Admin-controlled display order. Defaults to 0 for every never-reordered row,
  // so customer listings fall back to their previous ordering until an admin drags.
  sortOrder: data.sort_order,
  // Legacy cosmetic colours live in extra_data.options (mirrors mapTenantProduct).
  // Only present on the detail fetch (DETAIL_COLUMNS); LIST_COLUMNS omits extra_data.
  options: data.extra_data?.options,
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
// (descriptions, specifications, compatible_models, video_url, purchase_price,
// weight) so lists load fast and stay light on memory. The product DETAIL screen
// fetches the full row separately.
// `variations` and `color_variations` ARE selected despite being bulky: a product
// stocked only through colour rows has stock_qty 0, so without them every card
// rendered "Out of Stock" for a product the detail page happily sold. Do not trim
// them from this list.
// `barcode` IS included despite being detail-ish: BarcodeScannerScreen hands the
// scanned value to Search, which matches it against this already-loaded list — a
// column that isn't selected is undefined, so every scan returned zero results.
/**
 * Columns added by a migration that may not have run yet on the database this
 * build is talking to.
 *
 * Postgres rejects the WHOLE query with 42703 when a select names a column that
 * does not exist — so a single un-applied migration does not degrade one feature,
 * it empties the catalogue. That is exactly what happened: vip_price_iqd shipped
 * in the select list before its migration was applied, and every product query in
 * the app started failing at once.
 *
 * The names are dropped from the select on the first 42703 and the query retried,
 * once per session. A shop whose migration is pending sells as it did yesterday
 * instead of showing an empty shelf.
 */
const PENDING_MIGRATION_COLUMNS = ['vip_price_iqd', 'compare_at_price_iqd'] as const;

/** Set on the first 42703, so the fallback costs one failed request, not one per query. */
let missingColumns: string[] = [];

const withoutMissingColumns = (columns: string): string => {
  if (missingColumns.length === 0) return columns;
  return columns
    .split(',')
    .filter((c) => !missingColumns.includes(c.trim()))
    .join(',');
};

/** True when this error is Postgres telling us a selected column does not exist. */
const isMissingColumnError = (error: any): boolean =>
  error?.code === '42703' && typeof error?.message === 'string';

/**
 * Note which pending column the error names, so the retry drops it. Returns false
 * when the error is about something else entirely and retrying would be pointless.
 */
const noteMissingColumn = (error: any): boolean => {
  if (!isMissingColumnError(error)) return false;
  // Every pending column the error names, whether or not it is already recorded.
  // Concurrent queries all go out with the bad column: the first one records it,
  // and if the others were then told "nothing new to note, do not retry" they
  // would throw and the screen behind them would show an empty catalogue while
  // its neighbour recovered. Retry eligibility is about THIS query, not about
  // whether some other query already learned the same fact.
  const named = PENDING_MIGRATION_COLUMNS.filter((c) => String(error.message).includes(c));
  if (named.length === 0) return false;
  const unseen = named.filter((c) => !missingColumns.includes(c));
  if (unseen.length > 0) {
    missingColumns = [...missingColumns, ...unseen];
    // eslint-disable-next-line no-console
    console.warn(
      `[productService] ${unseen.join(', ')} missing from the database — a migration has not been applied. ` +
        'Serving products without it. Apply supabase/migrations to restore the feature.',
    );
  }
  return true;
};

/**
 * Run a select that names a possibly-pending column, and if Postgres rejects it
 * with 42703, drop the column and run it once more.
 *
 * `build` must CONSTRUCT the query, not receive it: a PostgREST builder is a
 * one-shot thenable, so the retry has to re-create it — and it has to re-read
 * `withoutMissingColumns`, which noteMissingColumn has just updated.
 *
 * Only getFeaturedProducts had this. Everything else threw, and since Postgres
 * rejects the WHOLE query on an unknown column, one un-applied migration emptied
 * the catalogue rather than degrading one field. That already happened once with
 * vip_price_iqd.
 */
const runWithColumnFallback = async <T>(
  build: () => PromiseLike<{ data: T | null; error: any }>,
): Promise<{ data: T | null; error: any }> => {
  const first = await build();
  if (first.error && noteMissingColumn(first.error)) return build();
  return first;
};

const LIST_COLUMNS =
  'id,name,name_ar,name_ku,part_number,barcode,category,category_ar,category_ku,price_usd,price_iqd,vip_price_usd,vip_price_iqd,compare_at_price_usd,compare_at_price_iqd,storage_options,stock_qty,status,is_featured,is_active,brand,image_urls,price_tiers,variations,color_variations,shipping_cost,shipping_rates,sort_order,tenant_id,created_at,updated_at,condition';

// Primary ordering for every customer-facing listing: the order the admin set by
// dragging in AdminProductsScreen (parts.sort_order). The column defaults to 0, so
// on a shop that has never been reordered every row ties and the existing
// .order(...) chained after it still decides — today's behaviour is preserved.
// Every column `mapProduct` reads on the DETAIL path, named — and one column
// deliberately absent: `purchase_price`, the cost this shop paid.
//
// WHY THIS IS A LIST AND NOT `select('*')`. `parts.purchase_price` is the shop's
// margin on every product it sells. Protecting it means taking the public role's
// permission to read that ONE column away, and Postgres can only express that by
// granting every other column by name — which makes `select *` fail outright for
// anyone not signed in. `getProduct` is the product screen, and it runs for
// customers who have not signed in, so the star had to go first or the screen
// would stop opening for them the moment the grant changed.
//
// Verified against the live table before it was written: this list returns 42
// columns, `select('*')` returns 43, and the difference is exactly
// `purchase_price`. Nothing else the mapper reads was dropped.
//
// THE COST IS STILL CAPTURED ON AN ORDER. CheckoutScreen batch-fetches it with
// its own `select('id, purchase_price')` while signed in — signed-in users keep
// the grant — and its comment already assumed the light list carried no cost.
// This makes the detail path agree with that assumption instead of contradicting
// it. `product.purchasePrice` is therefore undefined on this path now; the only
// reader was that checkout fallback, which the fresh fetch above it supersedes.
//
// Admin screens are unaffected: adminService and tenantAdminService run signed in
// as the owner and keep their own `select('*')`, cost included.
const DETAIL_COLUMNS = `${LIST_COLUMNS},description,description_ar,description_ku,specifications,compatible_models,dimensions,weight,warranty,video_url,sku,extra_data,initial_stock,historical_stock_qty`;

const SORT_ORDER_COLUMN = 'sort_order';
const SORT_ORDER_OPTS = { ascending: true, nullsFirst: false } as const;

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
  priceUSD: 'price_usd', priceIQD: 'price_iqd', vipPriceUSD: 'vip_price_usd', vipPriceIQD: 'vip_price_iqd',
  compareAtPriceUSD: 'compare_at_price_usd', compareAtPriceIQD: 'compare_at_price_iqd', storageOptions: 'storage_options',
  purchasePrice: 'purchase_price', purchasePriceIQD: 'purchase_price_iqd',
  stockQty: 'stock_qty', historicalStockQty: 'historical_stock_qty', initialStock: 'initial_stock',
  description: 'description', descriptionAr: 'description_ar', descriptionKu: 'description_ku',
  brand: 'brand', imageUrls: 'image_urls',
  priceTiers: 'price_tiers', compatibleModels: 'compatible_models',
  isFeatured: 'is_featured', isActive: 'is_active',
  status: 'status', variations: 'variations', colorVariations: 'color_variations',
  videoUrl: 'video_url', shippingCost: 'shipping_cost', shippingRates: 'shipping_rates',
  weight: 'weight', sortOrder: 'sort_order', specifications: 'specifications',
  warranty: 'warranty', sku: 'sku', barcode: 'barcode', dimensions: 'dimensions',
  condition: 'condition',
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

      // Built inside a closure so the 42703 fallback can construct it a SECOND
      // time with the offending column dropped — a PostgREST builder cannot be
      // awaited twice, and the column list has to be re-read after the failure.
      const build = () => {
        let query = supabase.from('parts').select(withoutMissingColumns(LIST_COLUMNS));

        if (tenantId) query = query.eq('tenant_id', tenantId);
        if (filters.category) query = query.eq('category', filters.category);
        if (filters.brand) query = query.eq('brand', filters.brand);
        // Filter inactive/hidden products in the DB (not after pagination) so pages
        // aren't left with holes and `hasMore` stays accurate.
        query = query.eq('is_active', true);

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
              query = query.order(SORT_ORDER_COLUMN, SORT_ORDER_OPTS).order('created_at', { ascending: false });
          }
        } else {
          query = query.order(SORT_ORDER_COLUMN, SORT_ORDER_OPTS).order('created_at', { ascending: false });
        }

        const from = (pageInfo.page - 1) * pageInfo.limit;
        const to = from + pageInfo.limit - 1;
        return query.range(from, to);
      };

      const { data, error } = await runWithColumnFallback(build);
      if (error) throw error;

      const products = (data || [])
        .map(mapProduct)
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
      const build = () => {
        let query = supabase.from('parts').select(withoutMissingColumns(LIST_COLUMNS)).order('name');
        if (tenantId) query = query.eq('tenant_id', tenantId);
        if (filters.category) query = query.eq('category', filters.category);
        return query;
      };

      const { data, error } = await runWithColumnFallback(build);
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
          // A scanned barcode is the exact query string the scanner passes through.
          (p.barcode && p.barcode.toLowerCase().includes(searchLower)) ||
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

      const build = () => {
        let query = supabase.from('parts').select(withoutMissingColumns(DETAIL_COLUMNS)).eq('id', productId);
        if (tenantId) query = query.eq('tenant_id', tenantId);
        return query.single();
      };

      const { data, error } = await runWithColumnFallback(build);
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
        .select(withoutMissingColumns(LIST_COLUMNS))
        .eq('is_featured', true)
        .eq('is_active', true)
        .order(SORT_ORDER_COLUMN, SORT_ORDER_OPTS)
        .order('created_at', { ascending: false })
        .limit(10);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      let { data, error } = await query;

      // First query of the session pays for the discovery: if the database is
      // behind on a migration, drop the column it does not have and ask again,
      // rather than showing an empty shop.
      if (error && noteMissingColumn(error)) {
        let retry = supabase
          .from('parts')
          .select(withoutMissingColumns(LIST_COLUMNS))
          .eq('is_featured', true)
          .eq('is_active', true)
          .order(SORT_ORDER_COLUMN, SORT_ORDER_OPTS)
          .order('created_at', { ascending: false })
          .limit(10);
        if (tenantId) retry = retry.eq('tenant_id', tenantId);
        ({ data, error } = await retry);
      }
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
      const { data, error } = await runWithColumnFallback(() => supabase
        .from('parts')
        .select(withoutMissingColumns(LIST_COLUMNS))
        .in('id', unique));
      if (error) throw error;
      // Don't surface hidden/deactivated products in Favorites.
      return (data || []).map(mapProduct).filter(p => p.isActive !== false);
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
      const { data, error } = await runWithColumnFallback(() => supabase
        .from('parts')
        .select(withoutMissingColumns(LIST_COLUMNS))
        .eq('tenant_id', tenantId)
        .order(SORT_ORDER_COLUMN, SORT_ORDER_OPTS)
        .order('created_at', { ascending: false }));
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

      const build = () => {
        let query = supabase
          .from('parts')
          .select(withoutMissingColumns(LIST_COLUMNS))
          .eq('category', category)
          .eq('is_active', true)
          .order(SORT_ORDER_COLUMN, SORT_ORDER_OPTS)
          .order('stock_qty', { ascending: false })
          .order('created_at', { ascending: false });

        if (tenantId) query = query.eq('tenant_id', tenantId);
        return query;
      };

      const { data, error } = await runWithColumnFallback(build);
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

  /**
   * Upper bound on memoryCache entries.
   *
   * Cache keys embed JSON.stringify(filters) + page, and getProductsByIds keys on the
   * entire id set (`products_by_ids_${ids.sort().join(',')}`). FavoritesScreen refetches
   * on every favorites change, so each add/remove mints a brand-new key holding a full
   * product list and nothing ever evicted the old one — 50 toggles retained 50 lists.
   *
   * The second-order effect is worse than the memory: setCachedData mirrors every key
   * to AsyncStorage, whose Android default is 6 MB. Exhausting it makes setItem throw
   * process-wide, and LocalCartService.saveCart only logs its failure — so the user's
   * cart silently stops persisting.
   */
  private static readonly MEMORY_CACHE_MAX = 100;

  // delete-then-set so re-inserting moves the key to the end; Map iterates in insertion
  // order, making the first key the least recently used.
  private static touchCache(key: string, value: { data: any; timestamp: number }): void {
    this.memoryCache.delete(key);
    this.memoryCache.set(key, value);
    while (this.memoryCache.size > this.MEMORY_CACHE_MAX) {
      const oldest = this.memoryCache.keys().next().value;
      if (oldest === undefined) break;
      this.memoryCache.delete(oldest);
    }
  }

  private static async getCachedData(key: string): Promise<any> {
    try {
      const mem = this.memoryCache.get(key);
      // Refresh recency on a hit so a hot key is not evicted ahead of a cold one.
      if (mem && mem.timestamp) { this.touchCache(key, mem); return mem; }

      const cached = await AsyncStorage.getItem(`cache_${key}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.timestamp) {
          this.touchCache(key, parsed);
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
      this.touchCache(key, cacheData);
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
