import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { USE_MOCK_DATA, MOCK_BANNERS } from './mockData';

// Banners change rarely but were re-fetched on every Home mount and every return
// to the tab, so the hero carousel waited on the network each time. Serve the last
// result instantly and refresh in the background (stale-while-revalidate).
const BANNER_CACHE_PREFIX = 'cache_banners_v1';
const BANNER_TTL_MS = 10 * 60 * 1000;
// Keyed by tenant so one store's admin edits can never surface in another store's
// carousel once banners are tenant-scoped (see the tenantId note below).
const bannerMemoryCache = new Map<string, { data: BannerItem[]; timestamp: number }>();
const bannerCacheKey = (tenantId?: string) =>
  tenantId ? `${BANNER_CACHE_PREFIX}_${tenantId}` : BANNER_CACHE_PREFIX;

export interface BannerItem {
  id: string;
  imageUrl: string;
  title?: string;
  linkUrl?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
}

class BannerService {
  /**
   * Get all banners (active only by default), ordered by `order` field
   *
   * NOTE on `tenantId`: banners are not tenant-scoped in the live DB yet — the
   * `banners` table has no `tenant_id` column, so every filter/write below is
   * applied ONLY when a tenantId is passed. Callers must keep passing nothing
   * until the column exists and is backfilled; filtering on a missing column
   * would empty the storefront carousel.
   */
  private async fetchBanners(activeOnly: boolean, tenantId?: string): Promise<BannerItem[]> {
    let query = supabase.from('banners').select('*').order('sort_order', { ascending: true });
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(d => ({
      id: d.id,
      imageUrl: d.image_url || '',
      title: d.title || undefined,
      linkUrl: d.link_url || undefined,
      order: d.sort_order ?? 0,
      isActive: d.is_active ?? true,
      createdAt: new Date(d.created_at),
    }));
  }

  async getBanners(activeOnly = true, tenantId?: string): Promise<BannerItem[]> {
    if (USE_MOCK_DATA) return MOCK_BANNERS;

    // Only the active-banner list (the storefront carousel) is cached; the admin
    // screen asks for all banners and must always see the truth.
    if (!activeOnly) {
      try {
        return await this.fetchBanners(false, tenantId);
      } catch (error) {
        console.error('BannerService.getBanners error:', error);
        return [];
      }
    }

    const key = bannerCacheKey(tenantId);
    const cached = bannerMemoryCache.get(key) ?? (await this.readCache(key));
    if (cached) {
      bannerMemoryCache.set(key, cached);
      const stale = Date.now() - cached.timestamp > BANNER_TTL_MS;
      // Return immediately; refresh behind the scenes when stale.
      if (stale) {
        this.fetchBanners(true, tenantId)
          .then((fresh) => this.writeCache(key, fresh))
          .catch(() => {});
      }
      return cached.data;
    }

    try {
      const fresh = await this.fetchBanners(true, tenantId);
      await this.writeCache(key, fresh);
      return fresh;
    } catch (error) {
      console.error('BannerService.getBanners error:', error);
      return [];
    }
  }

  private async readCache(key: string): Promise<{ data: BannerItem[]; timestamp: number } | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.data) && parsed.timestamp ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, data: BannerItem[]): Promise<void> {
    const entry = { data, timestamp: Date.now() };
    bannerMemoryCache.set(key, entry);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // cache write failure is non-fatal
    }
  }

  /** Drop the cached storefront banners (call after an admin edit). */
  async clearCache(): Promise<void> {
    bannerMemoryCache.clear();
    try {
      // Sweep every tenant key: an admin edit must also invalidate the copy the
      // storefront read under a different key, or Home keeps showing the old set.
      const keys = await AsyncStorage.getAllKeys();
      const bannerKeys = keys.filter((k) => k.startsWith(BANNER_CACHE_PREFIX));
      if (bannerKeys.length > 0) {
        await AsyncStorage.multiRemove(bannerKeys);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Add a new banner
   */
  async addBanner(
    imageUrl: string,
    order: number,
    opts?: { title?: string; linkUrl?: string },
    tenantId?: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('banners')
        .insert([{
          image_url: imageUrl,
          sort_order: order,
          is_active: true,
          title: opts?.title?.trim() || null,
          link_url: opts?.linkUrl?.trim() || null,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        }])
        .select()
        .single();
        
      if (error) throw error;
      await this.clearCache();
      return data.id;
    } catch (error) {
      console.error('BannerService.addBanner error:', error);
      return null;
    }
  }

  /**
   * Update a banner's fields (isActive, order, imageUrl)
   */
  async updateBanner(
    id: string,
    data: Partial<Pick<BannerItem, 'imageUrl' | 'order' | 'isActive' | 'title' | 'linkUrl'>>,
    tenantId?: string
  ): Promise<boolean> {
    try {
      const updateData: any = {};
      if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;
      if (data.order !== undefined) updateData.sort_order = data.order;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;
      if (data.title !== undefined) updateData.title = data.title?.trim() || null;
      if (data.linkUrl !== undefined) updateData.link_url = data.linkUrl?.trim() || null;

      let query = supabase.from('banners').update(updateData).eq('id', id);
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { error } = await query;
      if (error) throw error;
      await this.clearCache();
      return true;
    } catch (error) {
      console.error('BannerService.updateBanner error:', error);
      return false;
    }
  }

  /**
   * Delete a banner
   */
  async deleteBanner(id: string, tenantId?: string): Promise<boolean> {
    try {
      let query = supabase.from('banners').delete().eq('id', id);
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { error } = await query;
      if (error) throw error;
      await this.clearCache();
      return true;
    } catch (error) {
      console.error('BannerService.deleteBanner error:', error);
      return false;
    }
  }

  /**
   * Batch reorder banners — accepts an array of IDs in desired order
   */
  async reorderBanners(orderedIds: string[], tenantId?: string): Promise<boolean> {
    try {
      // In Supabase we just do sequential updates or an RPC. Each row's error must
      // be checked: a swallowed failure left the caller's optimistic list looking
      // reordered while the DB kept the old (or a duplicated) sort_order.
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        let query = supabase.from('banners').update({ sort_order: i }).eq('id', id);
        if (tenantId) {
          query = query.eq('tenant_id', tenantId);
        }
        const { error } = await query;
        if (error) throw error;
      }
      await this.clearCache();
      return true;
    } catch (error) {
      console.error('BannerService.reorderBanners error:', error);
      return false;
    }
  }
}

export const bannerService = new BannerService();
export default bannerService;
