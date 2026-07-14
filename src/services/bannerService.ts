import { supabase } from './supabase';

export interface BannerItem {
  id: string;
  imageUrl: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
}

class BannerService {
  /**
   * Get all banners (active only by default), ordered by `order` field
   */
  async getBanners(activeOnly = true): Promise<BannerItem[]> {
    try {
      let query = supabase.from('banners').select('*').order('sort_order', { ascending: true });
      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(d => ({
        id: d.id,
        imageUrl: d.image_url || '',
        order: d.sort_order ?? 0,
        isActive: d.is_active ?? true,
        createdAt: new Date(d.created_at),
      }));
    } catch (error) {
      console.error('BannerService.getBanners error:', error);
      return [];
    }
  }

  /**
   * Add a new banner
   */
  async addBanner(imageUrl: string, order: number): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('banners')
        .insert([{ image_url: imageUrl, sort_order: order, is_active: true }])
        .select()
        .single();
        
      if (error) throw error;
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
    data: Partial<Pick<BannerItem, 'imageUrl' | 'order' | 'isActive'>>
  ): Promise<boolean> {
    try {
      const updateData: any = {};
      if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;
      if (data.order !== undefined) updateData.sort_order = data.order;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      const { error } = await supabase.from('banners').update(updateData).eq('id', id);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('BannerService.updateBanner error:', error);
      return false;
    }
  }

  /**
   * Delete a banner
   */
  async deleteBanner(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('banners').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('BannerService.deleteBanner error:', error);
      return false;
    }
  }

  /**
   * Batch reorder banners — accepts an array of IDs in desired order
   */
  async reorderBanners(orderedIds: string[]): Promise<boolean> {
    try {
      // In Supabase we just do sequential updates or an RPC
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        await supabase.from('banners').update({ sort_order: i }).eq('id', id);
      }
      return true;
    } catch (error) {
      console.error('BannerService.reorderBanners error:', error);
      return false;
    }
  }
}

export const bannerService = new BannerService();
export default bannerService;
