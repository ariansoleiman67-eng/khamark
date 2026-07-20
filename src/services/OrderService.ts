import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, uniqueChannel } from './supabase';
import { formatFirestoreDate } from '../utils/dateUtils';
import { Order, OrderItem, OrderStatus, PaymentStatus, ShippingAddress, AppliedDiscount } from '../types';

const safeToDate = (val: any): Date | undefined => {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
};

export class OrderService {
  private static readonly CACHE_KEY = 'cached_orders';
  private static readonly CACHE_EXPIRY = 5 * 60 * 1000;
  private static cachedOrders: Order[] = [];
  private static lastCacheTime = 0;
  /**
   * Owner of `cachedOrders`. The cache outlives a session — it is a static field
   * mirrored into AsyncStorage — so without an owner id a logout→login (or an app
   * relaunch that restores the on-disk copy) hands account B the orders, addresses
   * and phone numbers of account A. Must be checked on EVERY read path: the fresh
   * read, the stale-while-revalidate path, the catch-block fallback, the by-id
   * lookup, and the on-disk restore.
   */
  private static cachedUserId: string | null = null;

  static async createOrder(
    cartItems: OrderItem[],
    shippingAddress: ShippingAddress,
    paymentMethod: string,
    notes?: string,
    shippingCost?: number,
    appliedDiscount?: AppliedDiscount | null,
    shippingOfficeInfo?: {
      recipientName: string;
      mobileNumber: string;
      officeName: string;
      officePhone: string;
    } | null,
    moneyExchangerInfo?: {
      officeName: string;
      officePhone: string;
      receiverName: string;
      receiverPhone: string;
      totalAmount: string;
    } | null,
    currency?: 'USD' | 'IQD',
    exchangeRate?: number,
    shouldClearCart: boolean = true
  ): Promise<{ orderId: string; orderNumber: string; totalUSD: number }> {
    // Concurrent callers share one promise. A `useState` flag at the call site does
    // not protect this: the state update only lands on the next render, so two taps
    // in the same frame both get through, and there is an `await` on the session
    // before any write begins for a second tap to slip past. Order numbers embed
    // Date.now() plus a random suffix, so nothing collides into a unique-constraint
    // rejection — both writes simply succeed and the customer is charged twice.
    if (this.createOrderInFlight) return this.createOrderInFlight;

    this.createOrderInFlight = (async () => {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData?.session?.user) {
        throw new Error('User must be authenticated');
      }

      try {
        return await this.createOrderDirectly(
          cartItems, shippingAddress, paymentMethod, notes, shippingCost,
          appliedDiscount, shippingOfficeInfo, moneyExchangerInfo, currency, exchangeRate,
          shouldClearCart
        );
      } catch (error: any) {
        console.error('Order creation failed:', error);
        throw new Error('Failed to create order: ' + (error.message || 'Unknown error'));
      }
    })();

    try {
      return await this.createOrderInFlight;
    } finally {
      this.createOrderInFlight = null;
    }
  }

  /**
   * In-flight `createOrder` call, shared by every concurrent caller.
   *
   * Deliberately not keyed by arguments: this is a single-user mobile client where
   * checkout is one screen, so overlapping calls are always the same order
   * double-submitted, never two distinct orders placed at once.
   */
  private static createOrderInFlight: Promise<{ orderId: string; orderNumber: string; totalUSD: number }> | null = null;

  private static async createOrderDirectly(
    cartItems: OrderItem[],
    shippingAddress: ShippingAddress,
    paymentMethod: string,
    notes?: string,
    shippingCost?: number,
    appliedDiscount?: AppliedDiscount | null,
    shippingOfficeInfo?: any,
    moneyExchangerInfo?: any,
    currency?: 'USD' | 'IQD',
    exchangeRate?: number,
    shouldClearCart: boolean = true
  ): Promise<{ orderId: string; orderNumber: string; totalUSD: number }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('User must be authenticated');

    // Guard against malformed/empty orders reaching the DB.
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error('Cart must contain at least one item');
    }

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const subtotalUSD = cartItems.reduce((sum, item) => sum + (item.priceUSD * item.quantity), 0);
    if (!(subtotalUSD > 0)) {
      throw new Error('Cart subtotal must be greater than $0');
    }
    
    let finalShippingCost = shippingCost !== undefined ? shippingCost : 0;
    if (shippingCost === undefined) {
       const cartObj = { 
         items: cartItems.map(item => ({
           productId: item.productId,
           product: { 
              priceUSD: item.originalPriceUSD || item.priceUSD, 
              shippingCost: item.shippingCost || 0 
           },
           quantity: item.quantity,
           variationId: item.variationId
         })),
         subtotalUSD
       } as any;
       
       const { CartService } = await import('./cartService');
       const { shipping: fallbackShippingCost } = await CartService.getCartSummaryAsync(
         cartObj, shippingAddress.city, shippingAddress.countryCode || ''
       );
       finalShippingCost = fallbackShippingCost;
    }

    const taxUSD = 0;
    // Defense-in-depth: never let a coupon exceed what's actually charged, so a
    // legitimately-eligible (e.g. wholesale/VIP) order can't fail or go negative.
    const grossUSD = subtotalUSD + finalShippingCost + taxUSD;
    const discountUSD = Math.min(appliedDiscount?.savedAmount || 0, grossUSD);
    const totalUSD = Math.max(0, grossUSD - discountUSD);
    if (totalUSD < 0) {
      throw new Error('Order total must be greater than $0');
    }

    // Supabase RPC or Sequential Writes (Fallback to sequential for migration)
    const orderData: any = {
      user_id: userId,
      order_number: orderNumber,
      currency: currency || 'USD',
      exchange_rate: exchangeRate || 1500,
      items: cartItems,
      subtotal_usd: subtotalUSD,
      shipping_usd: finalShippingCost,
      tax_usd: taxUSD,
      discount_usd: discountUSD > 0 ? discountUSD : null,
      total_usd: totalUSD,
      payment_method: {
        type: paymentMethod,
        status: 'pending',
        transactionId: null,
      },
      payment_status: 'pending',
      status: 'pending',
      shipping_address: shippingAddress, 
      notes: notes || null,
      stock_status: 'pending',
      tenant_id: cartItems[0]?.tenantId || null
    };

    // Custom fields (no dedicated columns) live in the jsonb `extra_data` — this is
    // what the order detail reads back for the shipping office / money exchanger.
    const extra: any = {};
    if (shippingOfficeInfo) extra.shippingOfficeInfo = shippingOfficeInfo;
    if (moneyExchangerInfo) extra.moneyExchangerInfo = moneyExchangerInfo;
    if (appliedDiscount) extra.appliedDiscount = appliedDiscount;
    if (Object.keys(extra).length) orderData.extra_data = extra;

    const { data: orderDoc, error: orderError } = await supabase.from('orders').insert([orderData]).select().single();
    if (orderError) throw orderError;
    
    const orderId = orderDoc.id;

    if (shouldClearCart) {
      // Clear cart sequentially
      await supabase.from('carts').update({ items: [], subtotal_usd: 0 }).eq('id', userId);
    }

    this.clearCache();
    
    return {
      orderId,
      orderNumber,
      totalUSD,
    };
  }

  static async processPayment(
    orderId: string,
    paymentMethod: string,
    paymentData?: any
  ): Promise<{ success: boolean; transactionId?: string }> {
    try {
      // Mock payment process for migration, real app would call Edge Function
      this.clearCache();
      return { success: true, transactionId: 'MOCK_TX_' + Date.now() };
    } catch (error: any) {
      throw new Error(error.message || 'Payment processing failed');
    }
  }

  // Guards against firing duplicate background revalidations at once.
  private static ordersRevalidating = false;

  static async getUserOrders(refresh = false): Promise<Order[]> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error('User must be authenticated to view orders');

      // A cache belonging to a different account is never usable — drop it rather
      // than serving another user's orders.
      if (this.cachedUserId && this.cachedUserId !== userId) this.clearCache();

      if (!refresh && this.cachedOrders.length > 0 && this.cachedUserId === userId) {
        if (this.isCacheValid()) return this.cachedOrders;
        // Stale-while-revalidate: hand back the cached orders immediately and
        // refresh in the background. OrdersScreen re-fetches on focus, so the
        // fresh list surfaces on the next focus without ever blocking the paint.
        this.revalidateUserOrders(userId);
        return this.cachedOrders;
      }

      return await this.fetchAndCacheUserOrders(userId);
    } catch (error: any) {
      // Falling back to cache is only safe when it provably belongs to the
      // account currently signed in.
      const currentUserId = (await supabase.auth.getSession()).data?.session?.user?.id;
      if (this.cachedOrders.length > 0 && this.cachedUserId && this.cachedUserId === currentUserId) {
        return this.cachedOrders;
      }
      throw new Error('Failed to fetch orders');
    }
  }

  private static revalidateUserOrders(userId: string): void {
    if (this.ordersRevalidating) return;
    this.ordersRevalidating = true;
    this.fetchAndCacheUserOrders(userId)
      .catch(() => {})
      .finally(() => { this.ordersRevalidating = false; });
  }

  private static async fetchAndCacheUserOrders(userId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const orders = (data || []).map(doc => ({
      id: doc.id,
      ...doc,
      items: doc.items,
      shippingAddress: doc.shipping_address,
      userId: doc.user_id,
      orderNumber: doc.order_number,
      subtotalUSD: doc.subtotal_usd,
      shippingUSD: doc.shipping_usd,
      taxUSD: doc.tax_usd,
      totalUSD: doc.total_usd,
      exchangeRate: doc.exchange_rate,
      // Payment fields are snake_case in the DB; map them so the order detail
      // shows the real paid/pending status and method (not a stale default).
      paymentStatus: doc.payment_status,
      paymentMethod: doc.payment_method,
      createdAt: new Date(doc.created_at),
      updatedAt: new Date(doc.updated_at),
      // Surface custom fields stored in extra_data so the order detail can show them.
      shippingOfficeInfo: doc.extra_data?.shippingOfficeInfo,
      moneyExchangerInfo: doc.extra_data?.moneyExchangerInfo,
      appliedDiscount: doc.extra_data?.appliedDiscount,
    })) as unknown as Order[];

    this.cachedOrders = orders;
    this.cachedUserId = userId;
    this.lastCacheTime = Date.now();
    this.saveCacheToStorage();

    return orders;
  }

  static async getOrderById(orderId: string): Promise<Order | null> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error('User must be authenticated');

      // Two checks, not one: the cache as a whole must belong to this user, AND the
      // individual row must too. The row check defends against a cache that was
      // populated by a path that did not set the owner id.
      if (this.cachedUserId === userId) {
        const cachedOrder = this.cachedOrders.find(order => order.id === orderId);
        if (cachedOrder && (cachedOrder as any).userId === userId) return cachedOrder;
      }

      const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      
      if (!data || error) return null;

      if (data.user_id !== userId) throw new Error('Unauthorized access to order');

      return {
        id: data.id,
        ...data,
        items: data.items,
        shippingAddress: data.shipping_address,
        userId: data.user_id,
        orderNumber: data.order_number,
        subtotalUSD: data.subtotal_usd,
        shippingUSD: data.shipping_usd,
        taxUSD: data.tax_usd,
        totalUSD: data.total_usd,
        exchangeRate: data.exchange_rate,
        paymentStatus: data.payment_status,
        paymentMethod: data.payment_method,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        shippingOfficeInfo: data.extra_data?.shippingOfficeInfo,
        moneyExchangerInfo: data.extra_data?.moneyExchangerInfo,
        appliedDiscount: data.extra_data?.appliedDiscount,
      } as Order;
    } catch (error: any) {
      throw new Error('Failed to fetch order details');
    }
  }

  static subscribeToOrderUpdates(
    callback: (orders: Order[]) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    let channel: any;
    
    supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) {
        errorCallback?.(new Error('User must be authenticated'));
        return;
      }

      channel = uniqueChannel(`public:orders:${userId}`);
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
        () => {
          this.getUserOrders(true).then(callback).catch(e => errorCallback?.(e));
        }
      ).subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }

  static subscribeToOrder(
    orderId: string,
    callback: (order: Order | null) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    let channel: any;
    
    supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) {
        errorCallback?.(new Error('User must be authenticated'));
        return;
      }

      channel = uniqueChannel(`public:orders_single:${orderId}`);
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        async () => {
          try {
            const order = await this.getOrderById(orderId);
            callback(order);
          } catch (e: any) {
            errorCallback?.(e);
          }
        }
      ).subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }

  static async cancelOrder(orderId: string, reason?: string): Promise<void> {
    try {
      // RLS makes orders UPDATE admin-only, so a direct client update matched 0
      // rows and falsely "succeeded". The SECURITY DEFINER RPC validates the
      // owner + a cancellable status server-side and sets 'cancelled_by_user'.
      const { error } = await supabase.rpc('cancel_my_order', { p_order_id: orderId });
      if (error) throw error;
      this.clearCache();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to cancel order');
    }
  }

  static async deleteOrder(orderId: string): Promise<void> {
    try {
      // RLS makes orders DELETE admin-only; use the owner-scoped RPC so the
      // delete actually happens (and fails loudly if it can't) instead of
      // silently no-opping while telling the user it was deleted.
      const { error } = await supabase.rpc('delete_my_order', { p_order_id: orderId });
      if (error) throw error;
      this.clearCache();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete order');
    }
  }

  static async reorder(orderId: string): Promise<{ addedItems: number; skippedItems: number }> {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) throw new Error('Order not found');

      let addedItems = 0;
      let skippedItems = 0;

      const { LocalCartService } = await import('./localCartService');
      const { ProductService } = await import('./productService');

      for (const item of order.items) {
        try {
          if (!item.productId || !item.quantity) {
            skippedItems++;
            continue;
          }

          const liveProduct = await ProductService.getProduct(item.productId);
          if (!liveProduct || liveProduct.isActive === false || !liveProduct.inStock) {
            skippedItems++;
            continue;
          }

          let maxStock = liveProduct.stockQty || 0;
          const currentCartQuantity = LocalCartService.getProductQuantityInCart(null, item.productId); 
          const availableToAdd = Math.max(0, maxStock - currentCartQuantity);
          const quantityToAdd = Math.min(item.quantity, availableToAdd);

          if (quantityToAdd <= 0) {
            skippedItems++;
            continue;
          }

          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData?.session?.user?.id;
          
          await LocalCartService.addToCart(
            userId || 'temp',
            item.productId,
            quantityToAdd,
            liveProduct,
            item.selectedOptions
          );
          
          addedItems++;
        } catch (error: any) {
          skippedItems++;
        }
      }

      return { addedItems, skippedItems };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to reorder items');
    }
  }

  static getOrderTimeline(order: Order): Array<{
    status: OrderStatus;
    date: Date;
    description: string;
    isActive: boolean;
  }> {
    const timeline = [
      {
        status: 'pending' as OrderStatus,
        date: order.createdAt as any,
        description: 'Order placed and pending confirmation',
        isActive: true,
      },
    ];

    const statusFlow: OrderStatus[] = ['confirmed', 'processing', 'shipped', 'delivered'];
    let currentFound = false;

    statusFlow.forEach(status => {
      if (order.status === status || currentFound) {
        timeline.push({
          status,
          date: order.updatedAt,
          description: this.getStatusDescription(status),
          isActive: order.status === status,
        });
        
        if (order.status === status) {
          currentFound = true;
        }
      } else {
        timeline.push({
          status,
          date: new Date(), 
          description: this.getStatusDescription(status),
          isActive: false,
        });
      }
    });

    if (order.status === 'cancelled') {
      timeline.push({
        status: 'cancelled' as OrderStatus,
        date: order.updatedAt,
        description: 'Order was cancelled',
        isActive: true,
      });
    }

    return timeline.map(item => ({
      ...item,
      date: item.date instanceof Date ? item.date : new Date(item.date),
    }));
  }

  private static getStatusDescription(status: OrderStatus): string {
    const descriptions: any = {
      pending: 'Order is pending confirmation',
      confirmed: 'Order confirmed and being prepared',
      processing: 'Order is being processed',
      shipped: 'Order has been shipped',
      delivered: 'Order delivered successfully',
      cancelled: 'Order was cancelled',
    };
    return descriptions[(status as string)] || 'Status update';
  }

  static async getOrderStatistics(): Promise<{
    totalOrders: number;
    totalSpent: number;
    pendingOrders: number;
    completedOrders: number;
  }> {
    try {
      const orders = await this.getUserOrders();
      return {
        totalOrders: orders.length,
        totalSpent: orders.reduce((sum, order) => sum + order.totalUSD, 0),
        pendingOrders: orders.filter(order => ['pending', 'confirmed', 'processing', 'shipped'].includes(order.status)).length,
        completedOrders: orders.filter(order => order.status === 'delivered').length,
      };
    } catch (error) {
      return { totalOrders: 0, totalSpent: 0, pendingOrders: 0, completedOrders: 0 };
    }
  }

  static async searchOrders(searchTerm: string): Promise<Order[]> {
    try {
      const allOrders = await this.getUserOrders();
      const searchLower = searchTerm.toLowerCase();

      return allOrders.filter(order => 
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.items.some(item => 
          item.productName.toLowerCase().includes(searchLower) ||
          item.partNumber.toLowerCase().includes(searchLower)
        )
      );
    } catch (error) {
      return [];
    }
  }

  static async getOrdersByStatus(status: OrderStatus): Promise<Order[]> {
    try {
      const allOrders = await this.getUserOrders();
      return allOrders.filter(order => order.status === status);
    } catch (error) {
      return [];
    }
  }

  static async getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]> {
    try {
      const allOrders = await this.getUserOrders();
      return allOrders.filter(order => {
        const orderDate = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt as any);
        return orderDate >= startDate && orderDate <= endDate;
      });
    } catch (error) {
      return [];
    }
  }

  static async getTotalSpent(startDate: Date, endDate: Date): Promise<number> {
    try {
      const orders = await this.getOrdersByDateRange(startDate, endDate);
      return orders
        .filter(order => order.status !== 'cancelled')
        .reduce((sum, order) => sum + order.totalUSD, 0);
    } catch (error) {
      return 0;
    }
  }

  static async getMostOrderedProducts(limit = 10): Promise<any[]> {
    try {
      const orders = await this.getUserOrders();
      const productStats = new Map<string, any>();

      orders.forEach(order => {
        if (order.status !== 'cancelled') {
          order.items.forEach(item => {
            const existing = productStats.get(item.productId);
            const orderDate = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt as any);
            if (existing) {
              existing.orderCount += 1;
              existing.totalQuantity += item.quantity;
              if (orderDate > existing.lastOrderDate) {
                existing.lastOrderDate = orderDate;
              }
            } else {
              productStats.set(item.productId, {
                productName: item.productName,
                partNumber: item.partNumber,
                orderCount: 1,
                totalQuantity: item.quantity,
                lastOrderDate: orderDate,
              });
            }
          });
        }
      });

      return Array.from(productStats.entries())
        .map(([productId, stats]) => ({ productId, ...stats }))
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, limit);
    } catch (error) {
      return [];
    }
  }

  private static isCacheValid(): boolean {
    return Date.now() - this.lastCacheTime < this.CACHE_EXPIRY;
  }

  private static clearCache(): void {
    this.cachedOrders = [];
    this.cachedUserId = null;
    this.lastCacheTime = 0;
    AsyncStorage.removeItem(this.CACHE_KEY);
  }

  private static async saveCacheToStorage(): Promise<void> {
    try {
      const cacheData = {
        orders: this.cachedOrders,
        userId: this.cachedUserId,
        timestamp: this.lastCacheTime,
      };
      await AsyncStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {}
  }

  private static async loadCacheFromStorage(): Promise<void> {
    try {
      const cacheData = await AsyncStorage.getItem(this.CACHE_KEY);
      if (cacheData) {
        const parsed = JSON.parse(cacheData);
        // A persisted cache with no recorded owner predates owner tracking and
        // cannot be attributed to anyone — discard it rather than risk serving it
        // to whoever signs in next.
        if (!parsed.userId) {
          await AsyncStorage.removeItem(this.CACHE_KEY);
          return;
        }
        if (Date.now() - parsed.timestamp < this.CACHE_EXPIRY) {
          this.cachedOrders = parsed.orders.map((order: any) => ({
            ...order,
            createdAt: new Date(order.createdAt),
            updatedAt: new Date(order.updatedAt),
          }));
          this.cachedUserId = parsed.userId;
          this.lastCacheTime = parsed.timestamp;
        }
      }
    } catch (error) {}
  }

  static async initialize(): Promise<void> {
    await this.loadCacheFromStorage();
  }

  static async clearAllCache(): Promise<void> {
    this.clearCache();
  }

  static getStatusColor(status: OrderStatus, theme: any): string {
    const colors: any = {
      pending: theme.colors.warning,
      confirmed: theme.colors.primary,
      processing: theme.colors.secondary,
      shipped: theme.colors.primary,
      delivered: theme.colors.success,
      cancelled: theme.colors.error,
    };
    return colors[(status as string)] || theme.colors.textSecondary;
  }

  static getStatusIcon(status: OrderStatus): string {
    const icons: any = {
      pending: 'time-outline',
      confirmed: 'checkmark-circle-outline',
      processing: 'cog-outline',
      shipped: 'airplane-outline',
      delivered: 'checkmark-done-outline',
      cancelled: 'close-circle-outline',
    };
    return icons[(status as string)] || 'help-circle-outline';
  }

  static formatOrderNumber(orderNumber: string): string {
    return `#${orderNumber}`;
  }

  static getDeliveryEstimate(order: Order): string {
    if (order.status === 'delivered') return 'Delivered';
    if (order.status === 'cancelled') return 'Cancelled';

    const estimates: any = {
      pending: 5,
      confirmed: 4,
      processing: 3,
      shipped: 2,
    };

    const daysToAdd = estimates[order.status as string] || 5;
    
    let baseDate: Date = new Date();
    if (order.createdAt instanceof Date) baseDate = order.createdAt;
    
    const estimatedDate = new Date(baseDate);
    estimatedDate.setDate(estimatedDate.getDate() + daysToAdd);
    
    return formatFirestoreDate(estimatedDate, 'en-US');
  }
}

export default OrderService;
