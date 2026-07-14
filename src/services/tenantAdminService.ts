import { supabase } from './supabase';
import { Order, Product } from '../types';
import { safeCall } from '../utils/safeFirebaseCall';
import { mapProduct, toPartRow, ProductService } from './productService';
import { OWNER_UIDS } from '../constants/config';

// Lazily-probed availability of the atomic move_part_stock RPC (see move_part_stock.sql).
// null = untried, true = present, false = not deployed → use the read-modify-write fallback.
let rpcStockMoveAvailable: boolean | null = null;

// Map a raw `parts` row to the admin product shape: the canonical camelCase
// product (via mapProduct) plus admin-only fields the editor needs. Reusing
// mapProduct guarantees the edit form pre-fills EVERY localized/tier/variation
// field — otherwise saving would write empty values back and wipe them.
const mapTenantProduct = (doc: any): TenantProduct => ({
  ...(mapProduct(doc) as any),
  sortOrder: doc.sort_order,
  // chat-routing + option metadata lives in the extra_data jsonb
  ownerAdminId: doc.extra_data?.ownerAdminId,
  adminId: doc.extra_data?.adminId,
  coAdminIds: doc.extra_data?.coAdminIds,
  options: doc.extra_data?.options,
}) as unknown as TenantProduct;

// Products SHARED to a partner: a product is assigned by adding the partner's uid to its
// coAdminIds (stored in extra_data). Shared products live under the OWNER's tenant, not
// the partner's — so this lookup is intentionally NOT tenant-scoped. `parts` is publicly
// readable (RLS qual = true), so a partner can read the owner's shared rows. select('*')
// (not the light LIST_COLUMNS) so purchasePrice + coAdminIds come through.
export const getAssignedProducts = async (partnerUid: string): Promise<TenantProduct[]> => {
  if (!partnerUid) return [];
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .contains('extra_data', { coAdminIds: [partnerUid] });
  if (error) throw error;
  return (data || []).map(mapTenantProduct);
};

export interface InvoiceSettings {
  companyName?: string;
  companyNameAr?: string;
  companyNameKu?: string;
  phone?: string;
  email?: string;
  address?: string;
  addressAr?: string;
  addressKu?: string;
  taxId?: string;
  website?: string;
  logoUrl?: string;
  updatedAt?: any;
}

export interface TenantProduct {
  id?: string;
  name: string;
  nameAr?: string;
  nameKu?: string;
  description: string;
  descriptionAr?: string;
  descriptionKu?: string;
  category: string;
  priceUSD: number;
  stockQty: number;
  initialStock?: number;
  partNumber: string;
  imageUrls: string[];
  isActive: boolean;
  isFeatured?: boolean;
  shippingCost?: number;
  shippingRates?: Array<{ city: string; price: number }>;
  videoUrl?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TenantOrder {
  id?: string;
  orderNumber: string;
  userId: string;
  tenantId: string;
  items: Array<any>;
  subtotalUSD: number;
  shippingUSD: number;
  totalUSD: number;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'cancelled_by_store' | 'cancelled_by_user';
  paymentStatus: 'pending' | 'awaiting_payment' | 'paid' | 'failed' | 'refunded';
  paymentMethod?: string;
  exchangeRate?: number;
  shippingAddress: any;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TenantCustomer {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  totalOrders: number;
  totalSpent: number;
  role?: string;
  isBlocked?: boolean;
  isSystemAdmin?: boolean;
  lastOrderAt?: any;
  createdAt?: any;
}

// A partner is an admin user the owner has linked to their store and shared
// products with. The link list is persisted in tenant_settings (key 'partner_links');
// per-product sharing still lives in each product's extra_data.coAdminIds.
export interface Partner {
  uid: string;
  name: string;
  phone?: string;
  email?: string;
  addedAt?: string;
  isAdmin?: boolean;     // live status from users table
  role?: string;         // live status from users table
  productCount?: number; // filled by the screen from the catalog
}

export interface TenantCategory {
  id?: string;
  name: string;
  nameAr?: string;
  nameKu?: string;
  description?: string;
  imageUrl?: string;
  productCount: number;
  isActive: boolean;
  sortOrder: number;
  createdAt?: any;
  updatedAt?: any;
}

// snake_case DB row -> camelCase domain (mirrors mapProduct). The categories
// table stores name_ar/image_url/is_active/sort_order; the old code cast the raw
// row straight to TenantCategory, so imageUrl/nameAr/isActive read as undefined.
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

// camelCase domain -> snake_case DB columns (only defined keys).
const toCategoryRow = (c: Partial<TenantCategory>): Record<string, any> => {
  const row: Record<string, any> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.nameAr !== undefined) row.name_ar = c.nameAr;
  if (c.nameKu !== undefined) row.name_ku = c.nameKu;
  if (c.description !== undefined) row.description = c.description;
  if (c.imageUrl !== undefined) row.image_url = c.imageUrl;
  if (c.isActive !== undefined) row.is_active = c.isActive;
  if (c.sortOrder !== undefined) row.sort_order = c.sortOrder;
  return row;
};

export interface TenantDashboardStats {
  totalOrders: number;
  pendingOrders: number;
  totalProducts: number;
  lowStockProducts: number;
  totalCustomers: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
}

export class TenantAdminService {
  private tenantId: string;

  constructor(tenantId: string) {
    if (!tenantId) {
      throw new Error('TenantAdminService requires a valid tenantId');
    }
    this.tenantId = tenantId;
  }

  async getProducts(): Promise<TenantProduct[]> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('tenant_id', this.tenantId);

      if (error) throw error;

      return (data || []).map(mapTenantProduct);
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  async getAllProducts(): Promise<TenantProduct[]> {
    const products = await this.getProducts();
    return products.sort((a: any, b: any) => {
      const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  async syncAllProductsToGlobal(): Promise<number> {
    return 0; // Handled natively in Postgres with no sync needed
  }

  async getProduct(productId: string): Promise<TenantProduct | null> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('id', productId)
        .single();

      if (error || !data) return null;
      if (data.tenant_id !== this.tenantId) {
        console.warn(`Access denied: Product ${productId} does not belong to tenant ${this.tenantId}`);
        return null;
      }

      return mapTenantProduct(data);
    } catch (error) {
      console.error('Error fetching product:', error);
      throw error;
    }
  }

  async addProduct(productData: any): Promise<string> {
    try {
      // toPartRow converts the camelCase editor payload to valid snake_case
      // columns and isolates non-column metadata into extra_data. Without this
      // every insert failed (PostgREST rejects unknown columns like `nameAr`).
      const { row, extra } = toPartRow(productData);
      const insertRow: any = { ...row, tenant_id: this.tenantId };
      if (Object.keys(extra).length) insertRow.extra_data = extra;

      const { data, error } = await supabase
        .from('parts')
        .insert([insertRow])
        .select('id')
        .single();

      if (error) throw error;
      // Customer Search/Store/Favorites now read from a 10-min product cache.
      // Bust it so a newly added product appears for shoppers immediately.
      await ProductService.clearCache();
      return data.id;
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  }

  async updateProduct(productId: string, updates: any): Promise<void> {
    try {
      const { row, extra } = toPartRow(updates);
      const patch: any = { ...row, updated_at: new Date().toISOString() };

      // extra_data is a single jsonb column — merge into the existing value so a
      // partial update (e.g. just coAdminIds) doesn't clobber the other keys.
      if (Object.keys(extra).length) {
        const { data: existing } = await supabase
          .from('parts')
          .select('extra_data')
          .eq('id', productId)
          .single();
        patch.extra_data = { ...(existing?.extra_data || {}), ...extra };
      }

      const { error } = await supabase
        .from('parts')
        .update(patch)
        .eq('id', productId)
        .eq('tenant_id', this.tenantId);

      if (error) throw error;
      // Bust the customer-facing product cache so price/stock edits show up now.
      await ProductService.clearCache();
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async deleteProduct(productId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parts')
        .delete()
        .eq('id', productId)
        .eq('tenant_id', this.tenantId);

      if (error) throw error;
      // Bust the customer-facing product cache so a deleted item disappears now.
      await ProductService.clearCache();
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  async updateProductSortOrders(sortOrders: Array<{ id: string; sortOrder: number }>): Promise<void> {
    try {
      const now = new Date().toISOString();
      // Run every reorder UPDATE concurrently instead of awaiting them one-by-one.
      // Reordering N products drops from N sequential round-trips (~N×latency) to a
      // single concurrent batch (~one round-trip). These are pure UPDATEs scoped to
      // (id, tenant_id) — no insert path — so there's no NOT-NULL/junk-row risk.
      // Column is snake_case `sort_order`; writing `sortOrder` silently failed
      // (PostgREST 42703) and the error was swallowed, so reorders never persisted.
      const results = await Promise.all(
        sortOrders.map(({ id, sortOrder }) =>
          supabase
            .from('parts')
            .update({ sort_order: sortOrder, updated_at: now })
            .eq('id', id)
            .eq('tenant_id', this.tenantId)
        )
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
    } catch (error) {
      console.error('Error updating product sort orders:', error);
      throw error;
    }
  }

  async getOrders(limitCount: number = 200, status?: string): Promise<TenantOrder[]> {
    try {
      let query = supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', this.tenantId)
        // Hide only ABANDONED QiCard orders: awaiting_payment AND still pending
        // (created before payment, never actioned). Once actioned (confirmed,
        // cancelled, etc.) or paid, the order shows normally.
        .or('payment_status.neq.awaiting_payment,status.neq.pending');
      // Optional server-side status filter so callers can reach EVERY order of a status
      // (e.g. old pending orders) instead of only those inside the latest-N window.
      if (status) query = query.eq('status', status);
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limitCount);

      if (error) throw error;

      return (data || []).map(doc => ({
        id: doc.id,
        ...doc,
        orderNumber: doc.order_number,
        userId: doc.user_id,
        tenantId: doc.tenant_id,
        subtotalUSD: doc.subtotal_usd,
        shippingUSD: doc.shipping_usd,
        totalUSD: doc.total_usd,
        paymentStatus: doc.payment_status,
        paymentMethod: doc.payment_method?.type ?? doc.payment_method,
        exchangeRate: doc.exchange_rate,
        shippingAddress: doc.shipping_address,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        amountPaidUSD: doc.amount_paid_usd,
        discountUSD: doc.discount_usd,
        taxUSD: doc.tax_usd,
        // Custom fields stored in the jsonb extra_data (shipping office, etc.)
        source: doc.extra_data?.source,
        isVip: doc.extra_data?.isVip,
        shippingOfficeInfo: doc.extra_data?.shippingOfficeInfo,
        moneyExchangerInfo: doc.extra_data?.moneyExchangerInfo,
        appliedDiscount: doc.extra_data?.appliedDiscount,
        partnerId: doc.extra_data?.partnerId,
        partnerName: doc.extra_data?.partnerName,
      })) as unknown as TenantOrder[];
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  async getAllOrders(limitCount: number = 100): Promise<TenantOrder[]> {
    return this.getOrders(limitCount);
  }

  // Accurate per-status counts (+ all, + unpaid) across the WHOLE order history, so the
  // filter-tab badges show true totals instead of just the loaded window. Lightweight:
  // pulls only the columns needed to count. `inStore` picks which sales channel to count.
  async getOrderCounts(inStore: boolean = false): Promise<Record<string, number>> {
    try {
      const { data } = await supabase
        .from('orders')
        .select('status, total_usd, amount_paid_usd, extra_data')
        .eq('tenant_id', this.tenantId);
      const counts: Record<string, number> = { all: 0, unpaid: 0 };
      for (const o of (data || []) as any[]) {
        const isInStore = o.extra_data?.source === 'in-store';
        if (inStore !== isInStore) continue;
        counts.all++;
        const status = String(o.status || 'pending');
        counts[status] = (counts[status] || 0) + 1;
        if (status === 'delivered' && Math.max(0, (o.total_usd || 0) - (o.amount_paid_usd || 0)) > 0.01) counts.unpaid++;
      }
      return counts;
    } catch (e) {
      console.error('getOrderCounts error', e);
      return {};
    }
  }

  // Search ALL orders server-side (order number, recipient name, recipient phone) so an
  // order older than the loaded window can still be pulled up — the #1 "customer phoned,
  // find their order" case. Returns [] on any error (never crashes the list).
  async searchOrders(query: string, limitCount: number = 50): Promise<TenantOrder[]> {
    const q = (query || '').trim();
    if (!q) return [];
    try {
      const digits = q.replace(/[^0-9]/g, '');
      const safe = q.replace(/[,()]/g, ' ');
      const parts = [`order_number.ilike.%${safe}%`];
      if (digits && digits !== safe) parts.push(`order_number.ilike.%${digits}%`);
      parts.push(`shipping_address->>fullName.ilike.%${safe}%`);
      parts.push(`shipping_address->>phone.ilike.%${safe}%`);
      if (digits) parts.push(`shipping_address->>phone.ilike.%${digits}%`);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .or(parts.join(','))
        .order('created_at', { ascending: false })
        .limit(limitCount);
      if (error) throw error;
      return (data || []).map(doc => ({
        id: doc.id,
        ...doc,
        orderNumber: doc.order_number,
        userId: doc.user_id,
        tenantId: doc.tenant_id,
        subtotalUSD: doc.subtotal_usd,
        shippingUSD: doc.shipping_usd,
        totalUSD: doc.total_usd,
        paymentStatus: doc.payment_status,
        paymentMethod: doc.payment_method?.type ?? doc.payment_method,
        exchangeRate: doc.exchange_rate,
        shippingAddress: doc.shipping_address,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        amountPaidUSD: doc.amount_paid_usd,
        discountUSD: doc.discount_usd,
        taxUSD: doc.tax_usd,
        source: doc.extra_data?.source,
        isVip: doc.extra_data?.isVip,
        shippingOfficeInfo: doc.extra_data?.shippingOfficeInfo,
        moneyExchangerInfo: doc.extra_data?.moneyExchangerInfo,
        appliedDiscount: doc.extra_data?.appliedDiscount,
        partnerId: doc.extra_data?.partnerId,
        partnerName: doc.extra_data?.partnerName,
      })) as unknown as TenantOrder[];
    } catch (e) {
      console.error('searchOrders error:', e);
      return [];
    }
  }

  async getOrder(orderId: string): Promise<TenantOrder | null> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('tenant_id', this.tenantId)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        ...data,
        orderNumber: data.order_number,
        userId: data.user_id,
        tenantId: data.tenant_id,
        subtotalUSD: data.subtotal_usd,
        shippingUSD: data.shipping_usd,
        totalUSD: data.total_usd,
        paymentStatus: data.payment_status,
        paymentMethod: data.payment_method?.type ?? data.payment_method,
        exchangeRate: data.exchange_rate,
        shippingAddress: data.shipping_address,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        amountPaidUSD: data.amount_paid_usd,
        discountUSD: data.discount_usd,
        taxUSD: data.tax_usd,
        source: data.extra_data?.source,
        isVip: data.extra_data?.isVip,
        shippingOfficeInfo: data.extra_data?.shippingOfficeInfo,
        moneyExchangerInfo: data.extra_data?.moneyExchangerInfo,
        appliedDiscount: data.extra_data?.appliedDiscount,
        partnerId: data.extra_data?.partnerId,
        partnerName: data.extra_data?.partnerName,
      } as unknown as TenantOrder;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw error;
    }
  }

  // Create a manual / in-store (POS) sale — no customer account. Counts toward
  // profit & stats; lives on the separate In-Store Sales screen via the source tag.
  async createManualOrder(params: {
    items: Array<{ productId?: string; productName: string; partNumber?: string; imageUrl?: string; priceUSD: number; purchasePrice?: number; quantity: number; variationId?: string }>;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    customerCity?: string;
    isVip?: boolean;
    notes?: string;
    markPaid?: boolean;
    discountUSD?: number;
    amountPaidUSD?: number;
    currency?: 'USD' | 'IQD';
    exchangeRate?: number;
    // When the owner rings up a sale on behalf of a partner, the order stays under
    // the owner's tenant (so stock deducts correctly against the owner-owned parts
    // and the owner sees it natively), and is tagged so the partner can see it too.
    partner?: { uid: string; name?: string };
  }): Promise<{ orderId: string; orderNumber: string }> {
    const items = (params.items || []).filter((i) => i.quantity > 0);
    if (!items.length) throw new Error('Add at least one product');
    const subtotalUSD = items.reduce((s, i) => s + (i.priceUSD || 0) * (i.quantity || 0), 0);
    const discountUSD = Math.max(0, Math.min(params.discountUSD || 0, subtotalUSD));
    const totalUSD = Math.max(0, subtotalUSD - discountUSD);
    // Record the sale value as paid (change handed back is cash, not store credit) → clamp to total.
    const amountPaidUSD = params.amountPaidUSD != null
      ? Math.max(0, Math.min(params.amountPaidUSD, totalUSD))
      : (params.markPaid ? totalUSD : 0);
    const fullyPaid = totalUSD > 0 && amountPaidUSD >= totalUSD - 0.01;
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const customerName = (params.customerName || '').trim();
    const customerPhone = (params.customerPhone || '').trim();
    const customerAddress = (params.customerAddress || '').trim();
    const customerCity = (params.customerCity || '').trim();

    // user_id must equal the logged-in admin's auth uid (orders RLS: user_id = auth.uid()),
    // NOT the store/tenant id — they can differ. tenant_id stays the store.
    const { data: { user } } = await supabase.auth.getUser();
    const creatorId = user?.id || this.tenantId;

    const row: any = {
      user_id: creatorId,                     // the admin who rang up the sale (satisfies RLS)
      tenant_id: this.tenantId,
      order_number: orderNumber,
      items,
      subtotal_usd: subtotalUSD,
      shipping_usd: 0,
      tax_usd: 0,
      discount_usd: discountUSD,
      total_usd: totalUSD,
      amount_paid_usd: amountPaidUSD,
      currency: params.currency || 'USD',
      exchange_rate: params.exchangeRate || 1500,
      payment_status: fullyPaid ? 'paid' : 'pending',
      // In-store = a completed counter sale: mark delivered (so it counts as realized
      // revenue) and deduct stock immediately below — the part already left the shelf.
      status: 'delivered',
      stock_status: 'deducted',
      shipping_address: { fullName: customerName || 'In-Store Customer', phone: customerPhone, address: customerAddress, city: customerCity },
      notes: params.notes || null,
      extra_data: {
        source: 'in-store',
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        isVip: !!params.isVip,
        ...(params.partner?.uid ? { partnerId: params.partner.uid, partnerName: params.partner.name || null } : {}),
      },
    };

    const { data, error } = await supabase.from('orders').insert([row]).select('id, order_number').single();
    if (error) throw error;

    // The part left the shelf now: deduct stock immediately (variation-aware).
    await this.moveStockForItems(items, 'deduct');

    return { orderId: data.id, orderNumber: data.order_number };
  }

  // Variation-aware stock movement shared by in-store creation and online fulfillment.
  // Prefers the atomic, row-locking move_part_stock RPC; if that isn't deployed it falls
  // back to a read-modify-write. For a line with variationId it moves that entry's
  // stockQuantity inside the variations / color_variations JSONB; otherwise the product-level
  // stock_qty. Best-effort per line — a failed stock write never throws to the caller.
  private async moveStockForItems(items: any[], direction: 'deduct' | 'restore'): Promise<void> {
    for (const item of (items || [])) {
      if (!item?.productId || !item?.quantity) continue;
      const qty = item.quantity;

      // Prefer the atomic, row-locking RPC when it's been deployed (move_part_stock.sql).
      if (rpcStockMoveAvailable !== false) {
        try {
          const { error: rpcErr } = await supabase.rpc('move_part_stock', {
            p_part_id: item.productId,
            p_tenant_id: this.tenantId,
            p_variation_id: item.variationId || null,
            p_delta: direction === 'deduct' ? -qty : qty,
          });
          if (!rpcErr) { rpcStockMoveAvailable = true; continue; }
          const code = (rpcErr as any).code;
          if (code === 'PGRST202' || /function|does not exist|not found|schema cache/i.test(rpcErr.message || '')) {
            rpcStockMoveAvailable = false;   // not deployed yet → fall through to manual (this session)
          } else {
            console.warn('move_part_stock RPC error', item.productId, rpcErr.message);
            continue;   // RPC present but errored on this row — don't also apply it manually
          }
        } catch (e: any) { console.warn('move_part_stock threw', e?.message || e); }
      }

      // Manual fallback (non-atomic; fine for a single-admin counter until the RPC is deployed).
      try {
        // Number()-coerce so a string/null stockQuantity is handled, not silently skipped.
        const move = (v: any) => {
          const cur = Number(v?.stockQuantity) || 0;
          return { ...v, stockQuantity: direction === 'deduct' ? Math.max(0, cur - qty) : cur + qty };
        };
        if (item.variationId) {
          const { data: p } = await supabase.from('parts').select('variations,color_variations').eq('id', item.productId).single();
          if (!p) continue;
          let vChanged = false, cChanged = false;
          const variations = ((p as any).variations || []).map((v: any) => {
            if (v?.variationId === item.variationId) { vChanged = true; return move(v); }
            return v;
          });
          const colorVariations = ((p as any).color_variations || []).map((v: any) => {
            if (v?.variationId === item.variationId) { cChanged = true; return move(v); }
            return v;
          });
          // Only write the array that actually changed → a concurrent write to the other
          // array (or to stock_qty) isn't clobbered. (Same-array races still need a DB lock.)
          const upd: any = {};
          if (vChanged) upd.variations = variations;
          if (cChanged) upd.color_variations = colorVariations;
          if (Object.keys(upd).length) {
            const { error: upErr } = await supabase.from('parts').update(upd).eq('id', item.productId).eq('tenant_id', this.tenantId);
            if (upErr) console.warn('moveStockForItems: variation stock update failed', item.productId, item.variationId, upErr.message);
          }
        } else {
          const { data: p } = await supabase.from('parts').select('stock_qty').eq('id', item.productId).single();
          if (p) {
            const cur = Number((p as any).stock_qty) || 0;
            const { error: upErr } = await supabase.from('parts').update({ stock_qty: direction === 'deduct' ? Math.max(0, cur - qty) : cur + qty }).eq('id', item.productId).eq('tenant_id', this.tenantId);
            if (upErr) console.warn('moveStockForItems: stock_qty update failed', item.productId, upErr.message);
          }
        }
      } catch (e: any) { console.warn('moveStockForItems: stock write error', item?.productId, e?.message || e); }
    }
  }

  async updateOrderStatus(
    orderId: string, 
    status: TenantOrder['status'], 
    notes?: string,
    cancelledBy?: 'admin' | 'user'
  ): Promise<void> {
    try {
      const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (orderError || !order) throw new Error('Order not found');
      
      const isFulfilledState = ['confirmed', 'processing', 'shipped', 'delivered'].includes(status);
      const isCancelled = ['cancelled', 'cancelled_by_store', 'cancelled_by_user'].includes(status);
      const currentStockStatus = order.stock_status || 'pending';

      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (notes) updateData.notes = notes;

      // Real inventory math: deduct stock when the order is fulfilled, restore it
      // when cancelled (only if it had been deducted). Applies to online + in-store.
      const requiresDeduction = isFulfilledState && currentStockStatus !== 'deducted';
      const requiresRestore = isCancelled && currentStockStatus === 'deducted';

      if (requiresDeduction || requiresRestore) {
        await this.moveStockForItems(order.items || [], requiresDeduction ? 'deduct' : 'restore');
        updateData.stock_status = requiresDeduction ? 'deducted' : 'rolled_back';
      }

      await supabase.from('orders').update(updateData).eq('id', orderId).eq('tenant_id', this.tenantId);
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  async updateOrderPaymentStatus(
    orderId: string,
    paymentStatus: TenantOrder['paymentStatus']
  ): Promise<void> {
    try {
      await supabase.from('orders').update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      }).eq('id', orderId).eq('tenant_id', this.tenantId);
    } catch (error) {
      console.error('Error updating order payment status:', error);
      throw error;
    }
  }

  // Return/refund chosen units of an order: restock them (variation-aware), reduce the
  // matching item quantities (so a later cancel can't double-restore), and lower the
  // total + paid by the refund. Returns the refunded amount.
  async returnOrderItems(
    orderId: string,
    returns: Array<{ index: number; productId?: string; variationId?: string; quantity: number; priceUSD: number }>
  ): Promise<{ refundUSD: number }> {
    const requested = (returns || []).filter((r) => r.quantity > 0);
    if (!requested.length) return { refundUSD: 0 };

    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).eq('tenant_id', this.tenantId).single();
    if (error || !order) throw new Error('Order not found');
    const orderItems: any[] = order.items || [];

    // Validate each return against the CURRENT line at that index (guards against a concurrent
    // edit by another admin shifting positions) and clamp to what's actually on the line. Trust
    // the DB line's price, not the UI's.
    const effective = requested.map((r) => {
      const line = orderItems[r.index];
      if (!line || line.productId !== r.productId || (line.variationId || null) !== (r.variationId || null)) {
        throw new Error('Order changed — please reopen it and try the return again.');
      }
      return { index: r.index, productId: line.productId, variationId: line.variationId, quantity: Math.min(r.quantity, line.quantity || 0), priceUSD: line.priceUSD || 0 };
    }).filter((r) => r.quantity > 0);
    if (!effective.length) return { refundUSD: 0 };

    // Put the returned units back on the shelf (variation-aware).
    await this.moveStockForItems(effective.map((r) => ({ productId: r.productId, variationId: r.variationId, quantity: r.quantity })), 'restore');

    // Reduce the matching lines by index; drop emptied lines.
    const newItems = orderItems.map((it: any, idx: number) => {
      const ret = effective.find((r) => r.index === idx);
      if (!ret) return it;
      return { ...it, quantity: Math.max(0, (it.quantity || 0) - ret.quantity) };
    }).filter((it: any) => (it.quantity || 0) > 0);

    // total_usd = subtotal − discount + shipping + tax, so recompute from the NEW subtotal
    // (subtracting the gross line value straight off total double-counts any discount/shipping).
    const grossReturned = effective.reduce((s, r) => s + (r.priceUSD || 0) * r.quantity, 0);
    const oldSub = order.subtotal_usd || 0;
    const newSub = Math.max(0, oldSub - grossReturned);
    const newDisc = oldSub > 0 ? Math.max(0, (order.discount_usd || 0) * (newSub / oldSub)) : 0;   // shrink the discount proportionally
    const shipping = order.shipping_usd || 0;
    const tax = order.tax_usd || 0;
    const newTotal = Math.max(0, newSub - newDisc + shipping + tax);
    const newPaid = Math.min(order.amount_paid_usd || 0, newTotal);   // refund the excess cash to the customer
    const actualRefund = Math.max(0, (order.total_usd || 0) - newTotal); // net cash actually returned
    const count = effective.reduce((s, r) => s + r.quantity, 0);

    await supabase.from('orders').update({
      items: newItems,
      subtotal_usd: newSub,
      discount_usd: newDisc > 0 ? newDisc : null,
      total_usd: newTotal,
      amount_paid_usd: newPaid,
      payment_status: newTotal <= 0 || newPaid >= newTotal - 0.01 ? 'paid' : 'pending',
      notes: `${order.notes ? order.notes + '\n' : ''}↩︎ Returned ${count} item(s) — refunded $${actualRefund.toFixed(2)}`,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('tenant_id', this.tenantId);

    return { refundUSD: actualRefund };
  }

  async deleteOrder(orderId: string): Promise<void> {
    try {
      // Stock restore on delete is enforced by a BEFORE DELETE trigger on `orders`
      // (restore_stock_on_order_delete) so EVERY delete path — admin, user RPC,
      // dashboard — frees still-deducted stock. Don't restore here too, or it double-counts.
      await supabase.from('orders').delete().eq('id', orderId).eq('tenant_id', this.tenantId);
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  async updateOrderTracking(orderId: string, trackingUrl: string): Promise<void> {
    try {
      await supabase.from('orders').update({ tracking_number: trackingUrl }).eq('id', orderId).eq('tenant_id', this.tenantId);
    } catch (error) {
      console.error('Error updating tracking URL:', error);
      throw error;
    }
  }

  async adjustShippingPrice(
    orderId: string,
    newShippingPrice: number,
    reason: string,
    adminId: string
  ): Promise<void> {
    try {
      const order = await this.getOrder(orderId);
      if (!order) throw new Error('Order not found');
      
      const allowedStatuses = ['pending', 'confirmed'];
      if (!allowedStatuses.includes(order.status)) {
        throw new Error(`Cannot adjust shipping for ${order.status} orders. Only pending/confirmed allowed.`);
      }

      const newTotal = (order.subtotalUSD || 0) + newShippingPrice;

      await supabase.from('orders').update({
        shipping_usd: newShippingPrice,
        total_usd: newTotal,
        notes: (order.notes || '') + `\n[Shipping Adjusted] ${reason}`,
        updated_at: new Date().toISOString()
      }).eq('id', orderId).eq('tenant_id', this.tenantId);
    } catch (error) {
      console.error('Error adjusting shipping price:', error);
      throw error;
    }
  }

  async updateOrderAmountPaid(
    orderId: string,
    amountPaidUSD: number,
    adminId: string
  ): Promise<void> {
    try {
      await supabase.from('orders').update({
        amount_paid_usd: amountPaidUSD,
        updated_at: new Date().toISOString()
      }).eq('id', orderId).eq('tenant_id', this.tenantId);
    } catch (error) {
      console.error('Error updating amount paid:', error);
      throw error;
    }
  }

  async getAllCustomers(): Promise<TenantCustomer[]> {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, name, email, phone, role, is_blocked, is_admin, profile_image_url, created_at');
      if (error) throw error;
      
      return (users || []).map(doc => ({
        id: doc.id,
        uid: doc.id,
        email: doc.email || '',
        displayName: doc.full_name || doc.name || '',
        phone: doc.phone || '',
        totalOrders: 0,
        totalSpent: 0,
        role: doc.role || 'customer',
        isBlocked: doc.is_blocked,
        isSystemAdmin: doc.is_admin,
        createdAt: doc.created_at,
      })) as TenantCustomer[];
    } catch (error) {
      console.error('Error fetching customers/admins:', error);
      throw error;
    }
  }

  async getCustomers(): Promise<TenantCustomer[]> {
    return this.getAllCustomers();
  }

  // Admin users only — the pool eligible to be added as a partner. A partner MUST
  // already be an admin (their own account); the owner never promotes a normal
  // customer into one. Owner accounts / existing partners are filtered by the caller.
  async getAdminUsers(): Promise<TenantCustomer[]> {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, name, email, phone, role, is_blocked, is_admin, is_partner, profile_image_url, created_at')
        // Admins (legacy partner model) AND view-only partners (3-tap signup) are both
        // eligible to be linked + shared with — this list feeds the "add partner" picker.
        .or('is_admin.eq.true,role.eq.admin,is_partner.eq.true');
      if (error) throw error;
      return (users || []).map(doc => ({
        id: doc.id,
        uid: doc.id,
        email: doc.email || '',
        displayName: doc.full_name || doc.name || '',
        phone: doc.phone || '',
        totalOrders: 0,
        totalSpent: 0,
        role: doc.role || 'customer',
        isBlocked: doc.is_blocked,
        isSystemAdmin: doc.is_admin,
        createdAt: doc.created_at,
      })) as TenantCustomer[];
    } catch (error) {
      console.error('Error fetching admin users:', error);
      throw error;
    }
  }

  async getCustomer(customerId: string): Promise<TenantCustomer | null> {
    try {
      const { data: user, error } = await supabase.from('users').select('*').eq('id', customerId).single();
      if (error || !user) return null;
      
      return {
        id: user.id,
        uid: user.id,
        email: user.email || '',
        displayName: user.full_name || user.name || '',
        phone: user.phone || '',
        totalOrders: 0,
        totalSpent: 0,
        createdAt: user.created_at,
      } as TenantCustomer;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  }

  async getCustomerOrders(customerId: string): Promise<TenantOrder[]> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', customerId)
        .eq('tenant_id', this.tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as TenantOrder[];
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      throw error;
    }
  }

  // ───────────────────────── Partner management (owner-only) ─────────────────────────
  // Owner→partner links persist in tenant_settings under 'partner_links'. Per-product
  // sharing stays in each product's extra_data.coAdminIds (see assignProductsToPartner).
  private static PARTNER_LINKS_KEY = 'partner_links';

  private async getPartnerLinks(): Promise<Array<{ uid: string; name?: string; phone?: string; addedAt?: string }>> {
    const stored = await this.getSettings(TenantAdminService.PARTNER_LINKS_KEY);
    const list = stored?.partners;
    return Array.isArray(list) ? list : [];
  }

  private async savePartnerLinks(list: Array<{ uid: string; name?: string; phone?: string; addedAt?: string }>): Promise<void> {
    await this.saveSettings(TenantAdminService.PARTNER_LINKS_KEY, { partners: list });
  }

  // ── Partner money ledger ───────────────────────────────────────────────────
  // A per-partner cash account: deposits the partner pays in ('in') and payouts the owner
  // makes ('out'). Stored in tenant_settings under 'partner_ledger' as { [partnerUid]: [] }.
  // The owner edits it; the partner can read it (tenant_settings is publicly readable).
  // Model: 'in' = partner adds capital → ADDS to Total Invested; 'out' = payout drawn from
  // earned profit → reduces Earned (never the invested capital), capped at profit earned.
  private static PARTNER_LEDGER_KEY = 'partner_ledger';

  // dir: 'in' = cash deposit (adds to Total Invested) · 'out' = cash payout (drawn from Earned)
  //      'item' = settled by handing a product back (history record; the un-share itself lowers
  //      Total Invested, so this entry is display-only and must NOT be summed into in/out).
  // kind (for dir==='item'): 'unshare' = whole product handed back (the un-share itself lowers
  // Total Invested → display-only) · 'manual' = a custom value taken out WITHOUT un-sharing, so it
  // must be subtracted from Total Invested. Legacy 'item' entries with no kind = 'unshare'.
  async getPartnerLedger(partnerUid: string): Promise<Array<{ id: string; dir: 'in' | 'out' | 'item'; amount: number; note?: string; at: string; productId?: string; kind?: 'unshare' | 'manual'; qty?: number }>> {
    if (!partnerUid) return [];
    const stored = await this.getSettings(TenantAdminService.PARTNER_LEDGER_KEY);
    const all = (stored && typeof stored === 'object') ? (stored as any) : {};
    const list = all[partnerUid];
    return Array.isArray(list) ? list : [];
  }

  // qty: for a manual item payout, the number of UNITS taken out (amount = qty × unit buy price).
  async addPartnerLedgerEntry(partnerUid: string, entry: { dir: 'in' | 'out' | 'item'; amount: number; note?: string; productId?: string; kind?: 'unshare' | 'manual'; qty?: number }): Promise<void> {
    if (!partnerUid || !(entry.amount >= 0)) return;
    const stored = await this.getSettings(TenantAdminService.PARTNER_LEDGER_KEY);
    const all = (stored && typeof stored === 'object') ? { ...(stored as any) } : {};
    const list = Array.isArray(all[partnerUid]) ? [...all[partnerUid]] : [];
    list.unshift({
      id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      dir: entry.dir === 'out' ? 'out' : entry.dir === 'item' ? 'item' : 'in',
      amount: Math.abs(entry.amount),
      note: (entry.note || '').slice(0, 200),
      at: new Date().toISOString(),
      ...(entry.productId ? { productId: entry.productId } : {}),
      ...(entry.dir === 'item' ? { kind: entry.kind === 'manual' ? 'manual' : 'unshare' } : {}),
      ...(entry.qty && entry.qty > 0 ? { qty: Math.round(entry.qty) } : {}),
    });
    all[partnerUid] = list;
    await this.saveSettings(TenantAdminService.PARTNER_LEDGER_KEY, all);
  }

  async deletePartnerLedgerEntry(partnerUid: string, id: string): Promise<void> {
    if (!partnerUid || !id) return;
    const stored = await this.getSettings(TenantAdminService.PARTNER_LEDGER_KEY);
    const all = (stored && typeof stored === 'object') ? { ...(stored as any) } : {};
    all[partnerUid] = Array.isArray(all[partnerUid]) ? all[partnerUid].filter((e: any) => e.id !== id) : [];
    await this.saveSettings(TenantAdminService.PARTNER_LEDGER_KEY, all);
  }

  // Drop any 'manual' item-payout records for one or more products. Called intrinsically by EVERY
  // un-share path (below): once a product leaves the partner, its cost leaves totals.invested, so a
  // lingering 'manual' deduction would subtract the same value twice → Total Invested goes negative.
  async removePartnerLedgerManualByProduct(partnerUid: string, productId: string | string[]): Promise<void> {
    if (!partnerUid || !productId) return;
    const ids = new Set(Array.isArray(productId) ? productId : [productId]);
    if (!ids.size) return;
    const stored = await this.getSettings(TenantAdminService.PARTNER_LEDGER_KEY);
    const all = (stored && typeof stored === 'object') ? { ...(stored as any) } : {};
    all[partnerUid] = Array.isArray(all[partnerUid])
      ? all[partnerUid].filter((e: any) => !(e.dir === 'item' && e.kind === 'manual' && ids.has(e.productId)))
      : [];
    await this.saveSettings(TenantAdminService.PARTNER_LEDGER_KEY, all);
  }

  // Units sold per product for `partnerUid`, computed server-side (SECURITY DEFINER) so BOTH the
  // owner and the partner's own login get the SAME unbounded, tenant-scoped figure. A partner login
  // can't read the owner's `orders` via RLS, so without this their Earned shows $0 and Total
  // Invested / Wholesale exclude already-sold units. Returns null when the RPC errors / isn't
  // deployed (so the owner can fall back to reading orders); [] means deployed-but-no-sales.
  async getPartnerProductSales(partnerUid?: string): Promise<Array<{ productId: string; unitsSold: number }> | null> {
    try {
      const { data, error } = await supabase.rpc('get_partner_product_sales', partnerUid ? { p_partner_uid: partnerUid } : {});
      if (error || !Array.isArray(data)) return null;
      return (data as any[]).map((r) => ({ productId: String(r.product_id), unitsSold: Number(r.units_sold) || 0 }));
    } catch {
      return null;
    }
  }

  // Un-share a SINGLE product from a partner (the "pay out via item" / take-it-back action).
  // Removing the partner's uid from coAdminIds returns the product — and its full sales/analytics
  // history — to the owner (getAnalyticsData/Reports re-include products with no coAdminIds), and
  // drops it from the partner's getAssignedProducts list (so their Total Invested falls by its cost).
  async unassignProductFromPartner(partnerUid: string, productId: string): Promise<void> {
    if (!partnerUid || !productId) return;
    const all = await this.getAllProducts();
    const product = (all as any[]).find(p => p.id === productId);
    if (!product) return;
    const current: string[] = Array.isArray(product.coAdminIds) ? product.coAdminIds : [];
    if (!current.includes(partnerUid)) return;
    await this.updateProduct(productId, { coAdminIds: current.filter(id => id !== partnerUid) });
    // The product's cost has now left the partner — drop any manual draws on it so they don't
    // keep subtracting from Total Invested (→ negative). Intrinsic to un-sharing.
    await this.removePartnerLedgerManualByProduct(partnerUid, productId);
  }

  // The owner's partners, each refreshed with live name/phone/role from the users table.
  // A partner is an admin the owner has EXPLICITLY linked — NOT "every admin in the
  // system" (other store owners are admins too, and must never leak in here). Unioned
  // sources: (1) the stored partner_links, (2) anyone already sharing this owner's
  // products via coAdminIds (back-filled into links so the list stays authoritative).
  async getPartners(): Promise<Partner[]> {
    try {
      const links = await this.getPartnerLinks();
      const linkUids = links.map(l => l.uid).filter(Boolean);
      const linkUidSet = new Set(linkUids);

      // Discover any partner already sharing this owner's products (extra_data.coAdminIds).
      const { data: parts } = await supabase
        .from('parts')
        .select('extra_data')
        .eq('tenant_id', this.tenantId);
      const discovered = new Set<string>();
      (parts || []).forEach((p: any) => {
        const ids = p?.extra_data?.coAdminIds;
        if (Array.isArray(ids)) ids.forEach((id: string) => id && discovered.add(id));
      });

      const allUids = Array.from(new Set<string>([...linkUids, ...discovered]))
        .filter(uid => uid && !OWNER_UIDS.includes(uid));
      if (!allUids.length) return [];

      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, name, email, phone, role, is_admin')
        .in('id', allUids);
      const byId = new Map((users || []).map((u: any) => [u.id, u]));

      // Only keep uids that resolve to a real user (drops stale/legacy ids).
      const result: Partner[] = [];
      const backfill: Array<{ uid: string; name?: string; phone?: string; addedAt?: string }> = [...links];
      for (const uid of allUids) {
        const u: any = byId.get(uid);
        if (!u) continue;
        const link = links.find(l => l.uid === uid);
        result.push({
          uid,
          name: u.full_name || u.name || link?.name || '',
          phone: u.phone || link?.phone || '',
          email: u.email || '',
          addedAt: link?.addedAt,
          isAdmin: u.is_admin === true || u.role === 'admin',
          role: u.role,
        });
        if (!linkUidSet.has(uid)) {
          backfill.push({ uid, name: u.full_name || u.name, phone: u.phone, addedAt: new Date().toISOString() });
        }
      }

      // Persist newly discovered partners once so the list stays authoritative.
      if (backfill.length !== links.length) {
        await this.savePartnerLinks(backfill);
      }
      return result;
    } catch (error) {
      console.error('Error fetching partners:', error);
      return [];
    }
  }

  // Link an EXISTING admin as a partner. A partner must already have their own admin
  // account — the owner never promotes a normal customer here. We verify is_admin/role
  // and then only record the link; we never write is_admin/role (that would either be a
  // no-op for a real admin or, worse, silently elevate a customer).
  async addPartner(target: { uid: string; name?: string; phone?: string }): Promise<Partner[]> {
    if (!target?.uid) throw new Error('Missing partner user');
    // The owner is never a "partner" of themselves — nothing to link.
    if (OWNER_UIDS.includes(target.uid)) return this.getPartners();

    const { data: u, error: uErr } = await supabase
      .from('users')
      .select('is_admin, is_partner, role')
      .eq('id', target.uid)
      .single();
    if (uErr) throw uErr;
    // Eligible = a full admin (legacy partner model) OR a view-only partner account
    // (is_partner, created via the 3-tap partner signup). Never a plain customer.
    const eligible = u?.is_admin === true || u?.role === 'admin' || u?.is_partner === true;
    if (!eligible) throw new Error('Only admin or partner accounts can be added as partners.');

    const links = await this.getPartnerLinks();
    if (!links.some(l => l.uid === target.uid)) {
      links.push({ uid: target.uid, name: target.name, phone: target.phone, addedAt: new Date().toISOString() });
      await this.savePartnerLinks(links);
    }
    return this.getPartners();
  }

  // Remove a partner: unshare every product and drop the link. We do NOT touch their
  // is_admin/role — a partner is an independent admin who owns their own store, so
  // demoting them to customer would destroy their own access. Unlink only.
  async removePartner(partnerUid: string): Promise<Partner[]> {
    if (!partnerUid) return this.getPartners();
    // NEVER unlink an owner account — guard against fat-fingers / a bad caller.
    if (OWNER_UIDS.includes(partnerUid)) return this.getPartners();
    // Unshare all of the owner's products from this partner.
    await this.setPartnerAssignments(partnerUid, []);

    const links = (await this.getPartnerLinks()).filter(l => l.uid !== partnerUid);
    await this.savePartnerLinks(links);

    return this.getPartners();
  }

  // Products under this owner's tenant currently shared with the given partner.
  async getProductsForPartner(partnerUid: string): Promise<TenantProduct[]> {
    const all = await this.getAllProducts();
    return all.filter((p: any) => Array.isArray(p.coAdminIds) && p.coAdminIds.includes(partnerUid));
  }

  // Set the partner's shared-product set to EXACTLY `productIds` (within this tenant).
  // Diffs against the current state and applies only the changed rows, in parallel.
  async setPartnerAssignments(partnerUid: string, productIds: string[]): Promise<number> {
    if (!partnerUid) return 0;
    const desired = new Set(productIds);
    const all = await this.getAllProducts();
    const ops: Array<{ id: string; unshared: boolean; p: Promise<any> }> = [];

    for (const product of all as any[]) {
      const current: string[] = Array.isArray(product.coAdminIds) ? product.coAdminIds : [];
      const has = current.includes(partnerUid);
      const want = desired.has(product.id);
      if (has === want) continue;
      const updated = want
        ? [...current, partnerUid]
        : current.filter(id => id !== partnerUid);
      ops.push({ id: product.id, unshared: has && !want, p: this.updateProduct(product.id, { coAdminIds: updated }) });
    }

    const settled = await Promise.allSettled(ops.map(o => o.p));
    // Clear manual ledger draws ONLY for products whose un-share write actually SUCCEEDED, so a
    // partial failure can't strand an orphaned deduction. (Total Invested is also self-correcting on
    // the dashboard, but this keeps the stored ledger clean.) Covers this screen + removePartner.
    const clearedIds = ops.filter((o, i) => o.unshared && settled[i].status === 'fulfilled').map(o => o.id);
    if (clearedIds.length) await this.removePartnerLedgerManualByProduct(partnerUid, clearedIds);
    const failed = settled.find(s => s.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) throw failed.reason;   // preserve the caller's error handling
    return ops.length;
  }

  // Orders the owner created on behalf of a partner (tagged in extra_data.partnerId).
  // Cross-tenant by design — the partner reads it via the is_admin() orders RLS branch.
  async getPartnerOrders(partnerUid: string, limitCount: number = 200): Promise<TenantOrder[]> {
    if (!partnerUid) return [];
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .contains('extra_data', { partnerId: partnerUid })
        .order('created_at', { ascending: false })
        .limit(limitCount);
      if (error) throw error;
      return (data || []).map(doc => ({
        id: doc.id,
        ...doc,
        orderNumber: doc.order_number,
        userId: doc.user_id,
        tenantId: doc.tenant_id,
        subtotalUSD: doc.subtotal_usd,
        shippingUSD: doc.shipping_usd,
        totalUSD: doc.total_usd,
        paymentStatus: doc.payment_status,
        paymentMethod: doc.payment_method?.type ?? doc.payment_method,
        exchangeRate: doc.exchange_rate,
        shippingAddress: doc.shipping_address,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        amountPaidUSD: doc.amount_paid_usd,
        source: doc.extra_data?.source,
        isVip: doc.extra_data?.isVip,
        partnerId: doc.extra_data?.partnerId,
        partnerName: doc.extra_data?.partnerName,
        customerName: doc.extra_data?.customerName,
      })) as unknown as TenantOrder[];
    } catch (error) {
      console.error('Error fetching partner orders:', error);
      return [];
    }
  }

  async getCategories(): Promise<TenantCategory[]> {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapCategory);
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  }

  async addCategory(categoryData: Partial<TenantCategory>): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert([{ ...toCategoryRow(categoryData), tenant_id: this.tenantId }])
        .select()
        .single();
      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error adding category:', error);
      throw error;
    }
  }

  async updateCategory(categoryId: string, updates: Partial<TenantCategory>): Promise<void> {
    try {
      const { error } = await supabase
        .from('categories')
        .update({ ...toCategoryRow(updates), updated_at: new Date().toISOString() })
        .eq('id', categoryId)
        .eq('tenant_id', this.tenantId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  async deleteCategory(categoryId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)
        .eq('tenant_id', this.tenantId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  async getAllDiscounts(): Promise<any[]> {
    try {
      const { data, error } = await supabase.from('discounts').select('*').eq('tenant_id', this.tenantId);
      if (error) throw error;
      // AdminDiscountsScreen reads camelCase; the table is snake_case. Add aliases
      // (keeping the raw fields too) so the active toggle, min purchase, bundle
      // details and date range all render. Dates stay ISO strings.
      return (data || []).map((d: any) => ({
        ...d,
        isActive: d.is_active,
        minPurchase: d.min_purchase,
        minQuantity: d.min_quantity,
        maxDiscount: d.max_discount,
        bundlePrice: d.bundle_price,
        bundleQuantity: d.bundle_quantity,
        productIds: d.product_ids,
        usageLimit: d.usage_limit,
        usageCount: d.usage_count || 0,
        startDate: d.start_date,
        endDate: d.end_date,
        nameAr: d.name_ar,
        nameKu: d.name_ku,
      }));
    } catch (error) {
      console.error('Error fetching discounts:', error);
      throw error;
    }
  }

  async getDiscount(discountId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase.from('discounts').select('*').eq('id', discountId).single();
      if (error || !data) return null;
      return data;
    } catch (error) {
      console.error('Error fetching discount:', error);
      throw error;
    }
  }

  async createDiscount(discountData: any): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('discounts')
        .insert([{ ...discountData, tenant_id: this.tenantId }])
        .select()
        .single();
      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error creating discount:', error);
      throw error;
    }
  }

  async updateDiscount(discountId: string, updates: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('discounts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', discountId)
        .eq('tenant_id', this.tenantId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating discount:', error);
      throw error;
    }
  }

  async deleteDiscount(discountId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('discounts')
        .delete()
        .eq('id', discountId)
        .eq('tenant_id', this.tenantId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting discount:', error);
      throw error;
    }
  }

  async toggleDiscountStatus(discountId: string): Promise<boolean> {
    try {
      const discount = await this.getDiscount(discountId);
      if (!discount) throw new Error('Discount not found');
      
      const newStatus = !discount.is_active;
      await this.updateDiscount(discountId, { is_active: newStatus });
      return newStatus;
    } catch (error) {
      console.error('Error toggling discount status:', error);
      throw error;
    }
  }

  async getDashboardStats(): Promise<TenantDashboardStats> {
    try {
      const orders = await this.getAllOrders(1000);
      // Need stock_qty for low-stock, and extra_data.coAdminIds to keep partner-shared products out
      // of owner revenue per-line (so a RETURNED item rejoins it) — matching getAnalyticsData / Reports.
      const { data: prodRows } = await supabase
        .from('parts').select('id, stock_qty, initial_stock, extra_data, price_tiers, price_usd').eq('tenant_id', this.tenantId);
      const products = (prodRows || []).map((r: any) => ({ stockQty: r.stock_qty, initialStock: r.initial_stock }));
      const assignedSet = new Set<string>();
      const partIds = new Set<string>();
      const wholesaleById = new Map<string, number>();   // wholesale unit price (lowest tier / base)
      for (const r of (prodRows || [])) {
        partIds.add((r as any).id);
        const ca = (r as any).extra_data?.coAdminIds;
        if (Array.isArray(ca) && ca.length) assignedSet.add((r as any).id);
        const tiers = Array.isArray((r as any).price_tiers) ? (r as any).price_tiers : [];
        const valid = tiers.filter((t: any) => t && t.minQty > 0 && t.priceUSD > 0).map((t: any) => Number(t.priceUSD));
        wholesaleById.set((r as any).id, valid.length ? Math.min(...valid) : (Number((r as any).price_usd) || 0));
      }
      const numv = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
      const customers = await this.getAllCustomers();

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      let todayRevenue = 0;
      let weekRevenue = 0;
      let monthRevenue = 0;
      let pendingOrders = 0;

      orders.forEach(order => {
        if (order.status === 'pending') pendingOrders++;
        if (order.status !== 'delivered') return;

        // Value owner sales at WHOLESALE (lowest tier / base), NOT the per-piece price — matching the
        // analytics + report. Skip a line that's the partner's: its product is still shared, OR — in a
        // partner-tagged order — its productId doesn't resolve to one of the owner's parts (custom POS line).
        const isPartnerOrder = !!(order as any).partnerId;
        const items = Array.isArray((order as any).items) ? (order as any).items : [];
        let amount = 0;
        for (const it of items) {
          if (assignedSet.has(it.productId) || (isPartnerOrder && !partIds.has(it.productId))) continue;
          // No wholesale price (custom/POS line or deleted product) → never fall back to the
          // charged per-piece price; the line just doesn't count toward owner wholesale revenue.
          if (!wholesaleById.has(it.productId)) continue;
          const q = numv(it.quantity) || 1;
          const ws = wholesaleById.get(it.productId) as number;
          amount += ws * q;
        }
        if (amount <= 0) return; // nothing for the owner

        const orderDate = new Date(order.createdAt);
        if (orderDate >= todayStart) todayRevenue += amount;
        if (orderDate >= weekStart) weekRevenue += amount;
        if (orderDate >= monthStart) monthRevenue += amount;
      });

      const lowStockProducts = products.filter(p => {
        const threshold = (p.initialStock && p.initialStock > 0) ? p.initialStock : 5;
        return p.stockQty > 0 && p.stockQty <= threshold;
      }).length;

      return {
        totalOrders: orders.length,
        pendingOrders,
        totalProducts: products.length,
        lowStockProducts,
        totalCustomers: customers.length,
        todayRevenue,
        weekRevenue,
        monthRevenue,
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  async getSettings(settingId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('setting_value')
        .eq('tenant_id', this.tenantId)
        .eq('setting_key', settingId)
        .single();
      
      if (error || !data) return null;
      return data.setting_value;
    } catch (error) {
      console.error('Error fetching settings:', error);
      throw error;
    }
  }

  async updateSettings(settingId: string, settingData: any): Promise<void> {
    try {
      await supabase
        .from('tenant_settings')
        .upsert({
          tenant_id: this.tenantId,
          setting_key: settingId,
          setting_value: settingData,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id, setting_key' });
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  async saveSettings(settingId: string, settingData: any): Promise<void> {
    return this.updateSettings(settingId, settingData);
  }

  async sendNotificationToCustomers(
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Stub for push notifications
      console.log('Notification sent to tenant customers');
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }
}

export const createTenantAdminService = (tenantId: string): TenantAdminService => {
  return new TenantAdminService(tenantId);
};

export default TenantAdminService;
