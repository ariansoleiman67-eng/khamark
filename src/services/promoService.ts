// Promo-code entity + service. Admin creates codes (percentage or fixed-amount);
// customers enter one at checkout to get a discount. Mock-backed while Supabase is
// the placeholder (USE_MOCK_DATA), with AsyncStorage persistence so demo edits stick.
// Mirrors the brandService / categoryStore pattern. Swap the mock branch for
// Supabase (a `promo_codes` table) when the backend is wired.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';

export type PromoType = 'percentage' | 'fixed';

export interface Promo {
  id: string;
  code: string;          // normalized to UPPERCASE (e.g. 'WELCOME10')
  type: PromoType;       // 'percentage' = value% off, 'fixed' = $value off
  value: number;         // 10 => 10% (percentage) or $10 (fixed)
  minPurchase?: number;  // optional minimum cart subtotal (USD) to qualify
  isActive: boolean;
  sortOrder: number;
}

const STORAGE_KEY = '@asankary_promos_mock_v1';

const SEED_PROMOS: Promo[] = [
  { id: 'promo-welcome10', code: 'WELCOME10', type: 'percentage', value: 10, isActive: true, sortOrder: 0 },
  { id: 'promo-save5', code: 'SAVE5', type: 'fixed', value: 5, minPurchase: 30, isActive: true, sortOrder: 1 },
  { id: 'promo-vip15', code: 'VIP15', type: 'percentage', value: 15, minPurchase: 100, isActive: true, sortOrder: 2 },
];

const normalize = (code: string) => code.trim().toUpperCase();

async function readMock(): Promise<Promo[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to seed
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_PROMOS)).catch(() => {});
  return SEED_PROMOS.slice();
}

async function writeMock(promos: Promo[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(promos)).catch(() => {});
}

// The USD amount a promo takes off a given subtotal (0 if it doesn't qualify).
// Never exceeds the subtotal.
export function computePromoDiscount(promo: Promo, subtotalUSD: number): number {
  if (!promo.isActive) return 0;
  if (promo.minPurchase && subtotalUSD < promo.minPurchase) return 0;
  const raw = promo.type === 'percentage' ? (subtotalUSD * promo.value) / 100 : promo.value;
  return Math.max(0, Math.min(raw, subtotalUSD));
}

export const promoService = {
  async getAll(): Promise<Promo[]> {
    if (USE_MOCK_DATA) return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
    // TODO(live): read from Supabase `promo_codes` table (tenant-scoped).
    return [];
  },

  async getActive(): Promise<Promo[]> {
    return (await this.getAll()).filter((p) => p.isActive);
  },

  // Resolve a user-entered code to an active promo (case-insensitive), or null.
  async findByCode(code: string): Promise<Promo | null> {
    const target = normalize(code);
    if (!target) return null;
    const promos = await this.getAll();
    return promos.find((p) => p.isActive && normalize(p.code) === target) ?? null;
  },

  async save(promo: Partial<Promo> & { code: string }): Promise<Promo> {
    if (USE_MOCK_DATA) {
      const promos = await readMock();
      const code = normalize(promo.code);
      if (promo.id) {
        const idx = promos.findIndex((p) => p.id === promo.id);
        if (idx >= 0) {
          promos[idx] = { ...promos[idx], ...promo, code } as Promo;
          await writeMock(promos);
          return promos[idx];
        }
      }
      const created: Promo = {
        id: `promo-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
        code,
        type: promo.type ?? 'percentage',
        value: promo.value ?? 0,
        minPurchase: promo.minPurchase,
        isActive: promo.isActive ?? true,
        sortOrder: promo.sortOrder ?? promos.length,
      };
      promos.push(created);
      await writeMock(promos);
      return created;
    }
    // TODO(live): upsert into Supabase.
    return {
      id: promo.id || 'temp',
      code: normalize(promo.code),
      type: promo.type ?? 'percentage',
      value: promo.value ?? 0,
      minPurchase: promo.minPurchase,
      isActive: promo.isActive ?? true,
      sortOrder: promo.sortOrder ?? 0,
    };
  },

  async remove(id: string): Promise<void> {
    if (USE_MOCK_DATA) {
      const promos = (await readMock()).filter((p) => p.id !== id);
      await writeMock(promos);
      return;
    }
    // TODO(live): delete from Supabase.
  },
};
