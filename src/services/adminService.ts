/**
 * Admin Service - Handles all admin operations
 * REWRITTEN FOR SUPABASE
 */

import { supabase } from './supabase';
import { Order, Product, User } from '../types';

// Helper to convert snake_case DB fields to camelCase for the frontend
const mapProduct = (data: any): Product => ({
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
  specifications: data.specifications || {},
  weight: data.weight,
  videoUrl: data.video_url,
  tenantId: data.tenant_id,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

const mapOrder = (data: any): Order => ({
  id: data.id,
  userId: data.user_id,
  orderNumber: data.order_number,
  status: data.status,
  paymentStatus: data.payment_status,
  subtotalUSD: data.subtotal_usd,
  shippingUSD: data.shipping_usd,
  taxUSD: data.tax_usd,
  discountUSD: data.discount_usd,
  totalUSD: data.total_usd,
  amountPaidUSD: data.amount_paid_usd,
  currency: data.currency,
  exchangeRate: data.exchange_rate,
  paymentMethod: data.payment_method,
  shippingAddress: data.shipping_address,
  items: data.items || [],
  notes: data.notes,
  specialInstructions: data.special_instructions,
  trackingNumber: data.tracking_number,
  stockStatus: data.stock_status,
  tenantId: data.tenant_id,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
} as any);

const mapUser = (data: any): User => ({
  uid: data.id,
  name: data.name,
  fullName: data.full_name,
  email: data.email,
  phone: data.phone,
  profileImageUrl: data.profile_image_url,
  coverUrl: data.cover_url,
  address: data.address,
  city: data.city,
  region: data.region,
  gender: data.gender,
  preferredCurrency: data.preferred_currency,
  language: data.language,
  role: data.role,
  isAdmin: data.is_admin,
  isBlocked: data.is_blocked,
  addresses: data.addresses || [],
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

// ============ DASHBOARD STATS ============

export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  totalProducts: number;
  lowStockProducts: number;
  totalCustomers: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
}

// (Removed dead fetchDashboardStats — it valued revenue per-piece and was never wired to any
// screen. The live home dashboard uses TenantAdminService.getDashboardStats, the Analytics screen
// uses getAnalyticsData; both value at wholesale. The DashboardStats interface above is kept —
// AdminDashboardScreen still imports it as the stats state type.)

// ============ ORDER MANAGEMENT ============

export const fetchAllOrders = async (limitCount = 100): Promise<Order[]> => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limitCount);

    if (error) throw error;
    return (data || []).map(mapOrder);
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
};

export const updateOrderStatus = async (
  orderId: string,
  newStatus: Order['status'],
  notes?: string
): Promise<void> => {
  try {
    // 1. Get the current order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;
    if (!orderData) throw new Error('Order not found');

    const order = mapOrder(orderData);
    const currentStatus = order.status || 'pending';
    const currentStockStatus = order.stockStatus || 'pending';

    const updatePayload: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updatePayload.notes = notes;
    }

    const isFulfilledState = ['confirmed', 'processing', 'shipped', 'delivered'].includes(newStatus);
    const isCancelledState = ['cancelled', 'cancelled_by_store', 'cancelled_by_user'].includes(newStatus);
    const requiresDeduction = isFulfilledState && currentStockStatus !== 'deducted';
    const requiresRestore = isCancelledState && currentStockStatus === 'deducted';
    const isPendingCancellation = isCancelledState && currentStockStatus !== 'deducted';

    const isAlreadyCancelled = ['cancelled', 'cancelled_by_store', 'cancelled_by_user'].includes(currentStatus);

    if (isAlreadyCancelled && isCancelledState) {
      console.warn('Order already cancelled');
    } else if (requiresDeduction || requiresRestore) {
      // In Supabase, complex multi-document transactions require a Postgres Function (RPC).
      // For this migration phase, we'll do best-effort sequential updates or call an RPC if we wrote one.
      // Doing sequential updates from the client for stock:
      for (const item of order.items) {
        const { data: productData } = await supabase.from('parts').select('stock_qty').eq('id', item.productId).single();
        if (productData) {
           const newQty = requiresDeduction 
             ? Math.max(0, productData.stock_qty - item.quantity)
             : productData.stock_qty + item.quantity;
           await supabase.from('parts').update({ stock_qty: newQty }).eq('id', item.productId);
        }
      }

      if (requiresDeduction) updatePayload.stock_status = 'deducted';
      else if (requiresRestore) updatePayload.stock_status = 'rolled_back';
    } else if (isPendingCancellation) {
      updatePayload.stock_status = 'rolled_back';
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

export const getOrderById = async (orderId: string): Promise<Order | null> => {
  try {
    const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (error) throw error;
    return data ? mapOrder(data) : null;
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
};

// ============ PRODUCT MANAGEMENT ============

export const fetchAllProducts = async (): Promise<Product[]> => {
  try {
    const { data, error } = await supabase.from('parts').select('*');
    if (error) throw error;
    return (data || []).map(mapProduct);
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

export const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    const payload = {
      name: productData.name,
      name_ar: productData.nameAr,
      name_ku: productData.nameKu,
      part_number: productData.partNumber,
      category: productData.category,
      category_ar: productData.categoryAr,
      category_ku: productData.categoryKu,
      price_usd: productData.priceUSD,
      purchase_price: productData.purchasePrice,
      stock_qty: productData.stockQty,
      description: productData.description,
      description_ar: productData.descriptionAr,
      description_ku: productData.descriptionKu,
      is_featured: productData.isFeatured,
      is_active: productData.isActive,
      brand: productData.brand,
      image_urls: productData.imageUrls,
      compatible_models: productData.compatibleModels,
      variations: productData.variations,
      color_variations: productData.colorVariations,
      price_tiers: productData.priceTiers,
      shipping_rates: productData.shippingRates,
      specifications: productData.specifications,
      weight: productData.weight,
      video_url: productData.videoUrl,
      tenant_id: productData.tenantId,
    };

    const { data, error } = await supabase.from('parts').insert([payload]).select().single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error('Error adding product:', error);
    throw error;
  }
};

export const updateProduct = async (
  productId: string,
  updates: Partial<Product>
): Promise<void> => {
  try {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.nameAr !== undefined) payload.name_ar = updates.nameAr;
    if (updates.nameKu !== undefined) payload.name_ku = updates.nameKu;
    if (updates.partNumber !== undefined) payload.part_number = updates.partNumber;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.priceUSD !== undefined) payload.price_usd = updates.priceUSD;
    if (updates.purchasePrice !== undefined) payload.purchase_price = updates.purchasePrice;
    if (updates.stockQty !== undefined) payload.stock_qty = updates.stockQty;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.isFeatured !== undefined) payload.is_featured = updates.isFeatured;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.brand !== undefined) payload.brand = updates.brand;
    if (updates.imageUrls !== undefined) payload.image_urls = updates.imageUrls;
    
    payload.updated_at = new Date().toISOString();

    const { error } = await supabase.from('parts').update(payload).eq('id', productId);
    if (error) throw error;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    const { error } = await supabase.from('parts').delete().eq('id', productId);
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
};

// ============ CUSTOMER MANAGEMENT ============

export const fetchAllCustomers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_admin', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapUser);
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
};

export const getCustomerOrders = async (userId: string): Promise<Order[]> => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapOrder);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    throw error;
  }
};

// ============ NOTIFICATIONS & ANALYTICS ============

export interface AdminNotification {
  title: string;
  body: string;
  titleAr?: string;
  titleKu?: string;
  bodyAr?: string;
  bodyKu?: string;
  type: 'promotion' | 'general' | 'order';
  targetUsers: 'all' | string[];
}

export const sendNotificationToUsers = async (notification: AdminNotification): Promise<void> => {
  // 1. Resolve target user ids
  let userIds: string[];
  if (notification.targetUsers === 'all') {
    const { data, error } = await supabase.from('users').select('id');
    if (error) throw error;
    userIds = (data || []).map((u: any) => u.id);
  } else {
    userIds = notification.targetUsers;
  }

  if (userIds.length === 0) return;

  // Localized strings travel in the notification's data jsonb (client picks by language)
  const payloadData = {
    titleAr: notification.titleAr ?? null,
    titleKu: notification.titleKu ?? null,
    bodyAr: notification.bodyAr ?? null,
    bodyKu: notification.bodyKu ?? null,
  };

  // 2. Write in-app notifications to Supabase — NotificationContext's realtime
  //    subscription delivers these to users instantly. Chunk to keep payloads small.
  const rows = userIds.map((uid) => ({
    user_id: uid,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    data: payloadData,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('notifications').insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }

  // 3. FCM lock-screen delivery via Supabase Edge Function (deployed in Phase 4).
  //    Wrapped so a missing/not-yet-deployed function never blocks the in-app write above.
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        userIds,
        title: notification.title,
        body: notification.body,
        data: { type: notification.type, ...payloadData },
      },
    });
  } catch (err) {
    console.warn('FCM push delivery skipped (send-push Edge Function not available yet):', err);
  }
};

export interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: Date;
}

export const fetchRecentOrders = async (count = 5): Promise<RecentOrder[]> => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(count);

    if (error) throw error;
    
    return (data || []).map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.shipping_address?.fullName || 'Unknown',
      total: o.total_usd,
      status: o.status,
      createdAt: new Date(o.created_at),
    }));
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    throw error;
  }
};

export const getAnalyticsData = async (startDate: Date, endDate: Date, tenantId?: string | null) => {
  const empty = {
    totalOrders: 0, totalRevenue: 0, totalRevenueIQD: 0,
    hasUSDOrders: false, hasIQDOrders: false,
    totalUnpaid: 0, totalUnpaidIQD: 0, totalProfit: 0, totalProfitIQD: 0,
    totalCollected: 0, totalCollectedIQD: 0,
    ordersByStatus: {} as Record<string, number>,
  };

  try {
    // The end date comes from a date picker at local midnight (00:00:00). Without
    // clamping to end-of-day, every order placed later on the selected final day
    // (the normal "to: today" case) is excluded from all totals and counts.
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    let query = supabase
      .from('orders')
      .select('status, currency, exchange_rate, total_usd, amount_paid_usd, items, created_at, extra_data')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endOfDay.toISOString());
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data, error } = await query;
    if (error) throw error;

    // Products currently shared with a partner are the partner's business — their share of
    // revenue/profit/cash is removed from the owner's analytics. Un-sharing restores them
    // (with full history), since this only reads the live coAdminIds flag.
    const assignedSet = new Set<string>();
    const partIds = new Set<string>();
    // Wholesale unit price per product (lowest valid tier price, else base) — the owner's revenue
    // and profit are valued at WHOLESALE, not the per-piece price actually charged on each line.
    const wholesaleById = new Map<string, number>();
    // Buy price per product from the PRODUCT (purchase_price), NOT the stale price recorded on each
    // order line (it.purchasePrice was wrong — showed old/low costs, overstating profit).
    const purchaseById = new Map<string, number>();
    try {
      let pq = supabase.from('parts').select('id, extra_data, price_tiers, price_usd, purchase_price');
      if (tenantId) pq = pq.eq('tenant_id', tenantId);
      const { data: parts } = await pq;
      for (const p of (parts || [])) {
        partIds.add((p as any).id);
        const ca = (p as any).extra_data?.coAdminIds;
        if (Array.isArray(ca) && ca.length) assignedSet.add((p as any).id);
        const tiers = Array.isArray((p as any).price_tiers) ? (p as any).price_tiers : [];
        const valid = tiers.filter((t: any) => t && t.minQty > 0 && t.priceUSD > 0).map((t: any) => Number(t.priceUSD));
        wholesaleById.set((p as any).id, valid.length ? Math.min(...valid) : (Number((p as any).price_usd) || 0));
        purchaseById.set((p as any).id, Number((p as any).purchase_price) || 0);
      }
    } catch { /* best-effort: if parts can't be read, no exclusion */ }

    const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
    // Cancelled orders (incl. cancelled_by_user / cancelled_by_store) are void —
    // excluded from every money total and from the counts.
    const isCancelled = (s: any) => String(s || '').toLowerCase().startsWith('cancel');

    let totalOrders = 0;
    let revUSD = 0, revIQD = 0, profUSD = 0, profIQD = 0;
    let collectedUSD = 0, collectedIQD = 0, unpaidUSD = 0, unpaidIQD = 0;
    const ordersByStatus: Record<string, number> = {};

    for (const o of (data || [])) {
      if (isCancelled(o.status)) continue;
      totalOrders++;
      const st = String(o.status || 'pending').toLowerCase();
      ordersByStatus[st] = (ordersByStatus[st] || 0) + 1;

      // Money is recognized only on DELIVERED orders (realized COD sales). Pending /
      // not-yet-delivered orders aren't fulfilled, so they don't count toward revenue,
      // profit, collected cash, or receivables — keeping everything reconciled:
      // Revenue = Collected + Unpaid. payment_status is unreliable (always 'pending'),
      // so paid/owed is derived from amount_paid_usd, never payment_status.
      if (st !== 'delivered') continue;
      // Partner-imported orders are NOT blanket-excluded. Their lines for products STILL shared
      // are stripped below (assignedSet/ownFrac), so an all-shared partner order still contributes
      // nothing; but lines for products since RETURNED to the owner (un-shared) correctly count
      // toward owner revenue/profit again — "the item returns with its full sales history".

      // Value the owner's sales at the WHOLESALE price (lowest tier / base), NEVER the per-piece
      // price charged on each line — per the owner's "wholesale, not piece-by-piece" rule. A line
      // is the partner's (skipped) if its product is still shared, OR — in a partner-tagged order —
      // its productId doesn't resolve to one of the owner's parts (custom POS line).
      const isPartnerOrder = !!o.extra_data?.partnerId;
      const isPartnerLine = (it: any) => assignedSet.has(it.productId) || (isPartnerOrder && !partIds.has(it.productId));
      const items = Array.isArray(o.items) ? o.items : [];
      let owRev = 0, owProfit = 0;
      for (const it of items) {
        if (isPartnerLine(it)) continue;
        // No wholesale price for this line's product (a custom/POS line, or a deleted product)
        // means it has no wholesale value — it must NEVER fall back to the charged per-piece price,
        // so it simply doesn't count toward the owner's wholesale revenue/profit.
        if (!wholesaleById.has(it.productId)) continue;
        const q = num(it.quantity) || 1;
        const ws = wholesaleById.get(it.productId) as number;
        owRev += ws * q;
        owProfit += (ws - (purchaseById.get(it.productId) || 0)) * q;
      }
      if (owRev <= 0) continue; // nothing for the owner (all shared / partner / no-price lines)

      const rate = num(o.exchange_rate) || 1520; // IQD per USD; market default if missing
      // Split the wholesale revenue into collected/owed by how much of the bill was actually paid,
      // so Revenue = Collected + Unpaid still holds — now at wholesale value.
      const billTotal = num(o.total_usd);
      const payFrac = billTotal > 0 ? Math.max(0, Math.min(1, Math.max(0, num(o.amount_paid_usd)) / billTotal)) : 1;
      const collected = owRev * payFrac;
      const outstanding = owRev - collected;

      revUSD += owRev;            revIQD += owRev * rate;
      collectedUSD += collected;  collectedIQD += collected * rate;
      unpaidUSD += outstanding;   unpaidIQD += outstanding * rate;
      profUSD += owProfit;        profIQD += owProfit * rate;
    }

    return {
      totalOrders,
      totalRevenue: parseFloat(revUSD.toFixed(2)),
      totalRevenueIQD: Math.round(revIQD),
      totalProfit: parseFloat(profUSD.toFixed(2)),
      totalProfitIQD: Math.round(profIQD),
      totalCollected: parseFloat(collectedUSD.toFixed(2)),
      totalCollectedIQD: Math.round(collectedIQD),
      totalUnpaid: parseFloat(unpaidUSD.toFixed(2)),
      totalUnpaidIQD: Math.round(unpaidIQD),
      ordersByStatus,
      // Iraqi shop with USD-denominated orders: show both USD and IQD views when there's data.
      hasUSDOrders: totalOrders > 0,
      hasIQDOrders: totalOrders > 0,
    };
  } catch (e) {
    console.error('getAnalyticsData error:', e);
    return empty;
  }
};

export default {
  fetchRecentOrders,
  fetchAllOrders,
  updateOrderStatus,
  getOrderById,
  fetchAllProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  fetchAllCustomers,
  getCustomerOrders,
  sendNotificationToUsers,
  getAnalyticsData,
};
