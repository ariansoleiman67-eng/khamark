# Asankary Web — Navigation, Search & Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working catalogue grid into a navigable storefront — a header with a language switcher, working search, and brand/category filtering — so a customer can find a product rather than only scroll past it.

**Architecture:** Continues the foundation plan. Server components query through the existing `listProducts`; the header and language switcher are client components. No new data-access code: `listProducts` already accepts `search`, `category` and `brand`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 CSS-first, next-intl, Vitest + Testing Library.

**Predecessor:** `docs/superpowers/plans/2026-08-09-asankary-web-foundation.md` (complete — 30 commits, 131 tests, final review APPROVED)

**Spec:** `docs/superpowers/specs/2026-08-09-asankary-web-design.md` §8 (routes)

## Global Constraints

- Project root is `/Users/maci/Desktop/Asankary - Web`. The path contains a space — quote it in every shell command.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
- Locales are exactly `en`, `ar`, `ku`. `ar` and `ku` render `dir="rtl"`; the html `lang` for `ku` is **`ckb`** (Sorani), via `htmlLangFor()`.
- Every displayed product string goes through `localized(row, base, locale)`. Never read `product.name` directly for display.
- Numbers render LTR — wrap numerals in `dir="ltr"`.
- Use logical CSS properties (`start-*`/`end-*`, `ms-`/`me-`), never `left-*`/`right-*`.
- Use design tokens: `text-h1`…`text-caption`, `p-md`, `gap-md`, `rounded-card`, `rounded-pill`, `bg-brand`, `bg-canvas`, `bg-surface`.
- Navigation uses next-intl's typed `Link` from `src/i18n/navigation.ts`. Never hand-build `/${locale}/…`.
- Every new message key needs genuine `ar` and `ku` translations — a test fails on any value byte-identical to English, and on any `{placeholder}` or `<tag>` mismatch.
- Data-fetch failures render the existing translated `ErrorState`; they must not crash the build.
- No new dependency without recording why in the task report.
- Commit after every task.

## Live data this plan is built against (verified 2026-08-09)

- 14 active products, ONE tenant, **0 banners** — do not build a banner carousel.
- 10 categories exist but only **2** are used by products; 9 brands exist, **7** used.
  Navigation must therefore show only taxonomy that has products behind it — a nav full of
  empty categories looks broken.
- 11 of 14 products carry Arabic and Kurdish names; the other 3 fall back to English by design.

---

## File Structure

```
src/
├── i18n/
│   └── navigation.ts          # next-intl createNavigation — typed Link/redirect/usePathname
├── data/
│   └── taxonomy.ts            # distinct categories & brands THAT HAVE PRODUCTS
├── components/
│   ├── SiteHeader.tsx         # server: logo + nav + search box + language switcher
│   ├── LanguageSwitcher.tsx   # client: swaps locale, preserves the current path
│   ├── SearchBox.tsx          # client: submits to /[locale]/search
│   └── FilterChips.tsx        # server: brand/category chips, current one marked
└── app/[locale]/
    ├── layout.tsx             # + SiteHeader
    ├── search/page.tsx        # ?q= results
    ├── c/[category]/page.tsx  # category listing
    └── b/[brand]/page.tsx     # brand listing
```

**Boundaries.** `data/taxonomy.ts` is the only new query surface. The header is a server
component so it can read taxonomy without shipping it to the client; only the language
switcher and search input are client components, because they need interactivity.

---

## Task 1: Typed navigation

**Files:**
- Modify: `src/components/ErrorState.tsx`

> **Already done — verified 2026-08-09.** `src/i18n/navigation.ts` EXISTS (created by the
> foundation plan's final fix wave) and `ProductCard.tsx:2` already imports `Link` from it.
> Do NOT recreate the module. Step 1 below is recorded for context only; the real work in
> this task is Step 2 (ErrorState) and Step 3 (the verification grep).

**Interfaces:**
- Produces: `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` from `createNavigation(routing)`.

- [x] **Step 1: Create the typed navigation module — ALREADY EXISTS, do not recreate**

```ts
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// Locale prefixing is handled here, once. Components must import Link from this
// module rather than 'next/link' — a hand-built `/${locale}/...` href is how a
// locale prefix silently goes missing as routes multiply.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
```

- [ ] **Step 2: Route every existing link through it**

`ProductCard.tsx` already uses the typed `Link`. `ErrorState.tsx` still hand-builds its
`retryHref` — change it to take a plain path (e.g. `/`) and use the typed `Link`, which
adds the locale itself.

- [ ] **Step 3: Verify no hand-built locale prefixes remain**

Run: `grep -rn '`/\${locale}' src/ || echo clean`
Expected: `clean`.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: route all links through next-intl typed navigation"
```

---

## Task 2: Taxonomy query

**Files:**
- Create: `src/data/taxonomy.ts`, `src/data/taxonomy.test.ts`

**Interfaces:**
- Consumes: the public Supabase client used by `src/data/products.ts`.
- Produces: `listUsedCategories(clientFactory?): Promise<TaxonomyEntry[]>` and
  `listUsedBrands(clientFactory?): Promise<TaxonomyEntry[]>`, where
  `TaxonomyEntry = { value: string; count: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { listUsedBrands, listUsedCategories } from './taxonomy'

function fakeClient(rows: Array<Record<string, unknown>>) {
  const q: Record<string, unknown> = {}
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
  })
  return { from: () => q }
}

describe('taxonomy', () => {
  const rows = [
    { category: 'Phones', brand: 'Honor' },
    { category: 'Phones', brand: 'Tecno' },
    { category: 'Audio',  brand: 'Honor' },
    { category: null,     brand: '' },
  ]

  it('returns only values that actually have products', async () => {
    const brands = await listUsedBrands(() => fakeClient(rows) as never)
    expect(brands.map((b) => b.value).sort()).toEqual(['Honor', 'Tecno'])
  })
  it('counts products per value', async () => {
    const brands = await listUsedBrands(() => fakeClient(rows) as never)
    expect(brands.find((b) => b.value === 'Honor')!.count).toBe(2)
  })
  it('drops null and empty values rather than rendering a blank chip', async () => {
    const cats = await listUsedCategories(() => fakeClient(rows) as never)
    expect(cats.map((c) => c.value)).not.toContain('')
    expect(cats.map((c) => c.value)).not.toContain(null)
  })
  it('sorts by count descending so the busiest appears first', async () => {
    const cats = await listUsedCategories(() => fakeClient(rows) as never)
    expect(cats[0]!.value).toBe('Phones')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./taxonomy`.

- [ ] **Step 3: Implement**

```ts
import 'server-only'
import { createPublicSupabase } from '@/lib/supabase/public'

export interface TaxonomyEntry { value: string; count: number }

type ClientFactory = () => ReturnType<typeof createPublicSupabase>

// Only taxonomy that HAS products. The live database has 10 categories but
// products in just 2 of them — rendering all 10 would show a customer eight
// dead ends. Derived from parts rather than read from the categories table for
// exactly that reason.
async function usedValues(
  column: 'category' | 'brand',
  clientFactory: ClientFactory,
): Promise<TaxonomyEntry[]> {
  const supabase = clientFactory()
  const { data, error } = await supabase.from('parts').select(column).eq('is_active', true)
  if (error) throw new Error(`list used ${column}s failed: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const raw = (row as Record<string, unknown>)[column]
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export const listUsedCategories = (clientFactory: ClientFactory = createPublicSupabase) =>
  usedValues('category', clientFactory)

export const listUsedBrands = (clientFactory: ClientFactory = createPublicSupabase) =>
  usedValues('brand', clientFactory)
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: taxonomy query returning only categories and brands with products"
```

---

## Task 3: Language switcher

**Files:**
- Create: `src/components/LanguageSwitcher.tsx`, `src/components/LanguageSwitcher.test.tsx`
- Modify: `messages/{en,ar,ku}.json`

**Interfaces:**
- Consumes: `usePathname`, `useRouter` from `src/i18n/navigation.ts`.
- Produces: `<LanguageSwitcher />`, a client component.

- [ ] **Step 1: Add the message keys**

Add to each file under a new `language` namespace. Real translations, and the language
names in their OWN script — a customer looking for Kurdish is looking for "کوردی", not
"Kurdish".

`en.json`: `{ "language": { "label": "Language", "en": "English", "ar": "العربية", "ku": "کوردی" } }`

`ar.json`: `{ "language": { "label": "اللغة", "en": "English", "ar": "العربية", "ku": "کوردی" } }`

`ku.json`: `{ "language": { "label": "زمان", "en": "English", "ar": "العربية", "ku": "کوردی" } }`

> The three language NAMES are deliberately identical across files — an endonym does not
> translate. Add these three keys to the parity test's `ALLOWED_IDENTICAL_TO_ENGLISH`
> allowlist (it exists and is currently empty), with a comment explaining why.

- [ ] **Step 2: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { LanguageSwitcher } from './LanguageSwitcher'
import messages from '../../messages/en.json'

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/p/abc',
  useRouter: () => ({ replace: vi.fn() }),
}))

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  )

describe('LanguageSwitcher', () => {
  it('offers all three locales', () => {
    renderIt()
    expect(screen.getByRole('option', { name: 'English' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'العربية' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'کوردی' })).toBeDefined()
  })
  it('marks the active locale as selected', () => {
    renderIt()
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'en')
  })
  it('has an accessible label', () => {
    renderIt()
    expect(screen.getByLabelText('Language')).toBeDefined()
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./LanguageSwitcher`.

- [ ] **Step 4: Implement**

```tsx
'use client'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { locales, type Locale } from '@/i18n/routing'

export function LanguageSwitcher() {
  const t = useTranslations('language')
  const locale = useLocale()
  const pathname = usePathname()   // path WITHOUT the locale prefix
  const router = useRouter()

  return (
    <label className="flex items-center gap-sm">
      <span className="sr-only">{t('label')}</span>
      <select
        aria-label={t('label')}
        value={locale}
        onChange={(e) => router.replace(pathname, { locale: e.target.value as Locale })}
        className="rounded-pill bg-surface px-md py-sm text-caption"
      >
        {locales.map((l) => (
          <option key={l} value={l}>{t(l)}</option>
        ))}
      </select>
    </label>
  )
}
```

> `usePathname` from next-intl returns the path WITHOUT the locale, and `router.replace`
> re-adds the target one — which is why switching language on a product page stays on that
> product instead of bouncing to the home page.

- [ ] **Step 5: Run it and watch it pass**

Run: `npm test`
Expected: PASS, 3 new tests.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: language switcher that preserves the current page"
```

---

## Task 4: Site header

**Files:**
- Create: `src/components/SiteHeader.tsx`, `src/components/SearchBox.tsx`
- Modify: `src/app/[locale]/layout.tsx`, `messages/{en,ar,ku}.json`

**Interfaces:**
- Consumes: `listUsedBrands`, `LanguageSwitcher`, typed `Link`.
- Produces: `<SiteHeader />`, rendered by the locale layout above `{children}`.

- [ ] **Step 1: Add message keys**

`nav.home`, `nav.search`, `nav.searchPlaceholder`, `nav.brands`, `app.name` — genuine
`ar`/`ku` translations for each except `app.name` ("Asankary" is a brand name; add it to the
allowlist with a comment).

- [ ] **Step 2: Implement the search box (client)**

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useState } from 'react'

export function SearchBox() {
  const t = useTranslations('nav')
  const router = useRouter()
  const [q, setQ] = useState('')

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`) }}
      className="flex flex-1 items-center gap-sm"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('search')}
        className="w-full rounded-pill bg-canvas px-md py-sm text-body"
      />
    </form>
  )
}
```

- [ ] **Step 3: Implement the header (server)**

Renders: the wordmark linking home, the SearchBox, the LanguageSwitcher, and a row of brand
chips from `listUsedBrands()`. Wrap the taxonomy call in try/catch and render the header
WITHOUT chips on failure — a database hiccup must not remove the customer's ability to
search or change language.

- [ ] **Step 4: Mount it in the locale layout**

Above `{children}` in `src/app/[locale]/layout.tsx`.

- [ ] **Step 5: Verify**

Run: `npm run dev`, then load `/en`, `/ar`, `/ku`.
Expected: header on all three; on `/ar` and `/ku` it mirrors (wordmark on the right); the
language switcher moves between locales while staying on the same page; brand chips show
only the 7 brands that have products.

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: site header with search, brand chips and language switcher"
```

---

## Task 5: Search, category and brand pages

**Files:**
- Create: `src/app/[locale]/search/page.tsx`, `src/app/[locale]/c/[category]/page.tsx`, `src/app/[locale]/b/[brand]/page.tsx`, `src/components/ProductGrid.tsx`
- Modify: `src/app/[locale]/page.tsx` (reuse the grid), `messages/{en,ar,ku}.json`

**Interfaces:**
- Consumes: `listProducts({ search | category | brand })`, `ProductCard`, `ErrorState`.
- Produces: `<ProductGrid products locale />` — the shared grid + empty state.

- [ ] **Step 1: Extract the shared grid**

Pull the grid markup out of the home page into `ProductGrid.tsx` so all four pages render
products identically. It takes `products` and `locale`, and renders the translated
"no products" empty state when the list is empty.

- [ ] **Step 2: Search page**

Reads `searchParams.q`, calls `listProducts({ search: q })`, renders a heading with the
term and the result count (count wrapped in `dir="ltr"`), then the grid. With no `q`,
render a prompt rather than the entire catalogue.

- [ ] **Step 3: Category and brand pages**

Both decode the URL segment, call `listProducts({ category })` / `listProducts({ brand })`,
and render a heading plus the grid. Both call `notFound()` when the segment matches no
known taxonomy value — a typo'd URL must 404, not render an empty shop.

- [ ] **Step 4: Add `generateStaticParams` to the taxonomy routes**

There are 2 categories and 7 brands; enumerate them so these pages are statically rendered
like the home page. Wrap in try/catch returning `[]` so a build without credentials still
succeeds.

- [ ] **Step 5: Verify**

Run: `npm run dev` and check, in all three locales:
- `/en/search?q=honor` returns the Honor phones
- `/en/b/Honor` lists that brand
- `/en/c/<a real category>` lists it
- `/en/b/DoesNotExist` returns 404
- the Arabic and Kurdish equivalents render RTL with translated headings

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; build shows the new routes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: search, category and brand listing pages"
```

---

## Out of scope for this plan

Cart, checkout, authentication, orders, account pages, favourites, chat and trade-in.
Those are spec phase 3 and need their own spec and plan — plus, per the foundation plan's
final review, generated database types and a fix for `orders_update`'s missing `WITH CHECK`
BEFORE any order can be placed from a browser.
