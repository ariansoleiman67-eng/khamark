import { supabase } from './supabase';
import { locationService } from './locationService';

export interface StoreProfile {
  storeName: string;
  storeNameAr?: string;
  storeNameKu?: string;
  logoUrl?: string;
  coverUrl?: string;
  coverUrls?: string[];
  about?: string;
  aboutAr?: string;
  aboutKu?: string;
  phone?: string;
  whatsapp?: string;
  tiktok?: string;
  email?: string;
  publicLocationId?: string;
  location?: { latitude: number; longitude: number };
  addressText?: string;
  addressTextAr?: string;
  addressTextKu?: string;
  city?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  wechat?: string;
  wechatId?: string;
  isVerified?: boolean;
  responseTimeMins?: number;
  openTime?: string | null;
  closeTime?: string | null;
  closedDays?: number[] | null;
  timeZone?: string | null;
  isActive: boolean;
  updatedAt: any;
}

export interface StoreProfileUpdate {
  storeName?: string;
  storeNameAr?: string;
  storeNameKu?: string;
  logoUrl?: string;
  coverUrl?: string;
  coverUrls?: string[];
  about?: string;
  aboutAr?: string;
  aboutKu?: string;
  phone?: string;
  whatsapp?: string;
  tiktok?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  wechat?: string;
  wechatId?: string;
  isVerified?: boolean;
  responseTimeMins?: number;
  openTime?: string | null;
  closeTime?: string | null;
  closedDays?: number[] | null;
  timeZone?: string | null;
  isActive?: boolean;
}

class StoreProfileService {
  private profileCache = new Map<string, { data: StoreProfile | null; timestamp: number }>();
  private readonly PROFILE_CACHE_TTL = 10 * 60 * 1000;
  private allStoresCache: { data: Array<{ tenantId: string; profile: StoreProfile }>; timestamp: number } | null = null;
  private readonly ALL_STORES_CACHE_TTL = 10 * 60 * 1000;

  private mapDbToProfile(data: any): StoreProfile {
    const hours = data.operating_hours || {};
    return {
      storeName: data.store_name || '',
      storeNameAr: data.store_name_ar || '',
      storeNameKu: data.store_name_ku || '',
      logoUrl: data.logo_url,
      coverUrl: data.cover_url,
      coverUrls: data.cover_urls || [],
      about: data.about,
      aboutAr: data.about_ar,
      aboutKu: data.about_ku,
      phone: data.phone,
      whatsapp: data.whatsapp,
      tiktok: data.tiktok,
      email: data.email,
      publicLocationId: data.public_location_id,
      location: data.location,
      addressText: data.address_text,
      addressTextAr: data.address_text_ar,
      addressTextKu: data.address_text_ku,
      city: data.city,
      website: data.website,
      instagram: data.instagram,
      facebook: data.facebook,
      wechat: data.wechat,
      wechatId: data.wechat_id,
      isVerified: data.is_verified,
      responseTimeMins: data.response_time_mins,
      isActive: data.is_active ?? true,
      openTime: hours.openTime,
      closeTime: hours.closeTime,
      closedDays: hours.closedDays,
      timeZone: hours.timeZone,
      updatedAt: data.updated_at,
    };
  }

  async getStoreProfile(tenantId: string): Promise<StoreProfile | null> {
    if (!tenantId) return null;
    
    const cached = this.profileCache.get(tenantId);
    if (cached && (Date.now() - cached.timestamp) < this.PROFILE_CACHE_TTL) {
      return cached.data;
    }
    
    try {
      const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      
      const profile = (!error && data) ? this.mapDbToProfile(data) : null;
      this.profileCache.set(tenantId, { data: profile, timestamp: Date.now() });
      
      return profile;
    } catch (error) {
      console.error('Error fetching store profile:', error);
      return null;
    }
  }

  async getMyTenantId(adminUid: string): Promise<string | null> {
    if (!adminUid) return null;
    
    try {
      const { data, error } = await supabase.from('tenants').select('id').eq('owner_id', adminUid).limit(1);
      if (error || !data || data.length === 0) return null;
      return data[0].id;
    } catch (error) {
      console.error('Error getting tenant ID:', error);
      return null;
    }
  }

  async updateStoreProfile(tenantId: string, data: StoreProfileUpdate): Promise<void> {
    if (!tenantId) throw new Error('Tenant ID required');
    
    const updateData: any = { updated_at: new Date().toISOString() };
    const hours: any = {};

    if (data.storeName !== undefined) updateData.store_name = data.storeName;
    if (data.storeNameAr !== undefined) updateData.store_name_ar = data.storeNameAr;
    if (data.storeNameKu !== undefined) updateData.store_name_ku = data.storeNameKu;
    if (data.logoUrl !== undefined) updateData.logo_url = data.logoUrl;
    if (data.coverUrl !== undefined) updateData.cover_url = data.coverUrl;
    if (data.coverUrls !== undefined) updateData.cover_urls = data.coverUrls;
    if (data.about !== undefined) updateData.about = data.about;
    if (data.aboutAr !== undefined) updateData.about_ar = data.aboutAr;
    if (data.aboutKu !== undefined) updateData.about_ku = data.aboutKu;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.whatsapp !== undefined) updateData.whatsapp = data.whatsapp;
    if (data.tiktok !== undefined) updateData.tiktok = data.tiktok;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.website !== undefined) updateData.website = data.website;
    if (data.instagram !== undefined) updateData.instagram = data.instagram;
    if (data.facebook !== undefined) updateData.facebook = data.facebook;
    if (data.wechat !== undefined) updateData.wechat = data.wechat;
    if (data.wechatId !== undefined) updateData.wechat_id = data.wechatId;
    if (data.isVerified !== undefined) updateData.is_verified = data.isVerified;
    if (data.responseTimeMins !== undefined) updateData.response_time_mins = data.responseTimeMins;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;

    if (data.openTime !== undefined) hours.openTime = data.openTime;
    if (data.closeTime !== undefined) hours.closeTime = data.closeTime;
    if (data.closedDays !== undefined) hours.closedDays = data.closedDays;
    if (data.timeZone !== undefined) hours.timeZone = data.timeZone;

    if (Object.keys(hours).length > 0) {
      const { data: existingData } = await supabase.from('tenants').select('operating_hours').eq('id', tenantId).single();
      updateData.operating_hours = { ...(existingData?.operating_hours || {}), ...hours };
    }

    const { error } = await supabase.from('tenants').update(updateData).eq('id', tenantId);
    if (error) {
       // if not exists, we should create a new one but the assumption is tenant already created by system
       console.error('Update store profile failed:', error);
       throw error;
    }
  }

  async setDefaultLocation(
    tenantId: string,
    locationId: string,
    adminUid: string
  ): Promise<void> {
    if (!tenantId || !locationId || !adminUid) {
      throw new Error('Missing required parameters');
    }
    
    const canModify = await locationService.canAdminModifyLocation(locationId, adminUid);
    if (!canModify) {
      throw new Error('You do not have permission to use this location');
    }
    
    const location = await locationService.getLocationById(locationId);
    if (!location) {
      throw new Error('Location not found');
    }
    
    const updateData: any = {
      public_location_id: locationId,
      address_text: location.address || '',
      address_text_ar: location.addressAr || '',
      address_text_ku: location.addressKu || '',
      city: location.city || '',
      updated_at: new Date().toISOString(),
    };
    
    if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
      updateData.location = { latitude: location.latitude, longitude: location.longitude };
    }
    
    await supabase.from('tenants').update(updateData).eq('id', tenantId);
  }

  async getAllStoreProfiles(): Promise<Array<{ tenantId: string; profile: StoreProfile }>> {
    if (this.allStoresCache && (Date.now() - this.allStoresCache.timestamp) < this.ALL_STORES_CACHE_TTL) {
      return this.allStoresCache.data;
    }

    try {
      const { data, error } = await supabase.from('tenants').select('*');
      if (error || !data) return [];

      const filtered = data
        .map(doc => {
          const profile = this.mapDbToProfile(doc);
          if (!profile.isActive || !profile.storeName) return null;
          this.profileCache.set(doc.id, { data: profile, timestamp: Date.now() });
          return { tenantId: doc.id, profile };
        })
        .filter((r): r is { tenantId: string; profile: StoreProfile } => r !== null);

      this.allStoresCache = { data: filtered, timestamp: Date.now() };

      return filtered;
    } catch (error) {
      console.error('Error fetching all store profiles:', error);
      return [];
    }
  }

  async hasStoreProfile(tenantId: string): Promise<boolean> {
    if (!tenantId) return false;
    try {
      const { data, error } = await supabase.from('tenants').select('id').eq('id', tenantId).single();
      return !error && !!data;
    } catch {
      return false;
    }
  }
}

export const storeProfileService = new StoreProfileService();
export default storeProfileService;
