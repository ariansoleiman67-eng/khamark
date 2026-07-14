import { supabase } from './supabase';
import { BRAND } from '../constants/config';

export interface TenantContactInfo {
  id: string;
  name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}

const DEFAULT_CONTACT: TenantContactInfo = {
  id: 'default',
  name: BRAND.name,
  phone: BRAND.contactPhone,
  whatsapp: BRAND.contactPhone,
  email: BRAND.contactEmail,
};

export async function getTenantContactInfo(tenantId: string): Promise<TenantContactInfo> {
  if (!tenantId) {
    return DEFAULT_CONTACT;
  }

  try {
    const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId).single();

    if (!error && data) {
      return {
        id: data.id,
        name: data.store_name || data.business_info?.name || data.business_info?.businessName || data.business_info?.displayName,
        phone: data.business_info?.phone || data.business_info?.phoneNumber,
        whatsapp: data.business_info?.whatsapp || data.business_info?.whatsappNumber || data.business_info?.phone?.replace(/[^0-9]/g, ''),
        email: data.business_info?.email,
      };
    }
  } catch (error) {
    console.warn('Failed to fetch tenant info:', error);
  }

  return DEFAULT_CONTACT;
}

export async function getOrderSupportContact(items: Array<{ tenantId?: string; productId?: string }>): Promise<TenantContactInfo> {
  const tenantId = items.find(item => item.tenantId)?.tenantId;
  
  if (tenantId) {
    return getTenantContactInfo(tenantId);
  }
  
  return DEFAULT_CONTACT;
}

export default {
  getTenantContactInfo,
  getOrderSupportContact,
  DEFAULT_CONTACT,
};
