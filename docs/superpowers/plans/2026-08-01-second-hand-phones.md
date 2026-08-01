# Second-hand Phones (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer submit their used phone for a price, let the shop admin review and quote it by hand, and let bought phones be listed as products marked `used`.

**Architecture:** One new tenant-scoped table `trade_in_requests` plus one new column `parts.condition`. All decision logic lives in a pure module (`src/utils/tradeIn.ts`) that is unit-tested with jest; screens stay thin and are verified by type-check and a device pass. Data access goes through a single `tradeInService`, following the existing service pattern (snake_case row → camelCase domain via a `mapRow` helper).

**Tech Stack:** React Native 0.81 / Expo SDK 54, TypeScript strict, Supabase Postgres, i18next (en/ar/ku), jest 29 for pure-logic tests.

## Global Constraints

Every task's requirements implicitly include this section.

- **Tenancy:** `tenant_id` on every row, in every query, in every cache key and React key. RLS enforces it server-side as well — client filtering alone previously let admins read and delete other shops' brands, promos and banners.
- **i18n:** every user-facing string goes through `t('...')` and must exist in **all three** of `src/locales/en.json`, `ar.json`, `ku.json` with real translations, never English copied across.
- **RTL:** use `textAlign` + `I18nManager.isRTL`. `writingDirection` is banned — it breaks Android. Numbers render LTR through the `AppNumber` component.
- **Scrolling:** one vertical scroll owner per screen. Never nest vertical scrollers.
- **Sizing:** prefer `minHeight` and `aspectRatio` over fixed heights. Card radius 12, padding `SPACING.md`.
- **Constants:** prefer `src/constants/config.ts` and `src/constants/theme.ts` over literals.
- **Verification cadence:** verify after each step, not in a sweep at the end. `npx tsc --noEmit` must exit 0 before every commit.
- **`@ts-nocheck` files:** `src/screens/ProductDetailsScreen.tsx` and `src/screens/admin/AdminProductsScreen.tsx` start with `// @ts-nocheck`. `tsc` reports **nothing** in them. After editing either, manually confirm every identifier the new code references is imported at the top of that file. An unimported `I18nManager` shipped a production crash this way.
- **Live card component:** `src/components/MasonryProductCard.tsx` is the only product card with importers. `ProductCard.tsx` and `RelatedProductCard.tsx` are orphaned — do not spend effort on them.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260801120000_trade_in_requests.sql`

**Interfaces:**
- Consumes: nothing
- Produces: table `public.trade_in_requests`; column `public.parts.condition text default 'new'`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- Second-hand phones, phase 1: trade-in requests + product condition
-- =============================================================================

create table if not exists public.trade_in_requests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.users(id) on delete cascade,
  -- Nullable ON PURPOSE, and never null at insert time: every phase-1 request is
  -- created by a signed-in customer. A null here only ever results from that
  -- customer later deleting their account, and the row must survive that — the
  -- shop may already have paid for the phone.
  user_id           uuid references public.users(id) on delete set null,
  -- Snapshots, not joins. The record has to stay usable after account deletion,
  -- and a customer changing their number later must not silently rewrite the
  -- number attached to a deal already agreed.
  contact_name      text not null,
  contact_phone     text not null,
  device_brand      text not null,
  device_model      text not null,
  storage           text,
  questions_version integer not null default 1,
  answers           jsonb not null default '{}'::jsonb,
  photos            text[] not null default '{}',
  customer_note     text,
  status            text not null default 'submitted',
  offer_usd         numeric(10,2),
  offer_note        text,
  offer_type        text default 'cash',
  reviewed_by       uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  quoted_at         timestamptz,
  constraint trade_in_status_valid check (
    status in ('submitted','quoted','accepted','declined','completed','cancelled')
  ),
  constraint trade_in_offer_type_valid check (offer_type in ('cash','credit'))
);

create index if not exists idx_trade_in_tenant_status
  on public.trade_in_requests(tenant_id, status, created_at desc);
create index if not exists idx_trade_in_user
  on public.trade_in_requests(user_id, created_at desc);

alter table public.trade_in_requests enable row level security;

-- Customer: sees and creates only their own.
create policy trade_in_select_own on public.trade_in_requests
  for select using (auth.uid() = user_id);

create policy trade_in_insert_own on public.trade_in_requests
  for insert with check (auth.uid() = user_id);

-- Customer may only move their own request to a terminal answer. They must not be
-- able to edit offer_usd or push it to 'completed'.
create policy trade_in_update_own on public.trade_in_requests
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status in ('accepted','declined','cancelled'));

-- Admin: full access to their own shop's rows only.
--
-- `public.users` has NO tenant_id column. Across this schema tenant_id points at
-- users(id) and the owner admin IS the tenant — see the header comment in
-- 20260101000000_initial_schema.sql, and TenantContext, which derives tenantId
-- straight from the signed-in admin's uid. Comparing tenant_id to auth.uid() is
-- therefore the whole check.
--
-- Co-admins are deliberately not covered: this schema has no tenant-level admin
-- link table. Sharing is per-product via extra_data.coAdminIds, which cannot
-- authorise a trade-in request. Only the shop owner reviews trade-ins.
create policy trade_in_admin_all on public.trade_in_requests
  for all
  using (trade_in_requests.tenant_id = auth.uid())
  with check (trade_in_requests.tenant_id = auth.uid());

create trigger trg_trade_in_updated
  before update on public.trade_in_requests
  for each row execute function public.set_updated_at();

-- Product condition. `Product.condition` already exists in src/types/index.ts but
-- was never persisted, which is why the product page's Condition card always read
-- "Available" and was removed on 2026-07-31.
alter table public.parts
  add column if not exists condition text not null default 'new';

alter table public.parts
  drop constraint if exists parts_condition_valid;
alter table public.parts
  add constraint parts_condition_valid check (condition in ('new','used','refurbished'));
```

- [ ] **Step 2: Verify the SQL parses**

Run the migration in the Supabase SQL editor. Then run:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'trade_in_requests'
 order by ordinal_position;

select condition, count(*) from public.parts group by condition;
```

Expected: 20 columns listed; every existing part reports `condition = 'new'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260801120000_trade_in_requests.sql
git commit -m "feat(db): trade_in_requests table and parts.condition"
```

---

### Task 2: Questionnaire constants and pure logic

**Files:**
- Create: `src/constants/tradeInQuestions.ts`
- Create: `src/utils/tradeIn.ts`
- Test: `__tests__/utils/tradeIn.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `TRADE_IN_QUESTIONS_VERSION: number`
  - `TRADE_IN_QUESTIONS: TradeInQuestion[]` where `TradeInQuestion = { key: string; labelKey: string; type: 'choice' | 'percent'; options?: { value: string; labelKey: string }[] }`
  - `validateAnswers(answers: Record<string, string>): { valid: boolean; missingKeys: string[] }`
  - `isDuplicateSubmission(existing: DuplicateCandidate[], candidate: DuplicateCandidate, nowMs: number): boolean` where `DuplicateCandidate = { deviceModel: string; answers: Record<string, string>; createdAtMs: number }`
  - `buildListingDraft(request: TradeInDraftSource): { name: string; brand: string; storage?: string; imageUrls: string[]; condition: 'used'; stockQty: 1 }` where `TradeInDraftSource = { deviceBrand: string; deviceModel: string; storage?: string; photos: string[] }`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/utils/tradeIn.test.ts
import { TRADE_IN_QUESTIONS } from '../../src/constants/tradeInQuestions';
import { validateAnswers, isDuplicateSubmission, buildListingDraft } from '../../src/utils/tradeIn';

const fullAnswers = () =>
  TRADE_IN_QUESTIONS.reduce<Record<string, string>>((acc, q) => {
    acc[q.key] = q.type === 'percent' ? '85' : q.options![0].value;
    return acc;
  }, {});

describe('validateAnswers', () => {
  it('accepts a fully answered questionnaire', () => {
    expect(validateAnswers(fullAnswers())).toEqual({ valid: true, missingKeys: [] });
  });

  it('reports every unanswered question', () => {
    const answers = fullAnswers();
    delete answers.screen;
    delete answers.body;
    const result = validateAnswers(answers);
    expect(result.valid).toBe(false);
    expect(result.missingKeys.sort()).toEqual(['body', 'screen']);
  });

  it('treats an empty string as unanswered', () => {
    const answers = { ...fullAnswers(), battery_health: '   ' };
    expect(validateAnswers(answers).missingKeys).toContain('battery_health');
  });
});

describe('isDuplicateSubmission', () => {
  const base = { deviceModel: 'iPhone 13 Pro', answers: { screen: 'original' }, createdAtMs: 1_000_000 };

  it('flags an identical request within 60 seconds', () => {
    expect(isDuplicateSubmission([base], { ...base, createdAtMs: 0 }, 1_030_000)).toBe(true);
  });

  // Pinned to the exact boundary. A test at 30s/61s passes for any window between
  // those two, so the constant could drift to 45s without a single test failing.
  it('flags a request 1ms inside the window', () => {
    expect(isDuplicateSubmission([base], base, 1_059_999)).toBe(true);
  });

  it('allows a request exactly on the window boundary', () => {
    expect(isDuplicateSubmission([base], base, 1_060_000)).toBe(false);
  });

  it('allows the same request after 60 seconds', () => {
    expect(isDuplicateSubmission([base], { ...base, createdAtMs: 0 }, 1_061_000)).toBe(false);
  });

  it('matches answers regardless of key order', () => {
    const stored = { ...base, answers: { screen: 'original', body: 'like_new' } };
    const fresh = { ...base, answers: { body: 'like_new', screen: 'original' } };
    expect(isDuplicateSubmission([stored], fresh, 1_010_000)).toBe(true);
  });

  it('allows a different model within the window', () => {
    const other = { ...base, deviceModel: 'Galaxy S22' };
    expect(isDuplicateSubmission([base], other, 1_010_000)).toBe(false);
  });

  it('allows the same model with different answers', () => {
    const other = { ...base, answers: { screen: 'replaced' } };
    expect(isDuplicateSubmission([base], other, 1_010_000)).toBe(false);
  });

  it('is false when there is nothing to compare against', () => {
    expect(isDuplicateSubmission([], base, 1_010_000)).toBe(false);
  });
});

describe('buildListingDraft', () => {
  it('builds a single-unit used listing from the request', () => {
    expect(
      buildListingDraft({
        deviceBrand: 'Apple',
        deviceModel: 'iPhone 13 Pro',
        storage: '256GB',
        photos: ['https://img/1.jpg'],
      })
    ).toEqual({
      name: 'iPhone 13 Pro 256GB — Used',
      brand: 'Apple',
      storage: '256GB',
      imageUrls: ['https://img/1.jpg'],
      condition: 'used',
      stockQty: 1,
    });
  });

  it('omits storage from the name when it is not known', () => {
    const draft = buildListingDraft({ deviceBrand: 'Apple', deviceModel: 'iPhone 12', photos: [] });
    expect(draft.name).toBe('iPhone 12 — Used');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/utils/tradeIn.test.ts`
Expected: FAIL — "Cannot find module '../../src/constants/tradeInQuestions'".

- [ ] **Step 3: Write the questionnaire constants**

```typescript
// src/constants/tradeInQuestions.ts

/**
 * Bump when the question set changes. Every stored request records the version it
 * was answered against, so an old request still renders correctly afterwards.
 */
export const TRADE_IN_QUESTIONS_VERSION = 1;

export interface TradeInQuestionOption {
  value: string;
  labelKey: string;
}

export interface TradeInQuestion {
  key: string;
  labelKey: string;
  type: 'choice' | 'percent';
  options?: TradeInQuestionOption[];
}

export const TRADE_IN_QUESTIONS: TradeInQuestion[] = [
  {
    key: 'powers_on',
    labelKey: 'tradeIn.q.powersOn',
    type: 'choice',
    options: [
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'no', labelKey: 'common.no' },
    ],
  },
  {
    key: 'screen',
    labelKey: 'tradeIn.q.screen',
    type: 'choice',
    options: [
      { value: 'original', labelKey: 'tradeIn.a.original' },
      { value: 'replaced', labelKey: 'tradeIn.a.replaced' },
      { value: 'cracked', labelKey: 'tradeIn.a.cracked' },
    ],
  },
  { key: 'battery_health', labelKey: 'tradeIn.q.batteryHealth', type: 'percent' },
  {
    key: 'charging_port',
    labelKey: 'tradeIn.q.chargingPort',
    type: 'choice',
    options: [
      { value: 'works', labelKey: 'tradeIn.a.works' },
      { value: 'faulty', labelKey: 'tradeIn.a.faulty' },
      { value: 'replaced', labelKey: 'tradeIn.a.replaced' },
    ],
  },
  {
    key: 'cameras',
    labelKey: 'tradeIn.q.cameras',
    type: 'choice',
    options: [
      { value: 'all_work', labelKey: 'tradeIn.a.allWork' },
      { value: 'some_faulty', labelKey: 'tradeIn.a.someFaulty' },
    ],
  },
  {
    key: 'biometrics',
    labelKey: 'tradeIn.q.biometrics',
    type: 'choice',
    options: [
      { value: 'works', labelKey: 'tradeIn.a.works' },
      { value: 'broken', labelKey: 'tradeIn.a.doesNotWork' },
    ],
  },
  {
    key: 'water_damage',
    labelKey: 'tradeIn.q.waterDamage',
    type: 'choice',
    options: [
      { value: 'no', labelKey: 'common.no' },
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'unknown', labelKey: 'tradeIn.a.dontKnow' },
    ],
  },
  {
    // Commercially the most important question: a locked device cannot be resold
    // and is worth nothing to the shop. Asking here saves the customer a trip.
    key: 'account_removed',
    labelKey: 'tradeIn.q.accountRemoved',
    type: 'choice',
    options: [
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'no', labelKey: 'common.no' },
    ],
  },
  {
    key: 'body',
    labelKey: 'tradeIn.q.body',
    type: 'choice',
    options: [
      { value: 'like_new', labelKey: 'tradeIn.a.likeNew' },
      { value: 'light_scratches', labelKey: 'tradeIn.a.lightScratches' },
      { value: 'dents', labelKey: 'tradeIn.a.dents' },
    ],
  },
  {
    key: 'box_charger',
    labelKey: 'tradeIn.q.boxCharger',
    type: 'choice',
    options: [
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'no', labelKey: 'common.no' },
    ],
  },
];
```

- [ ] **Step 4: Write the pure logic**

```typescript
// src/utils/tradeIn.ts
import { TRADE_IN_QUESTIONS } from '../constants/tradeInQuestions';

export interface DuplicateCandidate {
  deviceModel: string;
  answers: Record<string, string>;
  createdAtMs: number;
}

export interface TradeInDraftSource {
  deviceBrand: string;
  deviceModel: string;
  storage?: string;
  photos: string[];
}

/** Every question must carry a non-blank answer before a request can be submitted. */
export const validateAnswers = (
  answers: Record<string, string>
): { valid: boolean; missingKeys: string[] } => {
  const missingKeys = TRADE_IN_QUESTIONS
    .filter((q) => !(answers[q.key] || '').trim())
    .map((q) => q.key);
  return { valid: missingKeys.length === 0, missingKeys };
};

const DUPLICATE_WINDOW_MS = 60_000;

/**
 * Order-independent fingerprint of an answer set.
 *
 * JSON.stringify preserves key insertion order, so the same answers can produce
 * two different strings — `{a,b}` vs `{b,a}`. The "existing" side of a comparison
 * comes back from a jsonb column, which gives no ordering guarantee, while the
 * candidate is built fresh in question order. Comparing the raw JSON would let a
 * real duplicate through whenever those orders happened to differ.
 */
const answersFingerprint = (answers: Record<string, string>): string =>
  Object.keys(answers)
    .sort()
    .map((k) => `${k}=${answers[k]}`)
    .join('|');

/**
 * Guards against a double tap or a retried submit creating two identical requests.
 * Matches on model plus the full answer set — a customer legitimately trading two
 * different phones, or the same model in different condition, is not a duplicate.
 */
export const isDuplicateSubmission = (
  existing: DuplicateCandidate[],
  candidate: DuplicateCandidate,
  nowMs: number
): boolean => {
  const candidateFingerprint = answersFingerprint(candidate.answers);
  return existing.some(
    (e) =>
      nowMs - e.createdAtMs < DUPLICATE_WINDOW_MS &&
      e.deviceModel === candidate.deviceModel &&
      answersFingerprint(e.answers) === candidateFingerprint
  );
};

/**
 * Pre-fills the product form from a request the shop has bought, so the admin does
 * not retype data the app already holds. Always one unit: a used phone is a single
 * specific handset, not a stock line.
 */
export const buildListingDraft = (source: TradeInDraftSource) => {
  const storage = source.storage?.trim();
  const name = storage
    ? `${source.deviceModel} ${storage} — Used`
    : `${source.deviceModel} — Used`;
  return {
    name,
    brand: source.deviceBrand,
    storage,
    imageUrls: source.photos,
    condition: 'used' as const,
    stockQty: 1 as const,
  };
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest __tests__/utils/tradeIn.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit   # must exit 0
git add src/constants/tradeInQuestions.ts src/utils/tradeIn.ts __tests__/utils/tradeIn.test.ts
git commit -m "feat(trade-in): questionnaire constants and pure logic with tests"
```

---

### Task 3: Persist and expose `condition` on products

**Files:**
- Modify: `src/services/productService.ts` (`PART_COLUMN_MAP` ~line 105, `LIST_COLUMNS` ~line 84, `mapProduct` ~lines 17-68)
- Test: `__tests__/utils/tradeIn.test.ts` is untouched; add `__tests__/utils/productCondition.test.ts`

**Interfaces:**
- Consumes: `parts.condition` from Task 1
- Produces: `Product.condition` populated on every product read

- [ ] **Step 1: Write the failing test**

`mapProduct` is not exported. Export it first (add `export` to its declaration), then:

```typescript
// __tests__/utils/productCondition.test.ts
import { mapProduct } from '../../src/services/productService';

describe('mapProduct condition', () => {
  it('maps the condition column through', () => {
    expect(mapProduct({ id: '1', name: 'x', condition: 'used' }).condition).toBe('used');
  });

  it('defaults to new when the column is absent', () => {
    expect(mapProduct({ id: '1', name: 'x' }).condition).toBe('new');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/utils/productCondition.test.ts`
Expected: FAIL — `condition` is `undefined`.

- [ ] **Step 3: Add condition in all three places**

`condition` must be added to **each** of these or it silently will not reach customers.

In `PART_COLUMN_MAP`, alongside `warranty: 'warranty'`:

```typescript
  warranty: 'warranty', sku: 'sku', barcode: 'barcode', dimensions: 'dimensions',
  condition: 'condition',
```

In `LIST_COLUMNS`, append `,condition` to the column string (cards need it for the Used badge).

In `mapProduct`, alongside the other scalar fields:

```typescript
  // Defaults to 'new' so a row written before the column existed still reads sensibly.
  condition: data.condition || 'new',
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/utils/productCondition.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/services/productService.ts __tests__/utils/productCondition.test.ts
git commit -m "feat(products): persist and map product condition"
```

---

### Task 4: `tradeInService`

**Files:**
- Create: `src/services/tradeInService.ts`
- Modify: `src/types/index.ts` (add `TradeInRequest` interface near the other domain types)

**Interfaces:**
- Consumes: `trade_in_requests` from Task 1; `TRADE_IN_QUESTIONS_VERSION` from Task 2
- Produces:
  - `TradeInRequest` domain type
  - `tradeInService.createRequest(input: CreateTradeInInput): Promise<TradeInRequest>`
  - `tradeInService.getMyRequests(userId: string): Promise<TradeInRequest[]>`
  - `tradeInService.getTenantRequests(tenantId: string, status?: string): Promise<TradeInRequest[]>`
  - `tradeInService.sendQuote(id: string, offerUsd: number, offerNote: string, reviewedBy: string): Promise<boolean>`
  - `tradeInService.setStatus(id: string, status: TradeInStatus): Promise<void>`

- [ ] **Step 1: Add the domain type**

In `src/types/index.ts`:

```typescript
export type TradeInStatus =
  | 'submitted' | 'quoted' | 'accepted' | 'declined' | 'completed' | 'cancelled';

export interface TradeInRequest {
  id: string;
  tenantId: string;
  userId?: string;
  contactName: string;
  contactPhone: string;
  deviceBrand: string;
  deviceModel: string;
  storage?: string;
  questionsVersion: number;
  answers: Record<string, string>;
  photos: string[];
  customerNote?: string;
  status: TradeInStatus;
  offerUSD?: number;
  offerNote?: string;
  offerType?: 'cash' | 'credit';
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
  quotedAt?: string;
}
```

- [ ] **Step 2: Write the service**

```typescript
// src/services/tradeInService.ts
import { supabase } from './supabase';
import { TRADE_IN_QUESTIONS_VERSION } from '../constants/tradeInQuestions';
import { TradeInRequest, TradeInStatus } from '../types';

const mapRow = (r: any): TradeInRequest => ({
  id: r.id,
  tenantId: r.tenant_id,
  userId: r.user_id ?? undefined,
  contactName: r.contact_name,
  contactPhone: r.contact_phone,
  deviceBrand: r.device_brand,
  deviceModel: r.device_model,
  storage: r.storage ?? undefined,
  questionsVersion: r.questions_version ?? 1,
  answers: r.answers || {},
  photos: r.photos || [],
  customerNote: r.customer_note ?? undefined,
  status: r.status,
  offerUSD: r.offer_usd != null ? Number(r.offer_usd) : undefined,
  offerNote: r.offer_note ?? undefined,
  offerType: r.offer_type ?? undefined,
  reviewedBy: r.reviewed_by ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  quotedAt: r.quoted_at ?? undefined,
});

export interface CreateTradeInInput {
  tenantId: string;
  userId: string;
  contactName: string;
  contactPhone: string;
  deviceBrand: string;
  deviceModel: string;
  storage?: string;
  answers: Record<string, string>;
  photos: string[];
  customerNote?: string;
}

export const tradeInService = {
  async createRequest(input: CreateTradeInInput): Promise<TradeInRequest> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .insert({
        tenant_id: input.tenantId,
        user_id: input.userId,
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
        device_brand: input.deviceBrand,
        device_model: input.deviceModel,
        storage: input.storage?.trim() || null,
        questions_version: TRADE_IN_QUESTIONS_VERSION,
        answers: input.answers,
        photos: input.photos,
        customer_note: input.customerNote?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async getMyRequests(userId: string): Promise<TradeInRequest[]> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapRow);
  },

  async getTenantRequests(tenantId: string, status?: string): Promise<TradeInRequest[]> {
    let q = supabase
      .from('trade_in_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(mapRow);
  },

  /**
   * Conditional on status still being 'submitted', so two admins quoting the same
   * request at once cannot silently overwrite each other. Returns false when the
   * request was already quoted by someone else.
   */
  async sendQuote(
    id: string,
    offerUsd: number,
    offerNote: string,
    reviewedBy: string
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('trade_in_requests')
      .update({
        offer_usd: offerUsd,
        offer_note: offerNote.trim() || null,
        offer_type: 'cash',
        status: 'quoted',
        reviewed_by: reviewedBy,
        quoted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'submitted')
      .select('id');
    if (error) throw error;
    return (data || []).length > 0;
  },

  async setStatus(id: string, status: TradeInStatus): Promise<void> {
    const { error } = await supabase
      .from('trade_in_requests')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  },
};
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add src/services/tradeInService.ts src/types/index.ts
git commit -m "feat(trade-in): tenant-scoped trade-in service"
```

---

### Task 5: Locale strings

**Files:**
- Modify: `src/locales/en.json`, `src/locales/ar.json`, `src/locales/ku.json`

**Interfaces:**
- Consumes: `labelKey` values from Task 2
- Produces: every `tradeIn.*` key resolvable in all three languages

Doing this before the screens means no screen is ever written against a missing key.

- [ ] **Step 1: Add the `tradeIn` block to `en.json`**

```json
"tradeIn": {
  "title": "Sell or trade your phone",
  "subtitle": "Answer a few questions and we'll send you a price.",
  "selectBrand": "Brand",
  "selectModel": "Model",
  "storage": "Storage",
  "photos": "Photos",
  "photosHint": "Front, back, and the screen switched on.",
  "note": "Anything else we should know?",
  "submit": "Send for review",
  "submitted": "Sent. We'll review it and send you a price.",
  "myRequests": "My trade-ins",
  "noRequests": "You haven't sent us a phone yet.",
  "offerReceived": "Our offer",
  "accept": "Accept",
  "decline": "Decline",
  "answerAll": "Please answer every question.",
  "photoFailed": "That photo didn't upload. Please try again.",
  "duplicate": "You just sent this. Check My trade-ins.",
  "alreadyQuoted": "Another admin has already quoted this request.",
  "newPriceLabel": "You sell this new for",
  "notStocked": "Not stocked new",
  "sendQuote": "Send quote",
  "offerAmount": "Offer amount (USD)",
  "offerNote": "Note (optional)",
  "markCompleted": "Mark completed",
  "createListing": "Create listing from this",
  "status": {
    "submitted": "Waiting for review",
    "quoted": "Offer sent",
    "accepted": "Accepted",
    "declined": "Declined",
    "completed": "Completed",
    "cancelled": "Cancelled"
  },
  "q": {
    "powersOn": "Does it power on?",
    "screen": "Screen",
    "batteryHealth": "Battery health (%)",
    "chargingPort": "Charging port",
    "cameras": "Cameras",
    "biometrics": "Face ID or fingerprint",
    "waterDamage": "Water damage",
    "accountRemoved": "iCloud or Google account removed",
    "body": "Body",
    "boxCharger": "Box and charger included"
  },
  "a": {
    "original": "Original",
    "replaced": "Replaced",
    "cracked": "Cracked",
    "works": "Works",
    "faulty": "Faulty",
    "doesNotWork": "Doesn't work",
    "allWork": "All work",
    "someFaulty": "Some faulty",
    "dontKnow": "Don't know",
    "likeNew": "Like new",
    "lightScratches": "Light scratches",
    "dents": "Dents or cracks"
  }
},
"product": {
  "conditionNew": "New",
  "conditionUsed": "Used",
  "conditionRefurbished": "Refurbished"
}
```

Merge the `product` keys into the existing `product` block rather than creating a second one.

- [ ] **Step 2: Add the same keys to `ar.json` and `ku.json`**

Real Arabic and Kurdish translations, never the English copied across. Examples for the block title: ar `"بيع أو استبدال هاتفك"`, ku `"فرۆشتن یان گۆڕینی مۆبایلەکەت"`.

- [ ] **Step 3: Verify parity**

```bash
node -e "
const fs=require('fs');
const f=l=>{const o={};(function w(d,p){for(const k in d){const kk=p?p+'.'+k:k;typeof d[k]==='object'&&d[k]?w(d[k],kk):o[kk]=d[k]}})(JSON.parse(fs.readFileSync('src/locales/'+l+'.json','utf8')),'');return o};
const en=f('en'),ar=f('ar'),ku=f('ku');
console.log('missing ar:',Object.keys(en).filter(k=>!(k in ar)));
console.log('missing ku:',Object.keys(en).filter(k=>!(k in ku)));
"
```

Expected: both arrays empty.

- [ ] **Step 4: Commit**

```bash
git add src/locales/en.json src/locales/ar.json src/locales/ku.json
git commit -m "feat(i18n): trade-in and product condition strings"
```

---

### Task 6: Customer submission screen

**Files:**
- Create: `src/screens/TradeInRequestScreen.tsx`
- Modify: `src/types/index.ts` (`RootStackParamList` ~line 525, add `TradeInRequest: undefined; MyTradeIns: undefined;`)
- Modify: `src/navigation/AppNavigator.tsx` (register both screens)
- Modify: `src/screens/ProfileScreen.tsx` (menu entry near the `MyAddress` entry at ~line 536)

**Interfaces:**
- Consumes: `TRADE_IN_QUESTIONS`, `validateAnswers`, `isDuplicateSubmission` (Task 2); `tradeInService.createRequest`, `getMyRequests` (Task 4); locale keys (Task 5)
- Produces: route `TradeInRequest`

- [ ] **Step 1: Build the screen**

Structure — `SafeAreaView` → `KeyboardAvoidingView` → single `ScrollView` with `keyboardShouldPersistTaps="handled"`. One vertical scroll owner.

Sections in order: brand picker (from `brandService.getActiveBrands(tenantId)`, with a free-text fallback for a model you don't stock), model text input, storage text input, the ten questions rendered from `TRADE_IN_QUESTIONS`, photo picker, note field, submit button.

Question rendering:

```tsx
{TRADE_IN_QUESTIONS.map((q) => (
  <View key={q.key} style={styles.questionBlock}>
    <Text allowFontScaling={false}
      style={[styles.questionLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
      {t(q.labelKey)}
    </Text>
    {q.type === 'percent' ? (
      <TextInput
        keyboardType="number-pad"
        value={answers[q.key] || ''}
        onChangeText={(v) => setAnswers((p) => ({ ...p, [q.key]: v.replace(/[^0-9]/g, '') }))}
        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
      />
    ) : (
      <View style={[styles.optionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {q.options!.map((o) => {
          const selected = answers[q.key] === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => setAnswers((p) => ({ ...p, [q.key]: o.value }))}
              style={[styles.option, {
                backgroundColor: selected ? theme.colors.primary : 'transparent',
                borderColor: selected ? theme.colors.primary : theme.colors.border,
              }]}
            >
              <Text allowFontScaling={false}
                style={{ color: selected ? theme.colors.textOnPrimary : theme.colors.text }}>
                {t(o.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    )}
  </View>
))}
```

Submit handler:

```tsx
const handleSubmit = async () => {
  const { valid, missingKeys } = validateAnswers(answers);
  if (!valid || !deviceModel.trim()) {
    Alert.alert(t('common.error'), t('tradeIn.answerAll'));
    return;
  }
  if (submitting) return;
  setSubmitting(true);
  try {
    // Photos first: a failed upload must block the request, never fall back to the
    // local file:// path. Storing that path is what made brand logos render for the
    // admin and appear blank for every customer.
    const uploaded: string[] = [];
    for (const localUri of pickedPhotos) {
      const res = await ImageService.uploadImage(localUri);
      if (!res.success || !res.url) {
        Alert.alert(t('common.error'), t('tradeIn.photoFailed'));
        return;
      }
      uploaded.push(res.url);
    }

    const mine = await tradeInService.getMyRequests(user!.uid);
    const candidate = { deviceModel: deviceModel.trim(), answers, createdAtMs: Date.now() };
    const existing = mine.map((r) => ({
      deviceModel: r.deviceModel,
      answers: r.answers,
      createdAtMs: new Date(r.createdAt).getTime(),
    }));
    if (isDuplicateSubmission(existing, candidate, Date.now())) {
      Alert.alert(t('common.error'), t('tradeIn.duplicate'));
      return;
    }

    await tradeInService.createRequest({
      tenantId: tenantId!,
      userId: user!.uid,
      contactName: user!.name || '',
      contactPhone: user!.phone || '',
      deviceBrand,
      deviceModel: deviceModel.trim(),
      storage,
      answers,
      photos: uploaded,
      customerNote: note,
    });
    Alert.alert(t('common.success'), t('tradeIn.submitted'));
    navigation.replace('MyTradeIns');
  } catch (e: any) {
    Alert.alert(t('common.error'), e?.message || t('errors.somethingWentWrong'));
  } finally {
    setSubmitting(false);
  }
};
```

Exact API, already verified against the codebase:

- `ImageService` is a **class with static methods**, default-exported from `src/services/imageService.ts`. Import it as `import ImageService from '../services/imageService';`
- `ImageService.uploadImage(imageUri: string): Promise<ImageUploadResult>` where `ImageUploadResult` has `{ success: boolean; url?: string; error?: string }` — see `imageService.ts:60`
- `ImageService.pickImageFromGallery(): Promise<string | null>` — `imageService.ts:152` — use this for the photo picker

- [ ] **Step 2: Register the routes**

In `src/types/index.ts` `RootStackParamList`, add `TradeInRequest: undefined; MyTradeIns: undefined;`. In `AppNavigator.tsx`, add both `<Stack.Screen>` entries alongside the other customer screens.

- [ ] **Step 3: Add the Profile entry, gated on sign-in**

Mirror the `MyAddress` row at `ProfileScreen.tsx:536`, navigating to `TradeInRequest`, labelled `t('tradeIn.title')`.

A request must belong to a customer — `user_id` is required at insert, and the RLS
insert policy checks `auth.uid() = user_id`. A guest tapping through would fail at the
database with an opaque error, so gate at the entry point instead:

```tsx
onPress={() => {
  if (!user?.uid) {
    navigation.navigate('SignIn');
    return;
  }
  (navigation as any).navigate('TradeInRequest');
}}
```

Add the same guard at the top of `TradeInRequestScreen` in case the route is reached by
a deep link: if `!user?.uid`, render nothing and redirect to sign-in.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit           # must exit 0
grep -rn "writingDirection" src/screens/TradeInRequestScreen.tsx   # must return nothing
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/TradeInRequestScreen.tsx src/types/index.ts src/navigation/AppNavigator.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(trade-in): customer submission screen"
```

---

### Task 7: Customer "My trade-ins" screen

**Files:**
- Create: `src/screens/MyTradeInsScreen.tsx`

**Interfaces:**
- Consumes: `tradeInService.getMyRequests`, `setStatus` (Task 4)
- Produces: route `MyTradeIns`

- [ ] **Step 1: Build the screen**

A single `FlatList` (the one vertical scroll owner). Each row: first photo thumbnail, model, submitted date, status chip using `t('tradeIn.status.' + status)`.

When `status === 'quoted'`, the row expands to show the offer and two buttons:

```tsx
{item.status === 'quoted' && (
  <View style={styles.offerBlock}>
    <Text allowFontScaling={false} style={styles.offerLabel}>{t('tradeIn.offerReceived')}</Text>
    <AppNumber
      value={formatPrice(item.offerUSD || 0, currency, exchangeRateIQD)}
      style={styles.offerAmount}
    />
    {!!item.offerNote && <AppText style={styles.offerNote}>{item.offerNote}</AppText>}
    <View style={[styles.offerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Button title={t('tradeIn.accept')} onPress={() => respond(item.id, 'accepted')} />
      <Button title={t('tradeIn.decline')} onPress={() => respond(item.id, 'declined')} />
    </View>
  </View>
)}
```

```tsx
const respond = async (id: string, status: 'accepted' | 'declined') => {
  try {
    await tradeInService.setStatus(id, status);
    await load();
  } catch (e: any) {
    Alert.alert(t('common.error'), e?.message || t('errors.somethingWentWrong'));
  }
};
```

Empty state uses `t('tradeIn.noRequests')`. The money figure goes through `AppNumber` so it renders LTR in Arabic and Kurdish.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/MyTradeInsScreen.tsx
git commit -m "feat(trade-in): customer request list with offer response"
```

---

### Task 8: Admin list screen

**Files:**
- Create: `src/screens/admin/AdminTradeInsScreen.tsx`
- Modify: `src/navigation/AdminNavigator.tsx` (import + `<Stack.Screen name="AdminTradeIns" .../>` alongside line 68)

**Interfaces:**
- Consumes: `tradeInService.getTenantRequests` (Task 4); `useTenant()` for `tenantId`
- Produces: route `AdminTradeIns`

- [ ] **Step 1: Build the screen**

Gate on `tenantId` before rendering anything — never render an admin screen without it.

```tsx
const { tenantId } = useTenant();
const [requests, setRequests] = useState<TradeInRequest[]>([]);
const [filter, setFilter] = useState<string | undefined>(undefined);

const load = useCallback(async () => {
  if (!tenantId) return;
  try {
    setRequests(await tradeInService.getTenantRequests(tenantId, filter));
  } catch (e: any) {
    Alert.alert(t('admin.common.error'), e?.message || t('errors.loadingData'));
  }
}, [tenantId, filter]);

useEffect(() => { load(); }, [load]);
```

A single `FlatList` keyed `` `${tenantId}-${item.id}` `` — `tenantId` belongs in the React key so a tenant switch cannot reuse rows. Status filter chips above it as `ListHeaderComponent`, not a separate scroller.

Each row: thumbnail, `deviceBrand deviceModel`, `contactName`, relative age, status chip. Tapping navigates to `AdminTradeInDetail` with `{ requestId: item.id }`.

- [ ] **Step 2: Register the route**

`src/navigation/AdminNavigator.tsx`, matching the existing pattern:

```tsx
import AdminTradeInsScreen from '../screens/admin/AdminTradeInsScreen';
// ...
<Stack.Screen name="AdminTradeIns" component={AdminTradeInsScreen} />
```

Add an entry pointing at it from the admin dashboard or settings list, wherever the other admin screens are linked from.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/admin/AdminTradeInsScreen.tsx src/navigation/AdminNavigator.tsx
git commit -m "feat(trade-in): admin request inbox"
```

---

### Task 9: Admin detail, quote, and listing hand-off

**Files:**
- Create: `src/screens/admin/AdminTradeInDetailScreen.tsx`
- Modify: `src/navigation/AdminNavigator.tsx` (register `AdminTradeInDetail`)

**Interfaces:**
- Consumes: `tradeInService.sendQuote`, `setStatus` (Task 4); `buildListingDraft` (Task 2); `ProductService` for the new-price lookup
- Produces: route `AdminTradeInDetail` with param `{ requestId: string }`

- [ ] **Step 1: Build the new-price comparison**

```tsx
// What the shop sells this model for new — the comparison the owner asked for.
// Admin-only: customers see used listings on their own, without a price contrast.
const [newPrice, setNewPrice] = useState<number | null>(null);
const [newPriceChecked, setNewPriceChecked] = useState(false);

useEffect(() => {
  if (!request || !tenantId) return;
  (async () => {
    try {
      // searchProducts(searchQuery, filters, tenantId) — productService.ts:219.
      // tenantId is the THIRD argument; passing it second silently searches every
      // shop's catalogue and could show another store's price.
      const matches = await ProductService.searchProducts(request.deviceModel, {}, tenantId);
      const newOne = matches.find(
        (p) => (p.condition || 'new') === 'new' &&
               p.name.toLowerCase().includes(request.deviceModel.toLowerCase())
      );
      setNewPrice(newOne ? newOne.priceUSD : null);
    } catch {
      setNewPrice(null);
    } finally {
      setNewPriceChecked(true);
    }
  })();
}, [request, tenantId]);
```

Render `t('tradeIn.newPriceLabel')` with the amount through `AppNumber`, or `t('tradeIn.notStocked')` when `newPriceChecked && newPrice === null`.

Note `searchProducts` returns `[]` for queries shorter than two characters (`productService.ts:226`), so a one-character model name reads as "not stocked" rather than erroring. That is acceptable behaviour here.

- [ ] **Step 2: Build the quote action**

```tsx
const handleSendQuote = async () => {
  const amount = parseFloat(offerAmount);
  if (!(amount > 0)) {
    Alert.alert(t('admin.common.error'), t('tradeIn.offerAmount'));
    return;
  }
  try {
    const ok = await tradeInService.sendQuote(request.id, amount, offerNote, user!.uid);
    if (!ok) {
      // Someone else got there first. Reload rather than overwrite their quote.
      Alert.alert(t('admin.common.error'), t('tradeIn.alreadyQuoted'));
      await load();
      return;
    }
    await load();
  } catch (e: any) {
    Alert.alert(t('admin.common.error'), e?.message || t('errors.somethingWentWrong'));
  }
};
```

- [ ] **Step 3: Build the listing hand-off**

Shown only when `status === 'accepted'`:

```tsx
<Button
  title={t('tradeIn.createListing')}
  onPress={() => {
    const draft = buildListingDraft({
      deviceBrand: request.deviceBrand,
      deviceModel: request.deviceModel,
      storage: request.storage,
      photos: request.photos,
    });
    navigation.navigate('AdminProducts', { prefill: draft });
  }}
/>
```

`AdminProductsScreen` must accept an optional `prefill` route param and seed `formData` from it on mount. **That file is `@ts-nocheck`** — after editing, manually confirm every identifier the new code uses is imported at the top of the file. `tsc` will not tell you.

Also render **Mark completed**, which calls `setStatus(id, 'completed')`.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
git diff src/screens/admin/AdminProductsScreen.tsx   # read every referenced identifier
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/admin/AdminTradeInDetailScreen.tsx src/navigation/AdminNavigator.tsx src/screens/admin/AdminProductsScreen.tsx
git commit -m "feat(trade-in): admin detail, quote and listing hand-off"
```

---

### Task 10: Storefront — Used badge and condition row

**Files:**
- Modify: `src/components/MasonryProductCard.tsx`
- Modify: `src/screens/ProductDetailsScreen.tsx` (restore the condition row in the info-cards area, ~line 2626)

**Interfaces:**
- Consumes: `Product.condition` (Task 3); locale keys (Task 5)
- Produces: visible Used badge and condition row

- [ ] **Step 1: Badge on the card**

`MasonryProductCard` is the only card with importers. Alongside the existing status badges:

```tsx
{product.condition === 'used' && (
  <View style={[styles.conditionBadge, { backgroundColor: theme.colors.textSecondary }]}>
    <AppText fontSize={10} style={styles.conditionBadgeText}>
      {t('product.conditionUsed')}
    </AppText>
  </View>
)}
```

- [ ] **Step 2: Condition row on the product page**

Restore the third info card, now backed by real data:

```tsx
<View style={[styles.infoCard, styles.infoCardHalf, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
  <Text allowFontScaling={false} style={[styles.infoCardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
    {t('product.condition')}
  </Text>
  <Text allowFontScaling={false} style={[styles.infoCardValue, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
    {t(`product.condition${(product.condition || 'new').charAt(0).toUpperCase()}${(product.condition || 'new').slice(1)}`)}
  </Text>
</View>
```

Place it beside Availability so the row is 2-up again, and drop `styles.infoCardHalf` from the Availability card since the row is no longer a lone card.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
grep -n "conditionBadge" src/components/MasonryProductCard.tsx     # style must be defined
```

Read the `ProductDetailsScreen` diff and confirm every identifier is imported — `@ts-nocheck` hides mistakes here.

- [ ] **Step 4: Commit**

```bash
git add src/components/MasonryProductCard.tsx src/screens/ProductDetailsScreen.tsx
git commit -m "feat(products): Used badge and condition row"
```

---

### Task 11: Full verification pass

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Static checks**

```bash
npx tsc --noEmit                                    # exit 0
npx jest __tests__/utils/                            # all pass
grep -rn "writingDirection" src/screens/TradeInRequestScreen.tsx src/screens/MyTradeInsScreen.tsx src/screens/admin/AdminTradeIns*.tsx   # nothing
```

Locale parity, using the script from Task 5 Step 3. Expected: both arrays empty.

- [ ] **Step 2: Device pass**

Nothing in this feature has run on a phone until now. Verify each in order:

1. Profile → Sell or trade your phone → the ten questions render, each answerable
2. Submit with one question blank → blocked with "Please answer every question"
3. Add a photo, submit → request appears in My trade-ins as "Waiting for review"
4. Tap submit twice quickly → only one request is created
5. Admin → Trade-ins → the request is listed, and the new price for that model shows (or "Not stocked new")
6. Send a quote → the customer sees the offer and a push notification arrives
7. Accept → status changes and **Create listing from this** appears
8. Create the listing → the product form opens pre-filled with model, photos, condition Used, stock 1
9. Publish → the card shows a **Used** badge, the product page shows Condition: Used
10. Buy it → stock reaches zero and it reads out of stock

- [ ] **Step 3: Arabic pass**

Switch the app to Arabic and repeat steps 1, 3 and 6. Confirm no English fallback text appears, layout is right-aligned, and money and battery-percentage figures still read left-to-right.

- [ ] **Step 4: Tenancy check**

If a second tenant exists, sign in as its admin and confirm the Trade-ins inbox shows **none** of the first shop's requests. This is the specific failure that affected brands, promos and banners.

---

## Notes for the implementer

- **Phase 2 is out of scope.** `offer_type` is written as `cash` everywhere. Do not build a credit balance, a wallet, or a redeemable code. The column exists so phase 2 adds an option rather than a migration.
- **No automatic valuation.** The customer never sees a number before the admin quotes. Do not add an estimate, a range, or a "phones like this sold for…" hint.
- **Used phones are separate listings.** Do not merge them into the new model's product page.
