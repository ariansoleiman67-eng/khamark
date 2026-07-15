// Brand entity + service. Admin can manage brands (name + logo) instead of the
// auto letter-icons used on the Home "Our Brands" grid. Mock-backed while Supabase
// is the placeholder (USE_MOCK_DATA), with AsyncStorage persistence so admin edits
// stick across reloads in the demo. Swap the mock branch for Supabase when live.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

const STORAGE_KEY = '@asankary_brands_mock_v4';

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

export const brandService = {
  async getActiveBrands(_tenantId?: string): Promise<Brand[]> {
    if (USE_MOCK_DATA) {
      const brands = await readMock();
      return brands.filter(b => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    // TODO(live): read from Supabase `brands` table (tenant-scoped) when backend is wired.
    return [];
  },

  async getAllBrands(_tenantId?: string): Promise<Brand[]> {
    if (USE_MOCK_DATA) return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
    return [];
  },

  async saveBrand(brand: Partial<Brand> & { name: string }): Promise<Brand> {
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
    // TODO(live): upsert into Supabase.
    return {
      id: brand.id || 'temp',
      name: brand.name,
      logoUrl: brand.logoUrl,
      isActive: brand.isActive ?? true,
      sortOrder: brand.sortOrder ?? 0,
    };
  },

  async deleteBrand(id: string): Promise<void> {
    if (USE_MOCK_DATA) {
      const brands = (await readMock()).filter(b => b.id !== id);
      await writeMock(brands);
      return;
    }
    // TODO(live): delete from Supabase.
  },
};
