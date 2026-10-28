// Promo-code entity + service. Admin creates codes (percentage or fixed-amount);
// customers enter one at checkout to get a discount. Mock-backed while Supabase is
// the placeholder (USE_MOCK_DATA), with AsyncStorage persistence so demo edits stick.
// Mirrors the brandService / categoryStore pattern. Swap the mock branch for
// Supabase (a `promo_codes` table) when the backend is wired.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_DATA } from './mockData';
import { supabase } from './supabase';

// Map a Supabase `promo_codes` row (snake_case) to the camelCase Promo type.
const mapRow = (r: any): Promo => ({
  id: r.id,
  code: r.code,
  type: (r.type === 'fixed' ? 'fixed' : 'percentage') as PromoType,
  value: Number(r.value) || 0,
  minPurchase: r.min_purchase != null ? Number(r.min_purchase) : undefined,
  isActive: r.is_active ?? true,
  sortOrder: r.sort_order ?? 0,
});

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

const STORAGE_KEY = '@khamark_promos_mock_v1';

const SEED_PROMOS: Promo[] = [
  { id: 'promo-welcome10', code: 'WELCOME10', type: 'percentage', value: 10, isActive: true, sortOrder: 0 },
  { id: 'promo-save5', code: 'SAVE5', type: 'fixed', value: 5, minPurchase: 30, isActive: true, sortOrder: 1 },
  { id: 'promo-vip15', code: 'VIP15', type: 'percentage', value: 15, minPurchase: 100, isActive: true, sortOrder: 2 },
];

const normalize = (code: string) => code.trim().toUpperCase();

async function readMock(): Promise<Promo[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Only trust valid-JSON-AND-array payloads; a non-array (e.g. `{}`, `42`,
      // `null` from a corrupt/partial write) would crash getAll().sort() etc.
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fall through to seed
  }
  // Best-effort seed write; failure here is non-fatal (we still return the seed).
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_PROMOS)).catch(() => {});
  return SEED_PROMOS.slice();
}

async function writeMock(promos: Promo[]): Promise<void> {
  // Let persistence failures reject so save()/remove() callers can surface them
  // instead of reporting a success that never hit disk.
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(promos));
}

// Serialize all mock mutations so overlapping save()/remove() read-modify-write
// cycles can't clobber each other (AsyncStorage has no atomic update). Each op is
// chained after the previous, whether it resolved or rejected, and the caller still
// sees its own op's result/rejection.
let mutationQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(op, op);
  mutationQueue = run.catch(() => {});
  return run;
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
  // tenantId scopes every read to one store: promo codes are per-tenant (see the
  // uniq_promo_code_per_tenant index), so an unscoped read lets a customer redeem
  // — and an admin edit/delete — another store's codes.
  async getAll(tenantId?: string): Promise<Promo[]> {
    if (USE_MOCK_DATA) return (await readMock()).sort((a, b) => a.sortOrder - b.sortOrder);
    let q = supabase.from('promo_codes').select('*').order('sort_order', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) { console.error('promo getAll', error); return []; }
    return (data || []).map(mapRow);
  },

  async getActive(tenantId?: string): Promise<Promo[]> {
    return (await this.getAll(tenantId)).filter((p) => p.isActive);
  },

  // Resolve a user-entered code to an active promo (case-insensitive), or null.
  async findByCode(code: string, tenantId?: string): Promise<Promo | null> {
    const target = normalize(code);
    if (!target) return null;
    const promos = await this.getAll(tenantId);
    return promos.find((p) => p.isActive && normalize(p.code) === target) ?? null;
  },

  async save(promo: Partial<Promo> & { code: string; tenantId?: string }): Promise<Promo> {
    if (USE_MOCK_DATA) {
      return enqueue(async () => {
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
          // Extra random suffix so two creates in the same millisecond can't collide.
          id: `promo-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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
      });
    }
    const row: any = {
      code: normalize(promo.code),
      type: promo.type ?? 'percentage',
      value: promo.value ?? 0,
      min_purchase: promo.minPurchase ?? null,
      is_active: promo.isActive ?? true,
      sort_order: promo.sortOrder ?? 0,
    };
    if (promo.id) row.id = promo.id;
    if (promo.tenantId) row.tenant_id = promo.tenantId;
    const { data, error } = await supabase.from('promo_codes').upsert(row).select().single();
    if (error) throw error;
    return mapRow(data);
  },

  async remove(id: string, tenantId?: string): Promise<void> {
    if (USE_MOCK_DATA) {
      await enqueue(async () => {
        const promos = (await readMock()).filter((p) => p.id !== id);
        await writeMock(promos);
      });
      return;
    }
    let q = supabase.from('promo_codes').delete().eq('id', id);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { error } = await q;
    if (error) throw error;
  },
};
