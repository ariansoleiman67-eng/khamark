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
      // Store Profile writes the customer-facing contact to the tenant's top-level
      // columns; business_info is the older admin-only copy. Reading business_info
      // first meant the phone/WhatsApp/email an admin sets in Store Profile were
      // never used and order support fell back to a hard-coded number.
      return {
        id: data.id,
        name: data.store_name || data.business_info?.name || data.business_info?.businessName || data.business_info?.displayName,
        phone: data.phone || data.business_info?.phone || data.business_info?.phoneNumber,
        // Digits only: whatsapp:// / wa.me reject a leading "+" (it decodes to a space).
        whatsapp: (data.whatsapp || data.business_info?.whatsapp || data.business_info?.whatsappNumber || data.phone || data.business_info?.phone)?.replace(/[^0-9]/g, ''),
        email: data.email || data.business_info?.email,
      };
    }
  } catch (error) {
    console.warn('Failed to fetch tenant info:', error);
  }

  return DEFAULT_CONTACT;
}

export interface TenantBranchLocation {
  name?: string;
  nameAr?: string;
  nameKu?: string;
  address?: string;
  addressAr?: string;
  addressKu?: string;
  city?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Main (or first active) branch row for a tenant, read from `store_locations`.
 *
 * Used as the address/coordinates fallback for tenants whose Store Profile has no
 * address of its own. `store_locations` has no tenant_id column — rows are keyed by
 * the admin who created them (created_by_admin_id) — so the tenant's owner has to be
 * resolved first, and the column on `tenants` is `owner_id`, not `owner_uid`.
 */
export async function getTenantPrimaryLocation(tenantId: string): Promise<TenantBranchLocation | null> {
  if (!tenantId) return null;

  try {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('owner_id')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant?.owner_id) return null;

    const { data: rows, error } = await supabase
      .from('store_locations')
      .select('*')
      .eq('created_by_admin_id', tenant.owner_id)
      .eq('is_active', true);

    if (error || !rows || rows.length === 0) return null;

    const row = rows.find((r: any) => r.type === 'main') || rows[0];

    // Postgres NUMERIC arrives over PostgREST as a string; the raw value would be
    // interpolated into the maps URL and compared with typeof === 'number'.
    const latitude = row.latitude != null ? Number(row.latitude) : NaN;
    const longitude = row.longitude != null ? Number(row.longitude) : NaN;

    return {
      name: row.name,
      nameAr: row.name_ar,
      nameKu: row.name_ku,
      address: row.address,
      addressAr: row.address_ar,
      addressKu: row.address_ku,
      city: row.city,
      phone: row.phone,
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
    };
  } catch (error) {
    console.warn('Failed to fetch tenant branch location:', error);
    return null;
  }
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
  getTenantPrimaryLocation,
  getOrderSupportContact,
  DEFAULT_CONTACT,
};
