# Asankary Web — Foundation & Catalogue Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js 16 storefront at `/Users/maci/Desktop/Asankary - Web` that renders real products from the existing Supabase project in English, Arabic and Kurdish with correct RTL, priced identically to the mobile app.

**Architecture:** Next.js App Router with server components for the public catalogue (cached, SEO-indexable) and client components for anything user-specific. One Supabase project shared with the mobile app — no new backend. Pricing and discount logic is ported verbatim from the app's pure-TypeScript utilities and locked with parity tests so the two surfaces can never quote different prices.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4 (CSS-first), next-intl, `@supabase/ssr`, Vitest.

> **Amended during Task 1.** The plan originally said Next.js 15. `create-next-app@latest`
> installs **16.3.0**, which `npm view next dist-tags` confirms is the stable `latest`
> (beta is `16.0.0-beta.0`, canary `16.3.1-canary.9`). `next-intl@4.13.5` lists
> `^16.0.0` in its peer range and `@supabase/ssr` constrains only `@supabase/supabase-js`,
> so nothing downstream breaks. Kept 16 rather than downgrading — it also matches the
> "newest" requirement. Tailwind v4 in Next 16 is **CSS-first**: there is no
> `tailwind.config.ts`; tokens are declared in an `@theme` block in `globals.css`.

**Spec:** `docs/superpowers/specs/2026-08-09-asankary-web-design.md` (in the mobile repo)

## Global Constraints

- Project root is `/Users/maci/Desktop/Asankary - Web`. The path contains a space — quote it in every shell command.
- TypeScript `strict: true`. No `any` in committed code except where mirroring the app's own `any` in mapper input.
- Design tokens are fixed: spacing `xs 4, sm 8, md 16, lg 24, xl 32`; radius `sm 6, md 12, lg 20, full 9999`; type `h1 32/700/40`, `h2 24/700/32`, `h3 20/600/28`, `body 16/400/24`, `caption 14/400/20`; animation `FAST 200, NORMAL 300, SLOW 500`; breakpoints `mobile 0, tablet 768, desktop 1024`; brand primary `#F5A00A`.
- Locales are exactly `en`, `ar`, `ku`. `ar` and `ku` render `dir="rtl"`.
- Translation fallback is always `ar?.trim() ? ar : en` — never a null check.
- Numbers render LTR regardless of locale.
- Every Supabase call handles `error` explicitly. No `!` non-null assertions on query results.
- **No public deployment** until the security gate in spec §5 is closed. Local and preview only.
- Secrets live in `.env.local`, which is git-ignored. Never commit a key. Never print a key into a file or log.
- Commit after every task.

---

## File Structure

```
Asankary - Web/
├── .env.local.example          # documents required vars; never holds real values
├── next.config.ts              # Supabase Storage host allow-list, image formats
├── vitest.config.ts
├── messages/
│   ├── en.json                 # UI strings (web-owned, not copied wholesale from app)
│   ├── ar.json
│   └── ku.json
└── src/
    ├── i18n/
    │   ├── routing.ts          # locale list, default, dir() helper
    │   └── request.ts          # next-intl server config
    ├── lib/
    │   ├── supabase/
    │   │   ├── browser.ts      # createBrowserClient — client components only
    │   │   └── server.ts       # createServerClient — server components only
    │   └── format.ts           # localised money/number/date, always-LTR numerals
    ├── domain/
    │   ├── types.ts            # Product, PriceTier, ProductVariation, ColorVariation, StorageOption
    │   ├── pricing.ts          # ported verbatim from the app
    │   ├── product-mapper.ts   # snake_case row -> Product
    │   └── i18n-field.ts       # localised field picker with the trim fallback
    ├── data/
    │   └── products.ts         # server-side catalogue queries
    ├── components/
    │   ├── ProductCard.tsx
    │   ├── Price.tsx
    │   └── StockBadge.tsx
    └── app/
        ├── layout.tsx
        └── [locale]/
            ├── layout.tsx      # dir + lang + font
            ├── page.tsx        # home
            └── p/[id]/page.tsx # product detail
```

**Responsibility boundaries.** `domain/` is pure — no React, no Next, no Supabase, fully unit-testable. `data/` is the only place that talks to Supabase for the catalogue. `components/` never queries. This is what makes the pricing parity tests meaningful.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.local.example`, `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces: a running dev server and a working `npm test`.

- [ ] **Step 1: Create the project**

```bash
cd "/Users/maci/Desktop"
npx create-next-app@latest "Asankary - Web" \
  --typescript --tailwind --app --src-dir --eslint \
  --import-alias "@/*" --no-turbopack --use-npm
cd "/Users/maci/Desktop/Asankary - Web"
```

- [ ] **Step 2: Add test tooling**

```bash
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Enforce strict TypeScript**

In `tsconfig.json` confirm `"strict": true` and add `"noUncheckedIndexedAccess": true`.

- [ ] **Step 5: Document environment variables**

Create `.env.local.example` — **placeholders only, never real values**:

```
# Supabase — same project as the mobile app. Get these from the Supabase dashboard.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Confirm `.gitignore` contains `.env*.local`.

- [ ] **Step 6: Verify it runs**

Run: `npm run dev`
Expected: dev server starts, `http://localhost:3000` renders the default page.

Run: `npm test`
Expected: exits 0 (no test files yet is fine).

- [ ] **Step 7: Commit**

```bash
git init && git add -A
git commit -m "chore: scaffold Next.js 16 storefront with Vitest"
```

---

## Task 2: Design tokens

**Files:**
- Modify: `src/app/globals.css` (Tailwind v4 is CSS-first — there is NO tailwind.config.ts)

**Interfaces:**
- Produces: Tailwind utilities `bg-brand`, `bg-canvas`, `bg-surface`, `p-md`, `gap-md`, `rounded-card`, `rounded-pill`, `tablet:`, `desktop:` — consumed by every later component. NOTE: TYPOGRAPHY is exported from tokens.ts but deliberately NOT wired into `@theme`; components use explicit `text-[Npx]` with the token values. There is no `text-h1` utility.

- [ ] **Step 1: Write the failing test**

Create `src/domain/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SPACING, RADIUS, DURATION, BREAKPOINTS } from './tokens'

describe('design tokens match the mobile app', () => {
  it('uses the app spacing scale', () => {
    expect(SPACING).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 })
  })
  it('uses the LIVE radius scale (themePresets, not theme.ts)', () => {
    expect(RADIUS).toEqual({ sm: 6, md: 12, lg: 20, full: 9999 })
  })
  it('uses the app animation durations', () => {
    expect(DURATION).toEqual({ fast: 200, normal: 300, slow: 500 })
  })
  it('uses the app breakpoints', () => {
    expect(BREAKPOINTS).toEqual({ mobile: 0, tablet: 768, desktop: 1024 })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./tokens`.

- [ ] **Step 3: Create the tokens**

Create `src/domain/tokens.ts`:

```ts
// Verbatim from the mobile app so the two surfaces cannot drift.
// Source: src/constants/themePresets.ts (baseSpacing, baseBorderRadius,
// baseTypography) and src/constants/theme.ts (ANIMATION_DURATION, BREAKPOINTS).
export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const

// NOTE: the app has TWO radius scales. This is the LIVE one from themePresets.ts.
// theme.ts exports a smaller BORDER_RADIUS (4/8/16) used by one component only.
export const RADIUS = { sm: 6, md: 12, lg: 20, full: 9999 } as const

export const TYPOGRAPHY = {
  h1: { size: 32, weight: 700, lineHeight: 40 },
  h2: { size: 24, weight: 700, lineHeight: 32 },
  h3: { size: 20, weight: 600, lineHeight: 28 },
  body: { size: 16, weight: 400, lineHeight: 24 },
  caption: { size: 14, weight: 400, lineHeight: 20 },
} as const

export const DURATION = { fast: 200, normal: 300, slow: 500 } as const
export const BREAKPOINTS = { mobile: 0, tablet: 768, desktop: 1024 } as const

// amber-retail preset, the app's default theme.
export const BRAND = {
  primary: '#F5A00A',
  primaryVariant: '#FF9F0D',
  secondary: '#2B2B2B',
  background: '#F4F4F6',
  surface: '#FFFFFF',
} as const
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the tokens into Tailwind**

Tailwind v4 is **CSS-first** — there is no `tailwind.config.ts`. Declare the tokens in
an `@theme` block in `src/app/globals.css`, immediately after the existing
`@import "tailwindcss";`. The values must equal `src/domain/tokens.ts` exactly; Step 6
adds a test that fails if they drift.

```css
@import "tailwindcss";

@theme {
  /* Brand — amber-retail preset, the mobile app's default theme */
  --color-brand: #F5A00A;
  --color-brand-variant: #FF9F0D;
  --color-surface: #FFFFFF;
  --color-canvas: #F4F4F6;
  --color-ink: #2B2B2B;

  /* Spacing — app scale: xs 4, sm 8, md 16, lg 24, xl 32 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Radius — the LIVE scale from themePresets.ts (md 12, lg 20) */
  --radius-card: 12px;
  --radius-pill: 20px;

  /* Breakpoints — app constants */
  --breakpoint-tablet: 768px;
  --breakpoint-desktop: 1024px;
}
```

This yields the utilities used by later tasks: `bg-brand`, `bg-canvas`, `bg-surface`,
`p-md`, `gap-md`, `rounded-card`, `rounded-pill`, `tablet:`, `desktop:`.

- [ ] **Step 5b: Lock the CSS tokens to the TypeScript tokens**

Append to `src/domain/tokens.test.ts` so the two sources cannot drift:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('globals.css @theme matches tokens.ts', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

  it('declares every spacing value from SPACING', () => {
    for (const [key, value] of Object.entries(SPACING)) {
      expect(css).toContain(`--spacing-${key}: ${value}px;`)
    }
  })
  it('declares the card and pill radii from RADIUS', () => {
    expect(css).toContain(`--radius-card: ${RADIUS.md}px;`)
    expect(css).toContain(`--radius-pill: ${RADIUS.lg}px;`)
  })
  it('declares the brand colour', () => {
    expect(css).toContain(`--color-brand: ${BRAND.primary};`)
  })
  it('declares the app breakpoints', () => {
    expect(css).toContain(`--breakpoint-tablet: ${BREAKPOINTS.tablet}px;`)
    expect(css).toContain(`--breakpoint-desktop: ${BREAKPOINTS.desktop}px;`)
  })
})
```

Run: `npm test`
Expected: PASS. Vitest's `environment: 'node'` already permits `node:fs`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: design tokens ported from the mobile app"
```

---

## Task 3: Port the pricing logic with parity tests

This is the highest-risk task in the plan. A difference here means a customer sees one price on their phone and another on the laptop.

**Files:**
- Create: `src/domain/types.ts`, `src/domain/pricing.ts`, `src/domain/pricing.test.ts`

**Interfaces:**
- Produces: `calculateTieredPrice(quantity, basePrice, tiers?, isVip?)`, `getEffectiveUnitPrice(product, quantity?, isVip?)`, `getDisplayUnitPrice(product, isVip?)`, `getEffectiveStock(product)`, `hasCompareAtDiscount(product, isVip?)`, `getDiscountPercent(product, isVip?)`, `hasVipPrice(product)`, `validatePriceTiers(tiers)`, `LOW_STOCK_THRESHOLD`.

- [ ] **Step 1: Create the domain types**

Create `src/domain/types.ts` (ported from the app's `src/types/index.ts:78-160`):

```ts
// Locale is declared HERE, in the pure domain layer, and re-exported by
// src/i18n/routing.ts. It must have exactly one definition — domain/ cannot
// import from i18n/routing.ts because that pulls in next-intl, and domain/
// stays free of framework imports so it remains unit-testable.
export type Locale = 'en' | 'ar' | 'ku'

export type ProductStatus = 'available' | 'coming_soon' | 'on_the_way'
export type ProductCondition = 'new' | 'used' | 'refurbished'

export interface PriceTier { minQty: number; maxQty?: number; priceUSD: number }

export interface ProductVariation {
  variationId: string; sizeValue: string; sizeUnit: string
  priceUSD?: number; stockQuantity: number
}

export interface ColorVariation {
  variationId: string; colorValue: string; colorHex?: string
  priceUSD?: number; imageUrl?: string; stockQuantity: number
}

export interface StorageOption { id: string; label: string; priceDelta: number }

export interface Product {
  id: string
  name: string; nameAr: string; nameKu: string
  description: string; descriptionAr: string; descriptionKu: string
  category: string; categoryAr: string; categoryKu: string
  partNumber: string; barcode?: string; sku?: string
  brand: string
  imageUrls: string[]
  priceUSD: number
  compareAtPriceUSD?: number
  vipPriceUSD?: number
  priceTiers?: PriceTier[]
  storageOptions?: StorageOption[]
  variations?: ProductVariation[]
  colorVariations?: ColorVariation[]
  shippingCost?: number
  shippingRates?: Array<{ city: string; price: number }>
  stockQty: number
  status?: ProductStatus
  // DB CHECK constrains this to new|used|refurbished. `status` has NO DB
  // constraint — validate it in application code.
  condition?: ProductCondition
  warranty?: string
  // NOTE: no `unit` field. The SQL comment mentions one; the code has never
  // written it. Rendering `unit` would print "undefined".
  dimensions?: { length: number; width: number; height: number }
  specifications?: Record<string, string>
  isFeatured: boolean
  isActive: boolean
  inStock: boolean
  sortOrder?: number
  tenantId?: string
  createdAt?: string
  updatedAt?: string
}
```

- [ ] **Step 2: Write the parity tests first**

Create `src/domain/pricing.test.ts`. These mirror the app's `__tests__/utils/pricingUtils.test.ts` so both suites assert the same behaviour:

```ts
import { describe, it, expect } from 'vitest'
import {
  validatePriceTiers, calculateTieredPrice, getDisplayUnitPrice,
  getEffectiveStock, hasCompareAtDiscount, getDiscountPercent,
} from './pricing'
import type { PriceTier } from './types'

const tiers: PriceTier[] = [
  { minQty: 5, priceUSD: 10 },
  { minQty: 10, priceUSD: 8 },
  { minQty: 20, priceUSD: 5 },
]

describe('validatePriceTiers', () => {
  it('accepts empty or undefined', () => {
    expect(validatePriceTiers([])).toBe(true)
    expect(validatePriceTiers(undefined as unknown as PriceTier[])).toBe(true)
  })
  it('accepts strictly ascending tiers', () => {
    expect(validatePriceTiers(tiers)).toBe(true)
  })
  it('rejects non-positive price or minQty', () => {
    expect(validatePriceTiers([{ minQty: 5, priceUSD: 0 }])).toBe(false)
    expect(validatePriceTiers([{ minQty: 0, priceUSD: 10 }])).toBe(false)
  })
  it('rejects duplicate or unordered minQty', () => {
    expect(validatePriceTiers([{ minQty: 5, priceUSD: 10 }, { minQty: 5, priceUSD: 8 }])).toBe(false)
    expect(validatePriceTiers([{ minQty: 10, priceUSD: 8 }, { minQty: 5, priceUSD: 10 }])).toBe(false)
  })
})

describe('calculateTieredPrice', () => {
  it('returns basePrice with no tiers', () => {
    expect(calculateTieredPrice(1, 12)).toBe(12)
    expect(calculateTieredPrice(100, 12, [])).toBe(12)
  })
  it('returns basePrice below the first tier for a normal user', () => {
    expect(calculateTieredPrice(4, 12, tiers, false)).toBe(12)
  })
  it('gives a VIP the first tier price below the first threshold', () => {
    expect(calculateTieredPrice(4, 12, tiers, true)).toBe(10)
  })
  it('applies the highest qualifying tier', () => {
    expect(calculateTieredPrice(5, 12, tiers)).toBe(10)
    expect(calculateTieredPrice(9, 12, tiers)).toBe(10)
    expect(calculateTieredPrice(10, 12, tiers)).toBe(8)
    expect(calculateTieredPrice(25, 12, tiers)).toBe(5)
  })
  it('falls back to basePrice on corrupt tiers', () => {
    expect(calculateTieredPrice(10, 12, [{ minQty: 0, priceUSD: 5 }])).toBe(12)
  })
})

describe('getEffectiveStock', () => {
  it('sums main, size and colour stock', () => {
    expect(getEffectiveStock({
      stockQty: 2,
      variations: [{ variationId: 'a', sizeValue: 'L', sizeUnit: '', stockQuantity: 3 }],
      colorVariations: [{ variationId: 'b', colorValue: 'Red', stockQuantity: 4 }],
    })).toBe(9)
  })
  it('counts a colour-only product as sellable', () => {
    expect(getEffectiveStock({
      stockQty: 0, variations: [],
      colorVariations: [{ variationId: 'b', colorValue: 'Red', stockQuantity: 5 }],
    })).toBe(5)
  })
})

describe('discount badges follow the price the shopper actually pays', () => {
  const p = { priceUSD: 12, compareAtPriceUSD: 20, priceTiers: tiers }
  it('shows a discount against the displayed price', () => {
    expect(hasCompareAtDiscount(p, false)).toBe(true)
    expect(getDiscountPercent(p, false)).toBe(40) // 1 - 12/20
  })
  it('uses the VIP price for a VIP shopper', () => {
    expect(getDisplayUnitPrice(p, true)).toBe(10)
    expect(getDiscountPercent(p, true)).toBe(50) // 1 - 10/20
  })
  it('reports no discount when compare-at is not above the paid price', () => {
    expect(hasCompareAtDiscount({ priceUSD: 12, compareAtPriceUSD: 12 })).toBe(false)
    expect(getDiscountPercent({ priceUSD: 12 })).toBe(0)
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./pricing`.

- [ ] **Step 4: Port the implementation verbatim**

Create `src/domain/pricing.ts`. Copy the body of the app's `src/utils/pricingUtils.ts` exactly, changing only the import path and dropping the `console.warn`:

```ts
import type { PriceTier, Product } from './types'

export const validatePriceTiers = (tiers: PriceTier[]): boolean => {
  if (!tiers || tiers.length === 0) return true
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!
    if (tier.minQty <= 0 || tier.priceUSD <= 0) return false
    if (i > 0 && tier.minQty <= tiers[i - 1]!.minQty) return false
  }
  return true
}

export const calculateTieredPrice = (
  quantity: number, basePrice: number, tiers?: PriceTier[], isVip = false,
): number => {
  if (!tiers || tiers.length === 0) return basePrice
  const sortedTiers = [...tiers].sort((a, b) => a.minQty - b.minQty)
  if (!validatePriceTiers(sortedTiers)) return basePrice

  const firstTier = sortedTiers[0]!
  let appliedTier: PriceTier | null = null
  for (let i = sortedTiers.length - 1; i >= 0; i--) {
    if (quantity >= sortedTiers[i]!.minQty) { appliedTier = sortedTiers[i]!; break }
  }
  if (appliedTier) return appliedTier.priceUSD
  if (isVip) return firstTier.priceUSD
  return basePrice
}

type Priceable = Pick<Product, 'priceUSD' | 'vipPriceUSD' | 'priceTiers'>

export const getEffectiveUnitPrice = (
  product: Priceable, quantity = 1, isVip = false,
): number => {
  if (isVip && typeof product.vipPriceUSD === 'number'
      && product.vipPriceUSD > 0 && product.vipPriceUSD < product.priceUSD) {
    return product.vipPriceUSD
  }
  return calculateTieredPrice(quantity, product.priceUSD, product.priceTiers, isVip)
}

export const getDisplayUnitPrice = (product: Priceable, isVip = false): number =>
  getEffectiveUnitPrice(product, 1, isVip)

export const LOW_STOCK_THRESHOLD = 5

export const getEffectiveStock = (
  product: Pick<Product, 'stockQty' | 'variations' | 'colorVariations'>,
): number => {
  const sizeStock = product.variations?.reduce((s, v) => s + (v.stockQuantity || 0), 0) || 0
  const colorStock = product.colorVariations?.reduce((s, v) => s + (v.stockQuantity || 0), 0) || 0
  return (product.stockQty || 0) + sizeStock + colorStock
}

type Discountable = Pick<Product, 'priceUSD' | 'vipPriceUSD' | 'priceTiers' | 'compareAtPriceUSD'>

export const hasCompareAtDiscount = (product: Discountable, isVip = false): boolean =>
  typeof product.compareAtPriceUSD === 'number'
  && product.compareAtPriceUSD > getDisplayUnitPrice(product, isVip)

export const getDiscountPercent = (product: Discountable, isVip = false): number => {
  if (!hasCompareAtDiscount(product, isVip)) return 0
  const shownPrice = getDisplayUnitPrice(product, isVip)
  return Math.round((1 - shownPrice / (product.compareAtPriceUSD as number)) * 100)
}

export const hasVipPrice = (product: Priceable): boolean => {
  if (typeof product.vipPriceUSD === 'number' && product.vipPriceUSD > 0
      && product.vipPriceUSD < product.priceUSD) return true
  return !!(product.priceTiers && product.priceTiers.length > 0)
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test`
Expected: PASS, all pricing tests green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: port pricing and discount logic with parity tests"
```

---

## Task 4: Localised field selection

**Files:**
- Create: `src/domain/i18n-field.ts`, `src/domain/i18n-field.test.ts`

**Interfaces:**
- Produces: `localized(row, base, locale)` returning the correct language string.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { localized } from './i18n-field'

const p = { name: 'Charger', nameAr: 'شاحن', nameKu: '' }

describe('localized', () => {
  it('returns the base field for English', () => {
    expect(localized(p, 'name', 'en')).toBe('Charger')
  })
  it('returns Arabic when present', () => {
    expect(localized(p, 'name', 'ar')).toBe('شاحن')
  })
  it('falls back to English on an EMPTY string, not just null', () => {
    expect(localized(p, 'name', 'ku')).toBe('Charger')
  })
  it('falls back to English on whitespace only', () => {
    expect(localized({ name: 'X', nameAr: '   ' }, 'name', 'ar')).toBe('X')
  })
  it('falls back when the translated key is absent entirely', () => {
    expect(localized({ name: 'X' }, 'name', 'ar')).toBe('X')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./i18n-field`.

- [ ] **Step 3: Implement**

```ts
import type { Locale } from './types'

// The app's rule, verbatim: `ar?.trim() ? ar : en`.
// A plain null-check is NOT enough — a one-time repair migration nulled copied
// translations, but nothing prevents an English string or '' being written back
// into name_ar by any other writer.
export function localized<T extends Record<string, unknown>>(
  row: T, base: string, locale: Locale,
): string {
  const fallback = String(row[base] ?? '')
  if (locale === 'en') return fallback
  const suffix = locale === 'ar' ? 'Ar' : 'Ku'
  const value = row[`${base}${suffix}`]
  return typeof value === 'string' && value.trim() ? value : fallback
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: localised field selection with the app's trim fallback"
```

---

## Task 5: Product mapper

**Files:**
- Create: `src/domain/product-mapper.ts`, `src/domain/product-mapper.test.ts`

**Interfaces:**
- Consumes: `Product` from Task 3.
- Produces: `mapProduct(row: Record<string, unknown>): Product`, and `LIST_COLUMNS: string`.

- [ ] **Step 1: Write the failing test**

The in-stock rule is the subtle part — test it hard.

```ts
import { describe, it, expect } from 'vitest'
import { mapProduct, LIST_COLUMNS } from './product-mapper'

const base = { id: '1', name: 'X', price_usd: '10', stock_qty: '0' }

describe('mapProduct', () => {
  it('coerces numeric strings from PostgREST', () => {
    const p = mapProduct({ ...base, price_usd: '10.50', stock_qty: '3' })
    expect(p.priceUSD).toBe(10.5)
    expect(p.stockQty).toBe(3)
  })
  it('defaults condition to new and status to available', () => {
    const p = mapProduct(base)
    expect(p.condition).toBe('new')
    expect(p.status).toBe('available')
  })
  it('defaults array columns to empty arrays', () => {
    const p = mapProduct(base)
    expect(p.imageUrls).toEqual([])
    expect(p.priceTiers).toEqual([])
  })
})

describe('inStock rule', () => {
  it('is false when status is available but all stock is zero', () => {
    expect(mapProduct({ ...base, status: 'available' }).inStock).toBe(false)
  })
  it('is true on main stock alone', () => {
    expect(mapProduct({ ...base, stock_qty: 2 }).inStock).toBe(true)
  })
  it('is true on colour stock alone (stock_qty 0)', () => {
    expect(mapProduct({
      ...base, color_variations: [{ variationId: 'c', colorValue: 'Red', stockQuantity: 5 }],
    }).inStock).toBe(true)
  })
  it('is FALSE for coming_soon even with stock — that is incoming quantity', () => {
    expect(mapProduct({ ...base, status: 'coming_soon', stock_qty: 50 }).inStock).toBe(false)
  })
  it('is FALSE for on_the_way even with stock', () => {
    expect(mapProduct({ ...base, status: 'on_the_way', stock_qty: 50 }).inStock).toBe(false)
  })
  it('treats a null status as available', () => {
    expect(mapProduct({ ...base, status: null, stock_qty: 1 }).inStock).toBe(true)
  })
})

describe('LIST_COLUMNS', () => {
  it('includes variations and colour variations', () => {
    // Omitting these made colour-only products render "Out of Stock" on cards
    // while the detail page happily sold them.
    expect(LIST_COLUMNS).toContain('variations')
    expect(LIST_COLUMNS).toContain('color_variations')
  })
  it('includes barcode for scanner search', () => {
    expect(LIST_COLUMNS).toContain('barcode')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./product-mapper`.

- [ ] **Step 3: Implement**

```ts
import type { Product, ProductStatus, ProductCondition } from './types'

// Verbatim from the app's productService.ts LIST_COLUMNS.
// Do NOT trim `variations` / `color_variations`: a product stocked only through
// colour rows has stock_qty 0, so without them every card renders "Out of Stock"
// for a product the detail page sells. `barcode` is needed for scanner search.
export const LIST_COLUMNS =
  'id,name,name_ar,name_ku,part_number,barcode,category,category_ar,category_ku,' +
  'price_usd,vip_price_usd,compare_at_price_usd,storage_options,stock_qty,status,' +
  'is_featured,is_active,brand,image_urls,price_tiers,variations,color_variations,' +
  'shipping_cost,shipping_rates,sort_order,tenant_id,created_at,updated_at,condition'

const num = (v: unknown): number | undefined =>
  v === null || v === undefined ? undefined : Number(v)

export function mapProduct(data: Record<string, any>): Product {
  const status: ProductStatus = (data.status || 'available') as ProductStatus
  const variations = data.variations || []
  const colorVariations = data.color_variations || []

  return {
    id: String(data.id),
    name: data.name ?? '', nameAr: data.name_ar ?? '', nameKu: data.name_ku ?? '',
    description: data.description ?? '', descriptionAr: data.description_ar ?? '',
    descriptionKu: data.description_ku ?? '',
    category: data.category ?? '', categoryAr: data.category_ar ?? '',
    categoryKu: data.category_ku ?? '',
    partNumber: data.part_number ?? '', barcode: data.barcode ?? undefined,
    sku: data.sku ?? undefined, brand: data.brand ?? '',
    imageUrls: data.image_urls || [],
    priceUSD: num(data.price_usd) ?? 0,
    compareAtPriceUSD: num(data.compare_at_price_usd),
    vipPriceUSD: num(data.vip_price_usd),
    priceTiers: data.price_tiers || [],
    storageOptions: data.storage_options || [],
    variations, colorVariations,
    shippingCost: num(data.shipping_cost),
    shippingRates: data.shipping_rates || [],
    stockQty: num(data.stock_qty) ?? 0,
    status,
    condition: (data.condition || 'new') as ProductCondition,
    warranty: data.warranty ?? undefined,
    dimensions: data.dimensions || undefined,
    specifications: data.specifications || {},
    isFeatured: !!data.is_featured,
    isActive: !!data.is_active,
    sortOrder: num(data.sort_order),
    tenantId: data.tenant_id ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    // Verbatim from the app. 'coming_soon' / 'on_the_way' hold INCOMING quantity
    // in stock_qty and are not purchasable.
    inStock: (data.status == null || data.status === 'available')
      && ((num(data.stock_qty) ?? 0) > 0
        || variations.some((v: any) => (v?.stockQuantity || 0) > 0)
        || colorVariations.some((v: any) => (v?.stockQuantity || 0) > 0)),
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test`
Expected: PASS, all mapper tests green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: product mapper with the app's exact in-stock rule"
```

---

## Task 6: Supabase clients

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `createBrowserSupabase()`, `createServerSupabase()`.

- [ ] **Step 1: Install**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Browser client**

Create `src/lib/supabase/browser.ts`:

```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'

// Config deliberately DIFFERS from the mobile app:
//  - detectSessionInUrl: TRUE. The app sets false only because React Native has
//    no URL bar; the web needs it to complete the OAuth redirect.
//  - no `lock: processLock`. That is the RN substitute for navigator.locks,
//    which browsers provide natively.
// flowType 'pkce' matches the app — same Supabase project.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } },
  )
}
```

- [ ] **Step 3: Server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* called from a Server Component; middleware refreshes the session */ }
        },
      },
    },
  )
}
```

- [ ] **Step 4: Allow-list the image host**

In `next.config.ts`. The bucket is `media` and URLs are
`https://<project-ref>.supabase.co/storage/v1/object/public/media/<path>`:

```ts
import type { NextConfig } from 'next'

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : ''

const nextConfig: NextConfig = {
  images: {
    // Catalogue photos are unresized iPhone JPEGs (the app's processImage
    // early-returns on iOS). next/image is what keeps a product page from
    // shipping tens of megabytes over mobile data.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/media/**' }]
      : [],
  },
}
export default nextConfig
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: build succeeds. (It will warn about missing env vars if `.env.local` is absent — create it from `.env.local.example` with the real values first.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Supabase browser and server clients, image host allow-list"
```

---

## Task 7: i18n and RTL shell

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/middleware.ts`, `messages/en.json`, `messages/ar.json`, `messages/ku.json`, `src/app/[locale]/layout.tsx`
- Delete: `src/app/page.tsx` (replaced by the locale route)

**Interfaces:**
- Produces: routes under `/[locale]`, `dir` set correctly, `useTranslations()` available.

- [ ] **Step 1: Install**

```bash
npm install next-intl
```

- [ ] **Step 2: Write the failing test**

Create `src/i18n/routing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { locales, defaultLocale, dirFor } from './routing'

describe('locales', () => {
  it('supports exactly en, ar and ku', () => {
    expect(locales).toEqual(['en', 'ar', 'ku'])
  })
  it('defaults to English', () => {
    expect(defaultLocale).toBe('en')
  })
  it('marks Arabic and Kurdish RTL', () => {
    expect(dirFor('en')).toBe('ltr')
    expect(dirFor('ar')).toBe('rtl')
    expect(dirFor('ku')).toBe('rtl')
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./routing`.

- [ ] **Step 4: Implement routing**

Create `src/i18n/routing.ts`:

```ts
import { defineRouting } from 'next-intl/routing'
import type { Locale } from '@/domain/types'

// Locale is defined once, in the pure domain layer, and re-exported here so
// route files can import it from either place without two competing types.
export type { Locale }

export const locales = ['en', 'ar', 'ku'] as const satisfies readonly Locale[]
export const defaultLocale: Locale = 'en'

// Kurdish here is Sorani, written in Arabic script — RTL like Arabic.
export const dirFor = (locale: string): 'ltr' | 'rtl' =>
  locale === 'ar' || locale === 'ku' ? 'rtl' : 'ltr'

export const routing = defineRouting({ locales, defaultLocale })
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Wire next-intl**

Create `src/i18n/request.ts`:

```ts
import { getRequestConfig } from 'next-intl/server'
import { routing, defaultLocale, type Locale } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = (routing.locales as readonly string[]).includes(requested ?? '')
    ? (requested as Locale) : defaultLocale
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default }
})
```

Create `src/middleware.ts`:

```ts
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)
export const config = { matcher: ['/', '/(en|ar|ku)/:path*'] }
```

- [ ] **Step 7: Seed the message files**

`messages/en.json`:

```json
{
  "nav": { "home": "Home", "search": "Search", "cart": "Cart", "account": "Account" },
  "product": { "outOfStock": "Out of stock", "comingSoon": "Coming soon", "onTheWay": "On the way", "lowStock": "Only {count} left", "used": "Used", "refurbished": "Refurbished", "save": "Save {percent}%" },
  "home": { "featured": "Featured", "categories": "Categories", "brands": "Brands" }
}
```

`messages/ar.json`:

```json
{
  "nav": { "home": "الرئيسية", "search": "بحث", "cart": "السلة", "account": "حسابي" },
  "product": { "outOfStock": "غير متوفر", "comingSoon": "قريباً", "onTheWay": "في الطريق", "lowStock": "بقي {count} فقط", "used": "مستعمل", "refurbished": "مجدد", "save": "وفر {percent}%" },
  "home": { "featured": "مميزة", "categories": "الفئات", "brands": "العلامات التجارية" }
}
```

`messages/ku.json`:

```json
{
  "nav": { "home": "سەرەکی", "search": "گەڕان", "cart": "سەبەتە", "account": "هەژمار" },
  "product": { "outOfStock": "بەردەست نییە", "comingSoon": "بەم زووانە", "onTheWay": "لە ڕێگادایە", "lowStock": "تەنها {count} ماوە", "used": "بەکارهاتوو", "refurbished": "نوێکراوە", "save": "{percent}% پاشەکەوت" },
  "home": { "featured": "تایبەت", "categories": "پۆلەکان", "brands": "براندەکان" }
}
```

> These three files must always carry the SAME key set. The mobile app has 18 Arabic and 19 Kurdish keys holding English text; do not repeat that here. Task 11 adds a test that enforces parity.

- [ ] **Step 8: Locale layout with dir**

Create `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales, dirFor, type Locale } from '@/i18n/routing'
import '../globals.css'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> },
) {
  const { locale } = await params
  if (!(locales as readonly string[]).includes(locale)) notFound()
  setRequestLocale(locale as Locale)
  const messages = await getMessages()

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="bg-canvas text-[#2B2B2B] antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
```

Delete `src/app/page.tsx` and `src/app/layout.tsx` (the locale layout replaces the root one).

- [ ] **Step 9: Verify RTL renders**

Create a temporary `src/app/[locale]/page.tsx` that renders `<h1>{t('home.featured')}</h1>`.

Run: `npm run dev`
Expected: `/en` shows "Featured" LTR; `/ar` shows "مميزة" and the document element carries `dir="rtl"` (check in dev tools).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: trilingual routing with RTL for Arabic and Kurdish"
```

---

## Task 8: Catalogue data layer

**Files:**
- Create: `src/data/products.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`, `mapProduct`, `LIST_COLUMNS`.
- Produces: `listProducts({ page, limit, category, brand, search, tenantId })`, `getProduct(id)`.

- [ ] **Step 1: Implement the queries**

```ts
import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'
import { mapProduct, LIST_COLUMNS } from '@/domain/product-mapper'
import type { Product } from '@/domain/types'

export interface ListParams {
  page?: number; limit?: number
  category?: string; brand?: string; search?: string
  tenantId?: string   // omit for all shops; set for one shop
}

// LIVE-DATA NOTE (diagnostic, 2026-08-09): there is exactly ONE tenant and 14
// products, all active. So the home page is THE storefront, not a multi-vendor
// listing, and pagination is inert at this size — `limit` defaults high enough
// to return everything in one query. The parameters stay because the shape is
// right and costs nothing; do not build pagination UI for 14 rows.

export interface ListResult { products: Product[]; total: number; hasMore: boolean }

export async function listProducts(params: ListParams = {}): Promise<ListResult> {
  const { page = 1, limit = 24, category, brand, search, tenantId } = params
  const supabase = await createServerSupabase()

  let query = supabase
    .from('parts')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('is_active', true)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (category) query = query.eq('category', category)
  if (brand) query = query.eq('brand', brand)
  if (search) {
    const safe = search.replace(/[%,()]/g, ' ').trim()
    if (safe) query = query.or(`name.ilike.%${safe}%,name_ar.ilike.%${safe}%,name_ku.ilike.%${safe}%,part_number.ilike.%${safe}%,barcode.eq.${safe}`)
  }

  const from = (page - 1) * limit
  // Admin drag-order first, matching the app's customer listings.
  const { data, error, count } = await query
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) throw new Error(`listProducts failed: ${error.message}`)

  const products = (data ?? []).map((row) => mapProduct(row as Record<string, unknown>))
  const total = count ?? products.length
  return { products, total, hasMore: from + products.length < total }
}

export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('parts').select('*').eq('id', id).eq('is_active', true).maybeSingle()

  if (error) throw new Error(`getProduct failed: ${error.message}`)
  return data ? mapProduct(data as Record<string, unknown>) : null
}
```

- [ ] **Step 2: Unit-test the query builder against a fake Supabase client**

Credentials are not available, so correctness is proven with a fake rather than a live
call. Extract the query construction so it can be tested: `listProducts` takes an optional
client factory defaulting to `createServerSupabase`.

Create `src/data/products.test.ts` with a chainable fake that records what was asked for:

```ts
import { describe, it, expect } from 'vitest'
import { listProducts } from './products'

function fakeClient(rows: unknown[] = [], count = 0) {
  const calls: Record<string, unknown[]> = { eq: [], or: [], order: [], range: [], select: [] }
  const q: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => { calls[name]?.push(args); return q }
  Object.assign(q, {
    select: chain('select'), eq: chain('eq'), or: chain('or'),
    order: chain('order'), range: chain('range'),
    then: (res: (v: unknown) => void) => res({ data: rows, error: null, count }),
  })
  return { client: { from: () => q }, calls }
}

describe('listProducts', () => {
  it('only ever returns active products', async () => {
    const { client, calls } = fakeClient()
    await listProducts({}, () => client as never)
    expect(calls.eq).toContainEqual(['is_active', true])
  })
  it('does NOT filter by tenant when none is given', async () => {
    const { client, calls } = fakeClient()
    await listProducts({}, () => client as never)
    expect(calls.eq.some((a) => (a as string[])[0] === 'tenant_id')).toBe(false)
  })
  it('orders by the admin drag order first', async () => {
    const { client, calls } = fakeClient()
    await listProducts({}, () => client as never)
    expect(calls.order[0]).toEqual(['sort_order', { ascending: true, nullsFirst: false }])
  })
  it('maps rows through mapProduct, so status gates stock', async () => {
    const { client } = fakeClient([{ id: '1', name: 'X', price_usd: '9.5', stock_qty: 5, status: 'coming_soon' }], 1)
    const { products } = await listProducts({}, () => client as never)
    expect(products[0]!.priceUSD).toBe(9.5)
    expect(products[0]!.inStock).toBe(false)
  })
  it('strips characters that would break a PostgREST or() filter', async () => {
    const { client, calls } = fakeClient()
    await listProducts({ search: 'a,b(c)%d' }, () => client as never)
    expect(String(calls.or[0])).not.toMatch(/[(),%]/)
  })
})
```

Run: `npm test`
Expected: PASS. These assert the query the website sends, which is what a live smoke test
would have checked — without needing a key.

- [ ] **Step 2b: Live smoke test — DEFERRED until `.env.local` exists**

When the publishable key is supplied, run a throwaway script calling `listProducts({ limit: 3 })`
and confirm three real products come back with sane prices.

**If it returns zero rows**, RLS is blocking anonymous reads of `parts`. Note that
`parts_read` is `USING (is_active OR tenant_id = auth.uid())`, so inactive products are
invisible to anonymous visitors by design — all 14 live products are active, so a zero
result would mean something else is wrong.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: catalogue queries against the shared Supabase project"
```

---

## Task 9: Price, stock and condition components

**Files:**
- Create: `src/components/Price.tsx`, `src/components/StockBadge.tsx`

**Interfaces:**
- Consumes: `getDisplayUnitPrice`, `hasCompareAtDiscount`, `getDiscountPercent`, `getEffectiveStock`, `LOW_STOCK_THRESHOLD`.
- Produces: `<Price product isVip />`, `<StockBadge product />`.

- [ ] **Step 1: Implement Price**

```tsx
import { getDisplayUnitPrice, hasCompareAtDiscount, getDiscountPercent } from '@/domain/pricing'
import type { Product } from '@/domain/types'

// Numbers always render LTR, even in an RTL document — matching the app's
// AppNumber component. `dir="ltr"` on the number span is what enforces it.
export function Price({ product, isVip = false }: { product: Product; isVip?: boolean }) {
  const price = getDisplayUnitPrice(product, isVip)
  const discounted = hasCompareAtDiscount(product, isVip)
  const percent = getDiscountPercent(product, isVip)

  return (
    <div className="flex items-baseline gap-sm">
      <span dir="ltr" className="text-[20px] font-semibold tabular-nums">${price.toFixed(2)}</span>
      {discounted && (
        <>
          <span dir="ltr" className="text-[14px] line-through opacity-60 tabular-nums">
            ${product.compareAtPriceUSD!.toFixed(2)}
          </span>
          <span dir="ltr" className="rounded-pill bg-brand px-sm py-[2px] text-[12px] font-bold text-white tabular-nums">
            -{percent}%
          </span>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement StockBadge**

```tsx
import { useTranslations } from 'next-intl'
import { getEffectiveStock, LOW_STOCK_THRESHOLD } from '@/domain/pricing'
import type { Product } from '@/domain/types'

// Fixed slate rather than a theme colour, so the Used badge keeps its contrast
// under every theme — the same decision the app made.
const USED_SLATE = '#4B5563'

export function StockBadge({ product }: { product: Product }) {
  const t = useTranslations('product')

  if (product.status === 'coming_soon') return <Badge>{t('comingSoon')}</Badge>
  if (product.status === 'on_the_way') return <Badge>{t('onTheWay')}</Badge>
  if (!product.inStock) return <Badge>{t('outOfStock')}</Badge>

  const stock = getEffectiveStock(product)
  if (stock > 0 && stock <= LOW_STOCK_THRESHOLD) {
    return <Badge>{t('lowStock', { count: stock })}</Badge>
  }
  if (product.condition === 'used') {
    return <Badge style={{ backgroundColor: USED_SLATE, color: '#fff' }}>{t('used')}</Badge>
  }
  return null
}

function Badge({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={style} className="rounded-pill bg-black/70 px-sm py-[2px] text-[12px] font-medium text-white">
      {children}
    </span>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: price and stock badge components"
```

---

## Task 10: Product card and home page

**Files:**
- Create: `src/components/ProductCard.tsx`
- Modify: `src/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `Price`, `StockBadge`, `localized`, `listProducts`.

- [ ] **Step 1: Implement the card**

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { localized } from '@/domain/i18n-field'
import { Price } from './Price'
import { StockBadge } from './StockBadge'
import type { Product, Locale } from '@/domain/types'

export function ProductCard({ product, locale }: { product: Product; locale: Locale }) {
  const name = localized(product as unknown as Record<string, unknown>, 'name', locale)
  const image = product.imageUrls[0]

  return (
    <Link
      href={`/${locale}/p/${product.id}`}
      className="group block overflow-hidden rounded-card bg-surface shadow-sm transition-shadow duration-300 hover:shadow-md"
    >
      <div className="relative aspect-square bg-canvas">
        {image && (
          <Image
            src={image} alt={name} fill sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute start-sm top-sm"><StockBadge product={product} /></div>
      </div>
      <div className="space-y-sm p-md">
        <h3 className="line-clamp-2 text-[16px] leading-[24px]">{name}</h3>
        <Price product={product} />
      </div>
    </Link>
  )
}
```

> `start-sm` (not `left-sm`) is deliberate — logical properties flip automatically in RTL.

- [ ] **Step 2: Implement the home page**

```tsx
import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { listProducts } from '@/data/products'
import { ProductCard } from '@/components/ProductCard'
import type { Locale } from '@/i18n/routing'

export const revalidate = 300

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale as Locale)
  const t = await getTranslations('home')
  const { products } = await listProducts({ limit: 24 })

  return (
    <main className="mx-auto max-w-[1200px] p-md">
      <h1 className="mb-lg text-[32px] font-bold leading-[40px]">{t('featured')}</h1>
      <div className="grid grid-cols-2 gap-md tablet:grid-cols-3 desktop:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} locale={locale as Locale} />)}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify in all three locales**

Run: `npm run dev`
Expected: `/en`, `/ar` and `/ku` each render the real catalogue. On `/ar` the grid flows right-to-left, badges sit top-right, and prices still read `$12.00` left-to-right.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: product card and home catalogue grid"
```

---

## Task 11: Locale key parity test

**Files:**
- Create: `src/i18n/messages.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import ku from '../../messages/ku.json'

const flatten = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`])

const flatValues = (o: Record<string, unknown>, p = ''): Array<[string, string]> =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatValues(v as Record<string, unknown>, `${p}${k}.`)
      : [[`${p}${k}`, String(v)] as [string, string]])

describe('locale files', () => {
  it('ar has every key en has', () => {
    expect(flatten(ar as never).sort()).toEqual(flatten(en as never).sort())
  })
  it('ku has every key en has', () => {
    expect(flatten(ku as never).sort()).toEqual(flatten(en as never).sort())
  })
  // The mobile app ships 18 Arabic and 19 Kurdish values that are byte-identical
  // to English, which renders English text to those users. Fail loudly here.
  it('no Arabic value is byte-identical to English', () => {
    const enMap = new Map(flatValues(en as never))
    const copied = flatValues(ar as never).filter(([k, v]) => enMap.get(k) === v)
    expect(copied).toEqual([])
  })
  it('no Kurdish value is byte-identical to English', () => {
    const enMap = new Map(flatValues(en as never))
    const copied = flatValues(ku as never).filter(([k, v]) => enMap.get(k) === v)
    expect(copied).toEqual([])
  })
})
```

- [ ] **Step 2: Run it**

Run: `npm test`
Expected: PASS. If it fails, fix the message files — do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: enforce locale key and value parity"
```

---

## Task 12: Product detail page

**Files:**
- Create: `src/app/[locale]/p/[id]/page.tsx`, `src/app/[locale]/p/[id]/not-found.tsx`

- [ ] **Step 1: Implement**

```tsx
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getProduct } from '@/data/products'
import { localized } from '@/domain/i18n-field'
import { Price } from '@/components/Price'
import { StockBadge } from '@/components/StockBadge'
import type { Locale } from '@/i18n/routing'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  const product = await getProduct(id)
  if (!product) return { title: 'Asankary' }
  const name = localized(product as unknown as Record<string, unknown>, 'name', locale as Locale)
  return { title: `${name} — Asankary`, openGraph: { images: product.imageUrls.slice(0, 1) } }
}

export default async function ProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale as Locale)
  const product = await getProduct(id)
  if (!product) notFound()

  const row = product as unknown as Record<string, unknown>
  const name = localized(row, 'name', locale as Locale)
  const description = localized(row, 'description', locale as Locale)

  return (
    <main className="mx-auto grid max-w-[1200px] gap-lg p-md desktop:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-card bg-canvas">
        {product.imageUrls[0] && (
          <Image src={product.imageUrls[0]} alt={name} fill sizes="(max-width: 1024px) 100vw, 50vw"
                 className="object-cover" priority />
        )}
      </div>
      <div className="space-y-md">
        <h1 className="text-[32px] font-bold leading-[40px]">{name}</h1>
        <StockBadge product={product} />
        <Price product={product} />
        {description && <p className="text-[16px] leading-[24px] opacity-80">{description}</p>}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Add not-found**

```tsx
export default function NotFound() {
  return <main className="p-lg"><p>Product not found.</p></main>
}
```

- [ ] **Step 3: Verify**

Run: `npm run dev`, click a product from the home grid in each locale.
Expected: detail page renders, title tag carries the product name, `/ar` is RTL, price is LTR.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: product detail page with SEO metadata"
```

---

## Blocked tasks — do not attempt until the diagnostic has been run

These depend on facts only the live database can supply. `WEB_READINESS_DIAGNOSTIC.sql`
(in the mobile repo root) answers them. **Guessing here produces silent data bugs, so
each task stays blocked until its input exists.**

### Blocked A: RLS hardening migration

**Blocked on:** diagnostic sections 1 and 2 — which policies are actually live.
**Then:** convert `RLS_HARDENING.sql` into a tracked migration and close S1–S9 from
spec §5, notably the `media` bucket write policies (currently no auth condition at
all) and `orders_update` (`USING` with no `WITH CHECK`).
**Gate:** no public deployment before this lands.

### Blocked B: Generated database types

**Blocked on:** access to the live project ref.
**Then:** `supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`
and reconcile against `src/domain/types.ts`. Any drift from spec §4.2 is a bug in
the spec and must be corrected there.

### Blocked C: Realtime subscriptions

**Blocked on:** diagnostic section 5 — which tables are in the `supabase_realtime`
publication. A table absent from it emits no events.
**Then:** subscribe to `parts` for live price and stock on open product pages.

### Blocked D: Address storage

**Blocked on:** diagnostic section 3 — whether addresses live in `users.addresses`
(jsonb) or `public.addresses` (table).
**Then:** build the checkout address flow against whichever holds rows.

---

## Out of scope for this plan

Cart, checkout, authentication, orders and account pages are spec phase 3 and get
their own plan once this foundation is reviewed. Search, category and brand listing
pages reuse `listProducts` and are a short follow-up plan.
