import { supabase } from './supabase';
import { Discount, Cart, CartItem, AppliedDiscount } from '../types';
import { LocalCartService } from './localCartService';

// The price the customer is actually charged for a line (wholesale tier / VIP aware).
// Discounts must be computed off THIS, not the base price, or the coupon can exceed
// the charged subtotal and produce a negative total / a failed order.
const lineSubtotal = (items: CartItem[], isVip: boolean): number =>
  items.reduce((sum, item) => sum + LocalCartService.getTieredPrice(item.product, item.quantity, isVip) * item.quantity, 0);

interface ProductWithTenant {
  tenantId?: string;
  [key: string]: any;
}

class DiscountService {
  private tenantCache: { [tenantId: string]: { discounts: Discount[]; timestamp: number } } = {};
  private readonly CACHE_TTL = 5 * 60 * 1000;

  private mapDbToDiscount(data: any): Discount {
    return {
      id: data.id,
      name: data.name,
      nameAr: data.name_ar,
      nameKu: data.name_ku,
      description: data.description,
      descriptionAr: data.description_ar,
      descriptionKu: data.description_ku,
      type: data.type,
      value: data.value,
      bundleQuantity: data.bundle_quantity,
      bundlePrice: data.bundle_price,
      minPurchase: data.min_purchase,
      minQuantity: data.min_quantity,
      maxDiscount: data.max_discount,
      productIds: data.product_ids,
      isActive: data.is_active,
      startDate: new Date(data.start_date) as any,
      endDate: new Date(data.end_date) as any,
      usageLimit: data.usage_limit,
      usageCount: data.usage_count || 0,
      createdAt: new Date(data.created_at) as any,
      updatedAt: new Date(data.updated_at) as any,
    };
  }

  async getActiveDiscountsByTenant(tenantId: string): Promise<Discount[]> {
    try {
      if (this.tenantCache[tenantId] && Date.now() - this.tenantCache[tenantId].timestamp < this.CACHE_TTL) {
        return this.tenantCache[tenantId].discounts;
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .lte('start_date', now)
        .order('start_date', { ascending: false });

      if (error) throw error;

      const discounts: Discount[] = [];
      const currentTime = Date.now();

      (data || []).forEach((doc) => {
        const discount = this.mapDbToDiscount(doc);
        const endTime = discount.endDate ? new Date(discount.endDate as any).getTime() : 0;
        
        if (endTime >= currentTime) {
          if (!discount.usageLimit || discount.usageCount < discount.usageLimit) {
            discounts.push(discount);
          }
        }
      });

      this.tenantCache[tenantId] = { discounts, timestamp: Date.now() };
      return discounts;
    } catch (error) {
      console.error(`Error fetching discounts for tenant ${tenantId}:`, error);
      return [];
    }
  }

  async getActiveDiscounts(): Promise<Discount[]> {
    return []; // Deprecated, should not be called without tenantId
  }

  async getAllDiscounts(): Promise<Discount[]> {
    try {
      const { data, error } = await supabase.from('discounts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(d => this.mapDbToDiscount(d));
    } catch (error) {
      console.error('Error fetching all discounts:', error);
      return [];
    }
  }

  async getDiscountById(discountId: string): Promise<Discount | null> {
    try {
      const { data, error } = await supabase.from('discounts').select('*').eq('id', discountId).single();
      if (error || !data) return null;
      return this.mapDbToDiscount(data);
    } catch (error) {
      console.error('Error fetching discount by id:', error);
      return null;
    }
  }

  async createDiscount(discountData: Omit<Discount, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('discounts')
        .insert([{
          name: discountData.name,
          name_ar: discountData.nameAr,
          name_ku: discountData.nameKu,
          description: discountData.description,
          description_ar: discountData.descriptionAr,
          description_ku: discountData.descriptionKu,
          type: discountData.type,
          value: discountData.value,
          bundle_quantity: discountData.bundleQuantity,
          bundle_price: discountData.bundlePrice,
          min_purchase: discountData.minPurchase,
          min_quantity: discountData.minQuantity,
          max_discount: discountData.maxDiscount,
          product_ids: discountData.productIds,
          is_active: discountData.isActive,
          start_date: discountData.startDate instanceof Date ? discountData.startDate.toISOString() : new Date(discountData.startDate as any).toISOString(),
          end_date: discountData.endDate instanceof Date ? discountData.endDate.toISOString() : new Date(discountData.endDate as any).toISOString(),
          usage_limit: discountData.usageLimit,
        }])
        .select()
        .single();
      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error creating discount:', error);
      throw error;
    }
  }

  async updateDiscount(discountId: string, updates: Partial<Discount>): Promise<void> {
    try {
      const mappedUpdates: any = { updated_at: new Date().toISOString() };
      
      if (updates.name !== undefined) mappedUpdates.name = updates.name;
      if (updates.nameAr !== undefined) mappedUpdates.name_ar = updates.nameAr;
      if (updates.nameKu !== undefined) mappedUpdates.name_ku = updates.nameKu;
      if (updates.description !== undefined) mappedUpdates.description = updates.description;
      if (updates.descriptionAr !== undefined) mappedUpdates.description_ar = updates.descriptionAr;
      if (updates.descriptionKu !== undefined) mappedUpdates.description_ku = updates.descriptionKu;
      if (updates.type !== undefined) mappedUpdates.type = updates.type;
      if (updates.value !== undefined) mappedUpdates.value = updates.value;
      if (updates.bundleQuantity !== undefined) mappedUpdates.bundle_quantity = updates.bundleQuantity;
      if (updates.bundlePrice !== undefined) mappedUpdates.bundle_price = updates.bundlePrice;
      if (updates.minPurchase !== undefined) mappedUpdates.min_purchase = updates.minPurchase;
      if (updates.minQuantity !== undefined) mappedUpdates.min_quantity = updates.minQuantity;
      if (updates.maxDiscount !== undefined) mappedUpdates.max_discount = updates.maxDiscount;
      if (updates.productIds !== undefined) mappedUpdates.product_ids = updates.productIds;
      if (updates.isActive !== undefined) mappedUpdates.is_active = updates.isActive;
      if (updates.startDate !== undefined) mappedUpdates.start_date = updates.startDate instanceof Date ? updates.startDate.toISOString() : new Date(updates.startDate as any).toISOString();
      if (updates.endDate !== undefined) mappedUpdates.end_date = updates.endDate instanceof Date ? updates.endDate.toISOString() : new Date(updates.endDate as any).toISOString();
      if (updates.usageLimit !== undefined) mappedUpdates.usage_limit = updates.usageLimit;
      if (updates.usageCount !== undefined) mappedUpdates.usage_count = updates.usageCount;

      const { error } = await supabase.from('discounts').update(mappedUpdates).eq('id', discountId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating discount:', error);
      throw error;
    }
  }

  async deleteDiscount(discountId: string): Promise<void> {
    try {
      const { error } = await supabase.from('discounts').delete().eq('id', discountId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting discount:', error);
      throw error;
    }
  }

  async toggleDiscountStatus(discountId: string): Promise<boolean> {
    try {
      const discount = await this.getDiscountById(discountId);
      if (!discount) throw new Error('Discount not found');

      const newStatus = !discount.isActive;
      await this.updateDiscount(discountId, { isActive: newStatus });
      return newStatus;
    } catch (error) {
      console.error('Error toggling discount:', error);
      throw error;
    }
  }

  calculateDiscountAmountForItems(items: CartItem[], discount: Discount, isVip: boolean = false): number {
    const subtotal = lineSubtotal(items, isVip);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    if (discount.minPurchase && subtotal < discount.minPurchase) return 0;
    if (discount.minQuantity && totalItems < discount.minQuantity) return 0;

    let discountAmount = 0;

    switch (discount.type) {
      case 'percentage':
        discountAmount = (subtotal * discount.value) / 100;
        break;
      case 'fixed':
        discountAmount = discount.value;
        break;
      case 'bundle':
        if (discount.bundleQuantity && discount.bundlePrice) {
          if (totalItems >= discount.bundleQuantity) {
            const bundles = Math.floor(totalItems / discount.bundleQuantity);
            const bundledItems = bundles * discount.bundleQuantity;
            const avgPricePerItem = subtotal / totalItems;
            const originalBundlePrice = avgPricePerItem * bundledItems;
            const discountedBundlePrice = bundles * discount.bundlePrice;
            discountAmount = Math.max(0, originalBundlePrice - discountedBundlePrice);
          }
        }
        break;
    }

    if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
      discountAmount = discount.maxDiscount;
    }

    return Math.min(discountAmount, subtotal);
  }

  calculateDiscountAmount(cart: Cart, discount: Discount, isVip: boolean = false): number {
    return this.calculateDiscountAmountForItems(cart.items, discount, isVip);
  }

  isDiscountApplicableToItems(items: CartItem[], discount: Discount, isVip: boolean = false): { applicable: boolean; reason?: string } {
    const now = Date.now();
    const subtotal = lineSubtotal(items, isVip);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    if (!discount.isActive) return { applicable: false, reason: 'Discount is not active' };

    const startTime = discount.startDate ? new Date(discount.startDate as any).getTime() : 0;
    const endTime = discount.endDate ? new Date(discount.endDate as any).getTime() : 0;

    if (startTime > now) return { applicable: false, reason: 'Discount has not started yet' };
    if (endTime < now) return { applicable: false, reason: 'Discount has expired' };

    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return { applicable: false, reason: 'Discount usage limit reached' };
    }

    if (discount.minPurchase && subtotal < discount.minPurchase) {
      return { applicable: false, reason: `Minimum purchase of $${discount.minPurchase} required` };
    }

    if (discount.minQuantity && totalItems < discount.minQuantity) {
      return { applicable: false, reason: `Buy at least ${discount.minQuantity} items to get this discount` };
    }

    if (discount.type === 'bundle' && discount.bundleQuantity) {
      if (totalItems < discount.bundleQuantity) {
        return { applicable: false, reason: `Need at least ${discount.bundleQuantity} items for this deal` };
      }
    }

    return { applicable: true };
  }

  isDiscountApplicable(cart: Cart, discount: Discount, isVip: boolean = false): { applicable: boolean; reason?: string } {
    return this.isDiscountApplicableToItems(cart.items, discount, isVip);
  }

  async getBestDiscountForCart(cart: Cart, isVip: boolean = false): Promise<Discount | null> {
    try {
      const itemsByTenant = new Map<string, CartItem[]>();
      
      for (const item of cart.items) {
        const product = item.product as ProductWithTenant;
        const tenantId = product.tenantId;
        
        if (tenantId) {
          if (!itemsByTenant.has(tenantId)) itemsByTenant.set(tenantId, []);
          itemsByTenant.get(tenantId)!.push(item);
        }
      }

      if (itemsByTenant.size === 0) return null;

      let bestDiscount: Discount | null = null;
      let bestSavings = 0;

      for (const [tenantId, items] of itemsByTenant) {
        const tenantDiscounts = await this.getActiveDiscountsByTenant(tenantId);
        
        for (const discount of tenantDiscounts) {
          const { applicable } = this.isDiscountApplicableToItems(items, discount, isVip);
          if (applicable) {
            const savings = this.calculateDiscountAmountForItems(items, discount, isVip);
            if (savings > bestSavings) {
              bestSavings = savings;
              bestDiscount = discount;
            }
          }
        }
      }

      return bestDiscount;
    } catch (error) {
      console.error('Error getting best discount for cart:', error);
      return null;
    }
  }

  applyDiscountToCart(cart: Cart, discount: Discount, isVip: boolean = false): AppliedDiscount | null {
    const { applicable, reason } = this.isDiscountApplicable(cart, discount, isVip);

    if (!applicable) {
      console.log('Discount not applicable:', reason);
      return null;
    }

    const savedAmount = this.calculateDiscountAmount(cart, discount, isVip);
    
    if (savedAmount <= 0) return null;

    return {
      discountId: discount.id,
      discountName: discount.name,
      discountType: discount.type,
      discountValue: discount.value,
      savedAmount,
    };
  }

  async incrementUsageCount(discountId: string, tenantId?: string): Promise<void> {
    try {
      const discount = await this.getDiscountById(discountId);
      if (discount) {
        await this.updateDiscount(discountId, { usageCount: discount.usageCount + 1 });
        // Invalidate the tenant cache so a discount that just reached its usage
        // limit is not re-offered/applied from the (up to 5-min) stale snapshot.
        if (tenantId) delete this.tenantCache[tenantId];
      }
    } catch (error) {
      console.error('Error incrementing usage count:', error);
    }
  }

  getDiscountStatus(discount: Discount): 'active' | 'inactive' | 'expired' | 'scheduled' | 'limit_reached' {
    const now = Date.now();

    if (!discount.isActive) return 'inactive';

    const startTime = discount.startDate ? new Date(discount.startDate as any).getTime() : 0;
    const endTime = discount.endDate ? new Date(discount.endDate as any).getTime() : 0;

    if (startTime > now) return 'scheduled';
    if (endTime < now) return 'expired';

    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return 'limit_reached';
    }

    return 'active';
  }

  async getPotentialDiscounts(cart: Cart, isVip: boolean = false): Promise<{ discount: Discount; missingQuantity?: number; missingAmount?: number }[]> {
    try {
      const itemsByTenant = new Map<string, CartItem[]>();
      
      for (const item of cart.items) {
        const product = item.product as ProductWithTenant;
        const tenantId = product.tenantId;
        
        if (tenantId) {
          if (!itemsByTenant.has(tenantId)) itemsByTenant.set(tenantId, []);
          itemsByTenant.get(tenantId)!.push(item);
        }
      }

      const opportunities: { discount: Discount; missingQuantity?: number; missingAmount?: number }[] = [];

      for (const [tenantId, items] of itemsByTenant) {
        const tenantDiscounts = await this.getActiveDiscountsByTenant(tenantId);
        const subtotal = lineSubtotal(items, isVip);
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

        for (const discount of tenantDiscounts) {
          const check = this.isDiscountApplicableToItems(items, discount, isVip);
          if (check.applicable) continue;

          if (!discount.isActive || (discount.usageLimit && discount.usageCount >= discount.usageLimit)) continue;

          if (discount.minQuantity && totalItems < discount.minQuantity) {
            opportunities.push({ discount, missingQuantity: discount.minQuantity - totalItems });
            continue;
          }

          if (discount.minPurchase && subtotal < discount.minPurchase) {
            opportunities.push({ discount, missingAmount: discount.minPurchase - subtotal });
            continue;
          }

          if (discount.type === 'bundle' && discount.bundleQuantity && totalItems < discount.bundleQuantity) {
            opportunities.push({ discount, missingQuantity: discount.bundleQuantity - totalItems });
          }
        }
      }

      return opportunities.sort((a, b) => b.discount.value - a.discount.value);
    } catch (error) {
      console.error('Error finding potential discounts:', error);
      return [];
    }
  }

  formatDiscountValue(discount: Discount): string {
    switch (discount.type) {
      case 'percentage': return `${discount.value}% OFF`;
      case 'fixed': return `$${discount.value} OFF`;
      case 'bundle': return `${discount.bundleQuantity} for $${discount.bundlePrice}`;
      default: return '';
    }
  }
}

export default new DiscountService();
