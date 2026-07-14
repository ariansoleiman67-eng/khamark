# Category Icons — Design Spec

**Date:** 2026-07-13
**Status:** Draft (awaiting owner review)

## Goal / success criterion

The admin manages a list of product **categories** in Settings, each with an
**uploaded image** as its icon and a name (English + Arabic + Kurdish). When
adding a product, the admin **picks from those categories** instead of typing a
name or choosing from a fixed list. The customer-facing Categories screen shows
**the uploaded icon** for each category.

> The single thing that defines success: **the icon the admin chooses/uploads is
> the icon customers see.** A category with no image yet falls back to today's
> guessed icon so nothing ever looks broken.

## Current state (what exists today)

- **`categories` table already exists** (per-tenant): `id, tenant_id, name,
  name_ar, name_ku, description, image_url, product_count, is_active, sort_order`.
  RLS is permissive (`FOR ALL USING(true)`).
- **CRUD already exists** in `tenantAdminService`: `getCategories`, `addCategory`,
  `updateCategory`, `deleteCategory` (all tenant-scoped).
- **Nothing uses the table yet.** Add Product (`AdminProductsScreen`) picks the
  category from a hardcoded `STORE_CATEGORIES` list or free-typed text, and stores
  it as a plain string on the product (`category` / `categoryAr` / `categoryKu`).
- The **customer `CategoriesScreen`** builds its category list from the distinct
  `product.category` strings and assigns an icon via a hardcoded guess-map
  (`getCategoryIcon`), defaulting to a `cube` glyph — this is the icon problem.
- Image upload already exists: `ImageService.showImagePicker()` +
  `ImageService.uploadImage()` (ImgBB), used by the product form.

## Design

### 1. Data
Reuse the existing `categories` table and `tenantAdminService` CRUD. **No schema
change, no new RLS.** Icon lives in the existing `image_url` column.

### 2. Admin — new "Categories" management screen
- New screen `AdminCategoriesScreen`, reached from **Admin Settings → Categories**
  (add one row to `AdminSettingsScreen`).
- Lists the tenant's categories: icon thumbnail + localized name, each with
  Edit / Delete, plus an **Add category** button.
- Add/Edit form: **Name (EN)**, optional **Arabic** / **Kurdish** names,
  **Upload icon** (reuse `ImageService` → ImgBB → `image_url`), **Active** toggle.
- **First-run seed:** when the screen opens and the tenant has **zero** category
  rows, one-time auto-create a row per distinct category name already on the
  shop's products (name copied to all three language fields, no image yet).
  Guarded strictly by "table empty for this tenant" so it runs once and never
  duplicates.

### 3. Add Product — pick from managed categories
- Replace the `STORE_CATEGORIES` picker + free-text with a picker listing the
  tenant's managed categories (icon + localized name), loaded via `getCategories`.
- Selecting a category writes its `name` / `name_ar` / `name_ku` onto the
  product's existing string fields — **backward compatible, no product migration.**
- Empty state: if no categories exist, show a hint/shortcut to add them in
  Settings.
- Keep a simple type-to-filter within the managed list.

### 4. Customer Categories screen — show uploaded icons
- When building the category tiles, look up each category name in the managed
  categories; if it has an `image_url`, render that image (via `expo-image`,
  cached) as the icon. Otherwise fall back to the current guessed Ionicon.
- Apply the same lookup to the home-screen category row if it renders from the
  same data.

### 5. Safety / invariants
- Products keep storing category as **text** → zero product-data migration,
  existing filters and screens keep working.
- Everything stays **tenant-scoped** (queries already filter by `tenantId`).
- No new database migration required.

## Approach decision (considered alternatives)

- **A — store category NAME on product (CHOSEN).** Matches today's data model,
  backward compatible, no migration. The product's category name maps to the
  managed category row (which carries the icon).
- **B — store `category_id` FK on product.** Relationally cleaner, but requires a
  schema change, migrating every existing product, and rewriting every screen
  that reads `product.category` as a string. Rejected: too invasive for the
  payoff, and risky on a live shop.

## Out of scope (YAGNI)
- Reordering UI beyond a simple `sort_order` (can add drag-reorder later).
- Category descriptions surfaced to customers (column exists; not part of this).
- Converting products to ID-based categories (Approach B).

## Files affected (anticipated)
- **New:** `src/screens/admin/AdminCategoriesScreen.tsx`
- **Edit:** `src/navigation/AppNavigator.tsx` (register screen),
  `src/screens/admin/AdminSettingsScreen.tsx` (menu row),
  `src/screens/admin/AdminProductsScreen.tsx` (category picker),
  `src/screens/CategoriesScreen.tsx` (icon lookup), possibly `HomeScreen.tsx`.
- **Reuse:** `tenantAdminService` category CRUD, `ImageService` upload.
- **Locales:** new keys in `en/ar/ku` for the screen + labels.
