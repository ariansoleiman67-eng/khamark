// Brand entity + service. Admin can manage brands (name + logo) instead of the
// auto letter-icons used on the Home "Our Brands" grid. Mock-backed while Supabase
// is the placeholder (USE_MOCK_DATA), with AsyncStorage persistence so admin edits
// stick across reloads in the demo. Swap the mock branch for Supabase when live.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';
import { supabase } from './supabase';

// Map a Supabase `brands` row (snake_case) to the camelCase Brand domain type.
const mapRow = (r: any): Brand => ({
  id: r.id,
  name: r.name,
  logoUrl: r.logo_url ?? undefined,
  isActive: r.is_active ?? true,
  sortOrder: r.sort_order ?? 0,
});

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

const STORAGE_KEY = '@asankary_brands_mock_v5';

// Seed brands mirror the demo product brands. No default logo image (external
// logo CDNs are blocked in this env) — BrandTile renders a clean bold wordmark
// of the brand name. Admin uploads a real logo via the Brand Manager (local uri,
// reliable) to replace the wordmark.
const SEED_BRANDS: Brand[] = [
  { id: 'br-momax', name: 'Momax', isActive: true, sortOrder: 0 },
  { id: 'br-samsung', name: 'Samsung', isActive: true, sortOrder: 1 },
  { id: 'br-anker', name: 'Anker', isActive: true, sortOrder: 2 },
  { id: 'br-mcdodo', name: 'Mcdodo', isActive: true, sortOrder: 3 },
  { id: 'br-belkin', name: 'Belkin', isActive: true, sortOrder: 4 },
  { id: 'br-tomtoc', name: 'tomtoc', isActive: true, sortOrder: 5 },
  { id: 'br-havit', name: 'Havit', isActive: true, sortOrder: 6 },
  { id: 'br-realme', name: 'Realme', isActive: true, sortOrder: 7 },
];

async function readMock(): Promise<Brand[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to seed
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_BRANDS)).catch(() => {});
  return SEED_BRANDS.slice();
}

async function writeMock(brands: Brand[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(brands)).catch(() => {});
}

/**
 * One tile per brand NAME, not per row.
 *
 * The live table holds "Samsung" and "Anker" twice each — one row with an
 * uploaded logo, one without — so Home's brand rail printed each of them twice,
 * once as a logo and once as a bare wordmark. Keeping the row that HAS a logo
 * means the duplicate disappears and the better-looking tile is the survivor.
 *
 * Deliberately not applied to getAllBrands: the Brand Manager has to keep showing
 * every row, or the shop could never delete the duplicate it can no longer see.
 */
const dedupeByName = (brands: Brand[]): Brand[] => {
  const byName = new Map<string, Brand>();
  brands.forEach((b) => {
    const key = (b.name || '').trim().toLowerCase();
    if (!key) return;
    const kept = byName.get(key);
    if (!kept) { byName.set(key, b); return; }
    const keptHasLogo = !!kept.logoUrl && kept.logoUrl.trim().length > 0;
    const nextHasLogo = !!b.logoUrl && b.logoUrl.trim().length > 0;
    if (!keptHasLogo && nextHasLogo) byName.set(key, b);
  });
  // The query already ordered by sort_order; Map preserves insertion order, so the
  // shop's chosen order survives.
  return [...byName.values()];
};

export const brandService = {
  async getActiveBrands(tenantId?: string): Promise<Brand[]> {
    if (USE_MOCK_DATA) {
      const brands = await readMock();
      return brands.filter(b => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    let q = supabase.from('brands').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) { console.error('getActiveBrands', error); return []; }
    return dedupeByName((data || []).map(mapRow));
  },

  async getAllBrands(tenantId?: string): Promise<Brand[]> {
    if (USE_MOCK_DATA) return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
    let q = supabase.from('brands').select('*').order('sort_order', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) { console.error('getAllBrands', error); return []; }
    return (data || []).map(mapRow);
  },

  async saveBrand(brand: Partial<Brand> & { name: string; tenantId?: string }): Promise<Brand> {
    if (USE_MOCK_DATA) {
      const brands = await readMock();
      if (brand.id) {
        const idx = brands.findIndex(b => b.id === brand.id);
        if (idx >= 0) {
          brands[idx] = { ...brands[idx], ...brand } as Brand;
          await writeMock(brands);
          return brands[idx];
        }
      }
      const created: Brand = {
        id: `br-${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
        name: brand.name,
        logoUrl: brand.logoUrl,
        isActive: brand.isActive ?? true,
        sortOrder: brand.sortOrder ?? brands.length,
      };
      brands.push(created);
      await writeMock(brands);
      return created;
    }
    const row: any = {
      name: brand.name,
      logo_url: brand.logoUrl ?? null,
      is_active: brand.isActive ?? true,
      sort_order: brand.sortOrder ?? 0,
    };
    if (brand.id) row.id = brand.id;
    if (brand.tenantId) row.tenant_id = brand.tenantId;
    const { data, error } = await supabase.from('brands').upsert(row).select().single();
    if (error) throw error;
    return mapRow(data);
  },

  async deleteBrand(id: string, tenantId?: string): Promise<void> {
    if (USE_MOCK_DATA) {
      const brands = (await readMock()).filter(b => b.id !== id);
      await writeMock(brands);
      return;
    }
    // Scope the delete to the caller's tenant — RLS is permissive_all, so an
    // unscoped delete-by-id lets one store permanently erase another's brand.
    let q = supabase.from('brands').delete().eq('id', id);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { error } = await q;
    if (error) throw error;
  },
};
