// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA (demo without a backend)
// Auto-enabled while Supabase points at the placeholder URL. Once a real
// EXPO_PUBLIC_SUPABASE_URL is set, USE_MOCK_DATA becomes false and the app uses
// live data. Products/brands mirror the aynAlfahad reference (Momax, Samsung, …).
// ─────────────────────────────────────────────────────────────────────────────
import { Product, Timestamp, SearchFilters, PaginationInfo, ProductStatus } from '../types';
import { SUPABASE_CONFIG } from '../constants/config';

export const USE_MOCK_DATA =
  process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true' ||
  SUPABASE_CONFIG.URL.includes('replace-with-asankary');

const TS_MS = 1717200000000;
const ts = (): Timestamp =>
  ({
    toDate: () => new Date(TS_MS),
    toMillis: () => TS_MS,
    seconds: Math.floor(TS_MS / 1000),
    nanoseconds: 0,
  } as unknown as Timestamp);

const img = (seed: string) => `https://picsum.photos/seed/asankary-${seed}/600/600`;

interface Seed {
  id: string;
  name: string;
  brand: string;
  category: string;
  priceUSD: number;
  stockQty: number;
  featured?: boolean;
  status?: ProductStatus;
  desc: string;
}

const SEEDS: Seed[] = [
  { id: 'p1', name: 'Momax Pinpop Lite Find My Locator Tracker (Apple)', brand: 'Momax', category: 'Trackers', priceUSD: 9.5, stockQty: 42, featured: true, desc: 'Ultra-compact item finder with Apple Find My support, replaceable battery and a loud locator ring.' },
  { id: 'p2', name: 'Momax Q.Mag X1 Qi2 Magnetic Wireless Battery Pack 10000mAh', brand: 'Momax', category: 'Power Banks', priceUSD: 47, stockQty: 0, desc: 'Qi2 magnetic 10000mAh power bank with 15W wireless charging and USB-C PD fast charge.' },
  { id: 'p3', name: 'Momax Padlock Fingerprint Smart Lock', brand: 'Momax', category: 'Security', priceUSD: 35, stockQty: 18, desc: 'Rechargeable fingerprint padlock, IP65 water resistant, stores up to 10 fingerprints.' },
  { id: 'p4', name: 'Samsung Power Adapter 65W Weight 155g Input V', brand: 'Samsung', category: 'Chargers', priceUSD: 32, stockQty: 60, featured: true, desc: '65W USB-C Super Fast Charging adapter for laptops, tablets and phones.' },
  { id: 'p5', name: 'Samsung Smart Tag2 Black & White', brand: 'Samsung', category: 'Trackers', priceUSD: 22, stockQty: 33, desc: 'SmartThings Find tracker with up to 700 days battery and Compass AR finding.' },
  { id: 'p6', name: 'Samsung 25W Adapter Travel Charger', brand: 'Samsung', category: 'Chargers', priceUSD: 18, stockQty: 0, desc: 'Compact 25W USB-C wall charger with adaptive fast charging.' },
  { id: 'p7', name: 'Samsung S26 Ultra 256GB', brand: 'Samsung', category: 'Phones', priceUSD: 1150, stockQty: 12, featured: true, desc: 'Flagship 6.9" AMOLED, 200MP camera, S Pen, Snapdragon Elite, 256GB storage.' },
  { id: 'p8', name: 'Samsung S26 Ultra 1TB', brand: 'Samsung', category: 'Phones', priceUSD: 1450, stockQty: 0, desc: 'Top-tier S26 Ultra with 1TB storage and 12GB RAM.' },
  { id: 'p9', name: 'Anker PowerCore 20000mAh PD', brand: 'Anker', category: 'Power Banks', priceUSD: 45, stockQty: 27, featured: true, desc: '20000mAh two-port power bank with 30W USB-C Power Delivery.' },
  { id: 'p10', name: 'Anker Nano 3 30W USB-C Charger', brand: 'Anker', category: 'Chargers', priceUSD: 26, stockQty: 40, desc: 'GaN 30W foldable charger, tiny footprint, PPS support.' },
  { id: 'p11', name: 'Mcdodo 100W USB-C to USB-C Cable', brand: 'Mcdodo', category: 'Cables', priceUSD: 12, stockQty: 80, desc: 'Braided 100W PD cable with LED power display, 1.8m.' },
  { id: 'p12', name: 'Belkin BoostCharge Pro 3-in-1', brand: 'Belkin', category: 'Chargers', priceUSD: 39, stockQty: 15, desc: '3-in-1 MagSafe stand for iPhone, Apple Watch and AirPods.' },
  { id: 'p13', name: 'tomtoc Laptop Sleeve 14"', brand: 'tomtoc', category: 'Bags', priceUSD: 34, stockQty: 22, featured: true, desc: 'CornerArmor protective 14" laptop sleeve with accessory pocket.' },
  { id: 'p14', name: 'tomtoc Tech Accessory Pouch', brand: 'tomtoc', category: 'Bags', priceUSD: 19, stockQty: 30, desc: 'Organizer pouch for chargers, cables and power banks.' },
  { id: 'p15', name: 'Havit Dual-Mode Wireless Keyboard & Mouse Combo', brand: 'Havit', category: 'Accessories', priceUSD: 20, stockQty: 0, desc: 'Slim wireless keyboard + mouse combo, 2.4G and Bluetooth dual mode.' },
  { id: 'p16', name: 'Havit M9036 Smart Watch', brand: 'Havit', category: 'Smartwatches', priceUSD: 30, stockQty: 0, desc: '1.85" display smartwatch with heart-rate, SpO2 and Bluetooth calling.' },
  { id: 'p17', name: 'Realme Watch S2 Smart Watch with Silicone Strap', brand: 'Realme', category: 'Smartwatches', priceUSD: 85, stockQty: 0, desc: 'AMOLED smartwatch with AI health tracking and 100+ sport modes.' },
  { id: 'p18', name: 'Belkin Wireless Charger Pad 15W', brand: 'Belkin', category: 'Chargers', priceUSD: 29, stockQty: 24, desc: 'Qi 15W fast wireless charging pad with anti-slip surface.' },
];

function build(s: Seed): Product {
  return {
    id: s.id,
    name: s.name,
    nameAr: s.name,
    nameKu: s.name,
    partNumber: s.id.toUpperCase(),
    category: s.category,
    categoryAr: s.category,
    categoryKu: s.category,
    imageUrls: [img(s.id + 'a'), img(s.id + 'b'), img(s.id + 'c')],
    priceUSD: s.priceUSD,
    stockQty: s.stockQty,
    description: s.desc,
    descriptionAr: s.desc,
    descriptionKu: s.desc,
    compatibleModels: [],
    isFeatured: !!s.featured,
    isActive: true,
    brand: s.brand,
    inStock: s.stockQty > 0,
    images: [img(s.id + 'a'), img(s.id + 'b'), img(s.id + 'c')],
    status: s.status ?? 'available',
    warranty: '12 months',
    condition: 'New',
    specifications: { Brand: s.brand, Category: s.category, Warranty: '12 months' },
    createdAt: ts(),
    updatedAt: ts(),
  };
}

export const MOCK_PRODUCTS: Product[] = SEEDS.map(build);

export const MOCK_BANNERS = [1, 2, 3, 4].map((n) => ({
  id: `b${n}`,
  imageUrl: `https://picsum.photos/seed/asankary-banner-${n}/1000/420`,
  order: n,
  isActive: true,
  createdAt: new Date(TS_MS),
}));

// ── query helpers (match the real ProductService return shapes) ──
export function mockGetProducts(
  filters: SearchFilters = {},
  pageInfo: PaginationInfo = { page: 1, limit: 20, total: 0, hasMore: true }
): { products: Product[]; pagination: PaginationInfo } {
  let list = MOCK_PRODUCTS.slice();
  if (filters.category) list = list.filter((p) => p.category === filters.category);
  if (filters.brand) list = list.filter((p) => p.brand === filters.brand);
  if (filters.inStock) list = list.filter((p) => (p.inStock ?? p.stockQty > 0));
  const from = (pageInfo.page - 1) * pageInfo.limit;
  const page = list.slice(from, from + pageInfo.limit);
  return {
    products: page,
    pagination: { ...pageInfo, total: list.length, hasMore: from + pageInfo.limit < list.length },
  };
}

export const mockGetProduct = (id: string): Product | null =>
  MOCK_PRODUCTS.find((p) => p.id === id) ?? null;

export const mockGetFeatured = (): Product[] => MOCK_PRODUCTS.filter((p) => p.isFeatured);

export const mockGetByCategory = (category: string): Product[] =>
  MOCK_PRODUCTS.filter((p) => p.category === category);

export const mockGetByIds = (ids: string[]): Product[] =>
  ids.map((id) => MOCK_PRODUCTS.find((p) => p.id === id)).filter(Boolean) as Product[];

export function mockSearch(query: string): Product[] {
  const q = (query || '').toLowerCase().trim();
  if (!q) return MOCK_PRODUCTS.slice();
  return MOCK_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
  );
}

export function mockGetCategories(): Array<{ name: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const p of MOCK_PRODUCTS) counts[p.category] = (counts[p.category] || 0) + 1;
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

export function mockActiveCategories() {
  return mockGetCategories().map((c, i) => ({
    id: `c${i}`,
    name: c.name,
    productCount: c.count,
    isActive: true,
    sortOrder: i,
    imageUrl: undefined as string | undefined,
  }));
}
