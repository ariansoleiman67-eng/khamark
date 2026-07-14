# Category Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin manage per-shop product categories (name + uploaded icon) in Settings, pick from them when adding a product, and show the uploaded icon to customers.

**Architecture:** Reuse the existing per-tenant `categories` table + `tenantAdminService` CRUD (fixing its snake_case↔camelCase mapping). A new admin screen does CRUD + image upload; the Add Product picker and the customer Categories screen read the managed categories. Products keep storing the category as a **string** (name), so no product migration.

**Tech Stack:** React Native 0.81 / Expo SDK 54 (Fabric), TypeScript strict, Supabase (`categories` table, permissive RLS), ImgBB upload via `ImageService`, i18next (en/ar/ku), `expo-image`.

## Global Constraints

- DB columns are **snake_case**; domain types are **camelCase** — map at the service boundary (`mapProduct` pattern).
- All category queries are **tenant-scoped** (`tenant_id = this.tenantId` for admin; `tenant_id = <tenantId arg>` for customer read).
- No new DB migration — `categories` table + columns already exist.
- Arabic/Kurdish text must not rely on wrapping (Fabric); use `textAlign` + `I18nManager.isRTL`, never `writingDirection`. Numbers render LTR.
- All user-facing strings go through `t('...')` and must be added to **all three** locale files.
- **No jest component harness exists** in this repo. Automated gate per task = `npm run type-check` (must be clean for touched files). Behavioral verification = explicit manual in-app steps (documented per task).
- Commit after each task.

---

### Task 1: Fix category service mapping + add customer read service

**Files:**
- Modify: `src/services/tenantAdminService.ts` (add `mapCategory`; fix `getCategories`, `addCategory`, `updateCategory`)
- Create: `src/services/categoryService.ts` (public read by tenant)

**Interfaces:**
- Consumes: existing `TenantCategory` (tenantAdminService.ts:126), `supabase` client.
- Produces:
  - `tenantAdminService.getCategories(): Promise<TenantCategory[]>` (now correctly mapped)
  - `tenantAdminService.addCategory(data: Partial<TenantCategory>): Promise<string>` (accepts camelCase)
  - `tenantAdminService.updateCategory(id: string, updates: Partial<TenantCategory>): Promise<void>` (accepts camelCase)
  - `categoryService.getActiveCategories(tenantId: string): Promise<TenantCategory[]>`

- [ ] **Step 1: Add `mapCategory` + camel→snake helper in `tenantAdminService.ts`** (near the top, after imports)

```ts
// snake_case DB row -> camelCase domain (mirrors mapProduct pattern)
const mapCategory = (row: any): TenantCategory => ({
  id: row.id,
  name: row.name,
  nameAr: row.name_ar ?? undefined,
  nameKu: row.name_ku ?? undefined,
  description: row.description ?? undefined,
  imageUrl: row.image_url ?? undefined,
  productCount: row.product_count ?? 0,
  isActive: row.is_active ?? true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// camelCase domain -> snake_case DB columns (only defined keys)
const toCategoryRow = (c: Partial<TenantCategory>): Record<string, any> => {
  const row: Record<string, any> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.nameAr !== undefined) row.name_ar = c.nameAr;
  if (c.nameKu !== undefined) row.name_ku = c.nameKu;
  if (c.description !== undefined) row.description = c.description;
  if (c.imageUrl !== undefined) row.image_url = c.imageUrl;
  if (c.isActive !== undefined) row.is_active = c.isActive;
  if (c.sortOrder !== undefined) row.sort_order = c.sortOrder;
  return row;
};
```

- [ ] **Step 2: Fix `getCategories` to map + order** (replace the method body's return)

```ts
async getCategories(): Promise<TenantCategory[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapCategory);
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
}
```

- [ ] **Step 3: Fix `addCategory` + `updateCategory` to write snake_case**

```ts
async addCategory(categoryData: Partial<TenantCategory>): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .insert([{ ...toCategoryRow(categoryData), tenant_id: this.tenantId }])
      .select()
      .single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error('Error adding category:', error);
    throw error;
  }
}

async updateCategory(categoryId: string, updates: Partial<TenantCategory>): Promise<void> {
  try {
    const { error } = await supabase
      .from('categories')
      .update({ ...toCategoryRow(updates), updated_at: new Date().toISOString() })
      .eq('id', categoryId)
      .eq('tenant_id', this.tenantId);
    if (error) throw error;
  } catch (error) {
    console.error('Error updating category:', error);
    throw error;
  }
}
```
(`deleteCategory` is unchanged.)

- [ ] **Step 4: Create `src/services/categoryService.ts`** (public read by tenant — used by customer screen + product picker outside admin context)

```ts
import { supabase } from './supabase';
import type { TenantCategory } from './tenantAdminService';

const mapCategory = (row: any): TenantCategory => ({
  id: row.id,
  name: row.name,
  nameAr: row.name_ar ?? undefined,
  nameKu: row.name_ku ?? undefined,
  description: row.description ?? undefined,
  imageUrl: row.image_url ?? undefined,
  productCount: row.product_count ?? 0,
  isActive: row.is_active ?? true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const categoryService = {
  /** Active categories for a shop (customer-facing / product picker). */
  async getActiveCategories(tenantId: string): Promise<TenantCategory[]> {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) { console.warn('getActiveCategories failed', error.message); return []; }
    return (data || []).map(mapCategory);
  },
};
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no new errors in `tenantAdminService.ts` / `categoryService.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/services/tenantAdminService.ts src/services/categoryService.ts
git commit -m "fix(categories): map snake_case<->camelCase; add public categoryService read"
```

---

### Task 2: Admin "Categories" management screen + Settings entry + first-run seed

**Files:**
- Create: `src/screens/admin/AdminCategoriesScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx` (register `AdminCategories`)
- Modify: `src/screens/admin/AdminSettingsScreen.tsx` (add a `LuxuryMenuItem` row)

**Interfaces:**
- Consumes: `useTenantAdmin()`/`tenantAdminService` CRUD from Task 1, `ImageService.showImagePicker()`, `ImageService.uploadImage(uri) -> {success,url}`, `ProductService.getProducts(page, pageSize, tenantId)` for seeding, `useTenant()` for tenantId.
- Produces: navigable screen `'AdminCategories'`.

- [ ] **Step 1: Create `AdminCategoriesScreen.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, ScrollView, Switch, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { tenantAdminService, TenantCategory } from '../../services/tenantAdminService';
import { ImageService } from '../../services/imageService';
import ProductService from '../../services/productService';
import { SPACING } from '../../constants/theme';

const emptyForm = (): Partial<TenantCategory> => ({ name: '', nameAr: '', nameKu: '', imageUrl: '', isActive: true });

export default function AdminCategoriesScreen() {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { tenantId } = useTenant();
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';

  const [cats, setCats] = useState<TenantCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenantCategory | null>(null);
  const [form, setForm] = useState<Partial<TenantCategory>>(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      let list = await tenantAdminService.getCategories();
      // First-run seed: no categories yet -> create one per distinct product category.
      if (list.length === 0 && tenantId) {
        const { products } = await ProductService.getProducts(1, 500, tenantId);
        const names = Array.from(new Set(
          (products || []).map((p: any) => (p.category || '').trim()).filter(Boolean)
        ));
        for (const name of names) {
          try { await tenantAdminService.addCategory({ name, nameAr: name, nameKu: name, isActive: true }); } catch {}
        }
        if (names.length) list = await tenantAdminService.getCategories();
      }
      setCats(list);
    } catch {
      Alert.alert(t('common.error', 'Error'), t('admin.categories.loadError', 'Could not load categories'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]);

  useEffect(() => { load(); }, [load]);

  const localizedName = (c: TenantCategory) =>
    (i18n.language === 'ar' && c.nameAr) ? c.nameAr : (i18n.language === 'ku' && c.nameKu) ? c.nameKu : c.name;

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (c: TenantCategory) => { setEditing(c); setForm({ ...c }); setModalOpen(true); };

  const pickIcon = async () => {
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;
      setUploading(true);
      const res = await ImageService.uploadImage(uri);
      if (res.success && res.url) setForm(prev => ({ ...prev, imageUrl: res.url }));
      else Alert.alert(t('common.error', 'Error'), t('admin.categories.uploadError', 'Upload failed'));
    } finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      Alert.alert(t('common.error', 'Error'), t('admin.categories.nameRequired', 'Name is required'));
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) await tenantAdminService.updateCategory(editing.id, form);
      else await tenantAdminService.addCategory(form);
      setModalOpen(false);
      setLoading(true);
      await load();
    } catch {
      Alert.alert(t('common.error', 'Error'), t('admin.categories.saveError', 'Could not save'));
    } finally { setSaving(false); }
  };

  const confirmDelete = (c: TenantCategory) => {
    Alert.alert(
      t('admin.categories.deleteTitle', 'Delete category'),
      t('admin.categories.deleteConfirm', 'Delete this category? Products keep their current category name.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.delete', 'Delete'), style: 'destructive', onPress: async () => {
          if (!c.id) return;
          try { await tenantAdminService.deleteCategory(c.id); setCats(prev => prev.filter(x => x.id !== c.id)); }
          catch { Alert.alert(t('common.error', 'Error'), t('admin.categories.saveError', 'Could not save')); }
        } },
      ]
    );
  };

  const renderItem = ({ item }: { item: TenantCategory }) => (
    <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '30', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      {item.imageUrl
        ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
        : <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.colors.primary + '15' }]}><Ionicons name="cube-outline" size={22} color={theme.colors.primary} /></View>}
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.rowName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{localizedName(item)}</Text>
      <TouchableOpacity onPress={() => openEdit(item)} style={styles.rowBtn}><Ionicons name="create-outline" size={20} color={theme.colors.primary} /></TouchableOpacity>
      <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.rowBtn}><Ionicons name="trash-outline" size={20} color={theme.colors.error} /></TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={theme.colors.text} /></TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>{t('admin.categories.title', 'Categories')}</Text>
        <TouchableOpacity onPress={openAdd}><Ionicons name="add" size={28} color={theme.colors.primary} /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={cats}
          keyExtractor={(x) => x.id || x.name}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SPACING.md, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="pricetags-outline" size={44} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginTop: 8 }}>{t('admin.categories.empty', 'No categories yet. Tap + to add one.')}</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text allowFontScaling={false} style={[styles.sheetTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {editing ? t('admin.categories.edit', 'Edit category') : t('admin.categories.add', 'Add category')}
              </Text>

              <TouchableOpacity onPress={pickIcon} style={[styles.iconPick, { borderColor: theme.colors.border }]}>
                {uploading ? <ActivityIndicator color={theme.colors.primary} />
                  : form.imageUrl ? <Image source={{ uri: form.imageUrl }} style={styles.iconPreview} contentFit="cover" />
                  : <><Ionicons name="cloud-upload-outline" size={26} color={theme.colors.primary} /><Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginTop: 4 }}>{t('admin.categories.uploadIcon', 'Upload icon')}</Text></>}
              </TouchableOpacity>

              {([['name','name','Name'],['nameAr','nameAr','Arabic name'],['nameKu','nameKu','Kurdish name']] as const).map(([key, k, fallback]) => (
                <TextInput allowFontScaling={false} key={key}
                  style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t(`admin.categories.${k}`, fallback)}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={(form as any)[k] || ''}
                  onChangeText={(v) => setForm(prev => ({ ...prev, [k]: v }))} />
              ))}

              <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text allowFontScaling={false} style={{ color: theme.colors.text }}>{t('admin.categories.active', 'Active')}</Text>
                <Switch value={form.isActive !== false} onValueChange={(v) => setForm(prev => ({ ...prev, isActive: v }))} />
              </View>

              <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.border }]} onPress={() => setModalOpen(false)}>
                  <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '600' }}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '700' }}>{t('common.save', 'Save')}</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 40 },
  row: { alignItems: 'center', borderRadius: 12, borderWidth: 1, gap: 12, padding: 12 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowName: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowBtn: { padding: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', padding: SPACING.lg },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: SPACING.md },
  iconPick: { alignItems: 'center', alignSelf: 'center', borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', height: 96, justifyContent: 'center', marginBottom: SPACING.md, width: 96 },
  iconPreview: { width: 92, height: 92, borderRadius: 12 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 15, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 12 },
  switchRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  actions: { gap: 12, marginTop: 4 },
  btn: { alignItems: 'center', borderRadius: 12, flex: 1, paddingVertical: 14 },
});
```

- [ ] **Step 2: Register the screen in `src/navigation/AppNavigator.tsx`**

Find where other admin screens are registered (e.g. `AdminStoreProfile`), and add, matching the existing `<Stack.Screen ...>` style and import:
```tsx
import AdminCategoriesScreen from '../screens/admin/AdminCategoriesScreen';
// ...inside the same Stack.Navigator group as other Admin* screens:
<Stack.Screen name="AdminCategories" component={AdminCategoriesScreen} options={{ headerShown: false }} />
```

- [ ] **Step 3: Add a Settings row in `src/screens/admin/AdminSettingsScreen.tsx`**

Near the store-management rows (e.g. after `AdminStoreProfile`), add:
```tsx
<LuxuryMenuItem icon="pricetags-outline" title={t('admin.categories.title', 'Categories')}
  subtitle={t('admin.categories.subtitle', 'Manage categories & icons')}
  onPress={() => navigation.navigate('AdminCategories')}
  theme={theme} isDark={isDark} tintBg={/* reuse the same tintBg expression the sibling rows use */ theme.colors.primary + '14'} />
```
(Match the exact prop values — `theme`, `isDark`, `tintBg` — used by the adjacent `LuxuryMenuItem` calls in this file.)

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Launch the app (admin logged in). Settings → Categories opens the screen. First open auto-lists your existing categories. Add one with an uploaded icon; edit; delete. Confirm the icon thumbnail shows and persists after leaving/returning.

- [ ] **Step 6: Commit**

```bash
git add src/screens/admin/AdminCategoriesScreen.tsx src/navigation/AppNavigator.tsx src/screens/admin/AdminSettingsScreen.tsx
git commit -m "feat(admin): categories management screen with icon upload + first-run seed"
```

---

### Task 3: Add Product picker uses managed categories

**Files:**
- Modify: `src/screens/admin/AdminProductsScreen.tsx` (category picker modal ~2960-3029; add load of categories)

**Interfaces:**
- Consumes: `tenantAdminService.getCategories()` (Task 1). Sets `formData.category/categoryAr/categoryKu`.

- [ ] **Step 1: Load managed categories into state** (near other `useState` in the component)

```tsx
const [managedCategories, setManagedCategories] = useState<TenantCategory[]>([]);
useEffect(() => {
  tenantAdminService.getCategories().then(setManagedCategories).catch(() => setManagedCategories([]));
}, []);
```
(Add `import { tenantAdminService, TenantCategory } from '../../services/tenantAdminService';` if not already imported.)

- [ ] **Step 2: Replace the picker body** — swap the `STORE_CATEGORIES.map(...)` block (the modal at ~3005) to iterate `managedCategories`, showing icon + localized name, and on select copy all three name fields:

```tsx
{managedCategories.length === 0 ? (
  <Text allowFontScaling={false} style={{ padding: 20, textAlign: 'center', color: theme.colors.textSecondary }}>
    {t('admin.categories.pickerEmpty', 'No categories yet. Add them in Settings → Categories.')}
  </Text>
) : managedCategories.map((cat) => {
  const label = (i18n.language === 'ar' && cat.nameAr) ? cat.nameAr : (i18n.language === 'ku' && cat.nameKu) ? cat.nameKu : cat.name;
  const isSelected = formData.category === cat.name;
  return (
    <TouchableOpacity key={cat.id || cat.name}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: isSelected ? theme.colors.primary + '15' : 'transparent', borderRadius: 10 }}
      onPress={() => {
        setFormData(prev => ({ ...prev, category: cat.name, categoryAr: cat.nameAr || cat.name, categoryKu: cat.nameKu || cat.name }));
        setCategoryPickerVisible(false);
      }}>
      {cat.imageUrl
        ? <Image source={{ uri: cat.imageUrl }} style={{ width: 32, height: 32, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" />
        : <Ionicons name="cube-outline" size={24} color={theme.colors.textSecondary} />}
      <Text allowFontScaling={false} style={{ flex: 1, color: theme.colors.text, fontWeight: isSelected ? '700' : '500' }}>{label}</Text>
      {isSelected && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
    </TouchableOpacity>
  );
})}
```
Ensure `formData` includes `categoryAr`/`categoryKu` (they already flow to the product on save — see AdminProductsScreen.tsx:536-537). If `formData` has no `categoryAr/categoryKu` keys, add them to the initial form objects (`''`).

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Add/edit a product → open the Category field → it lists your managed categories with icons → pick one → the product saves with that category. If none exist, the empty hint shows.

- [ ] **Step 5: Commit**

```bash
git add src/screens/admin/AdminProductsScreen.tsx
git commit -m "feat(admin): Add Product category picker uses managed categories with icons"
```

---

### Task 4: Customer Categories screen shows uploaded icons

**Files:**
- Modify: `src/screens/CategoriesScreen.tsx` (inject icon lookup)
- Check/Modify (only if it renders category icons from the same guess-map): `src/screens/main/HomeScreen.tsx`

**Interfaces:**
- Consumes: `categoryService.getActiveCategories(tenantId)` (Task 1). `useTenant().tenantId`.

- [ ] **Step 1: Fetch managed categories + build name→imageUrl map** in `CategoriesScreen.tsx`

Add near the other state/effects (the screen already has `tenantId`):
```tsx
import { categoryService } from '../services/categoryService';
// ...
const [iconByName, setIconByName] = useState<Record<string, string>>({});
useEffect(() => {
  if (!tenantId) return;
  categoryService.getActiveCategories(tenantId).then(list => {
    const map: Record<string, string> = {};
    for (const c of list) { if (c.imageUrl) map[c.name] = c.imageUrl; }
    setIconByName(map);
  }).catch(() => {});
}, [tenantId]);
```

- [ ] **Step 2: Use the uploaded image in the tile render.** Where each category tile renders its icon (`getCategoryIcon(categoryName)` / `<Ionicons ...>`), branch on the map:
```tsx
{iconByName[item.name]
  ? <Image source={{ uri: iconByName[item.name] }} style={styles.categoryIconImage} contentFit="cover" cachePolicy="memory-disk" />
  : <Ionicons name={item.icon} size={/* keep existing size */ 28} color={/* keep existing color */ '#fff'} />}
```
Add a style `categoryIconImage: { width: 40, height: 40, borderRadius: 10 }` (match the current icon's box size in this screen).

- [ ] **Step 3: HomeScreen check.** Open `src/screens/main/HomeScreen.tsx`; if it renders a category row using the same hardcoded icon guess (search for `getCategoryIcon`/category icons), apply the same `iconByName` lookup. If it does not render category icons, do nothing and note it.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

As a customer, open Categories. A category that has an uploaded icon shows that image; a category without one shows the previous fallback icon (never blank).

- [ ] **Step 6: Commit**

```bash
git add src/screens/CategoriesScreen.tsx src/screens/main/HomeScreen.tsx
git commit -m "feat(store): customer Categories screen shows uploaded category icons"
```

---

### Task 5: Locale keys (en / ar / ku)

**Files:**
- Modify: `src/locales/en.json`, `src/locales/ar.json`, `src/locales/ku.json`

**Interfaces:** consumes all `t('admin.categories.*')` keys used in Tasks 2–4.

- [ ] **Step 1: Add an `admin.categories` block to each locale** (place inside the existing `admin` object). English:
```json
"categories": {
  "title": "Categories",
  "subtitle": "Manage categories & icons",
  "add": "Add category",
  "edit": "Edit category",
  "name": "Name",
  "nameAr": "Arabic name",
  "nameKu": "Kurdish name",
  "active": "Active",
  "uploadIcon": "Upload icon",
  "uploadError": "Upload failed",
  "nameRequired": "Name is required",
  "saveError": "Could not save",
  "loadError": "Could not load categories",
  "empty": "No categories yet. Tap + to add one.",
  "pickerEmpty": "No categories yet. Add them in Settings → Categories.",
  "deleteTitle": "Delete category",
  "deleteConfirm": "Delete this category? Products keep their current category name."
}
```
Arabic (`ar.json`) — same keys, translated values:
```json
"categories": {
  "title": "التصنيفات",
  "subtitle": "إدارة التصنيفات والأيقونات",
  "add": "إضافة تصنيف",
  "edit": "تعديل التصنيف",
  "name": "الاسم",
  "nameAr": "الاسم بالعربية",
  "nameKu": "الاسم بالكردية",
  "active": "مُفعّل",
  "uploadIcon": "رفع أيقونة",
  "uploadError": "فشل الرفع",
  "nameRequired": "الاسم مطلوب",
  "saveError": "تعذّر الحفظ",
  "loadError": "تعذّر تحميل التصنيفات",
  "empty": "لا توجد تصنيفات بعد. اضغط + للإضافة.",
  "pickerEmpty": "لا توجد تصنيفات. أضِفها من الإعدادات ← التصنيفات.",
  "deleteTitle": "حذف التصنيف",
  "deleteConfirm": "حذف هذا التصنيف؟ ستحتفظ المنتجات باسم تصنيفها الحالي."
}
```
Kurdish (`ku.json`) — same keys, translated values:
```json
"categories": {
  "title": "پۆلەکان",
  "subtitle": "بەڕێوەبردنی پۆل و ئایکۆنەکان",
  "add": "زیادکردنی پۆل",
  "edit": "دەستکاری پۆل",
  "name": "ناو",
  "nameAr": "ناوی عەرەبی",
  "nameKu": "ناوی کوردی",
  "active": "چالاک",
  "uploadIcon": "بارکردنی ئایکۆن",
  "uploadError": "بارکردن سەرکەوتوو نەبوو",
  "nameRequired": "ناو پێویستە",
  "saveError": "نەتوانرا هەڵبگیرێت",
  "loadError": "نەتوانرا پۆلەکان باربکرێن",
  "empty": "هێشتا هیچ پۆلێک نییە. + دابگرە بۆ زیادکردن.",
  "pickerEmpty": "هیچ پۆلێک نییە. لە ڕێکخستن ← پۆلەکان زیادیان بکە.",
  "deleteTitle": "سڕینەوەی پۆل",
  "deleteConfirm": "ئەم پۆلە بسڕدرێتەوە؟ بەرهەمەکان ناوی پۆلی ئێستایان دەمێنێتەوە."
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "['en','ar','ku'].forEach(l=>{JSON.parse(require('fs').readFileSync('src/locales/'+l+'.json','utf8'));console.log(l,'OK')})"`
Expected: `en OK / ar OK / ku OK`.

- [ ] **Step 3: Commit**

```bash
git add src/locales/en.json src/locales/ar.json src/locales/ku.json
git commit -m "i18n(categories): add category-management strings (en/ar/ku)"
```

---

## Final verification (whole feature)

- [ ] `npm run type-check` clean.
- [ ] Admin: Settings → Categories → seeded list → add/edit/delete with icon upload works.
- [ ] Admin: Add Product → category picker shows managed categories + icons; selecting saves the name onto the product.
- [ ] Customer: Categories screen shows uploaded icons, falls back to the old icon when a category has none.
- [ ] Ship reminder: this is app (JS) code — reaches devices via `npm run update:production` (OTA) or a build.

## Self-review notes
- Spec §1 (data/reuse) → Task 1. §2 (admin screen + seed) → Task 2. §3 (product picker) → Task 3. §4 (customer icons) → Task 4. Strings → Task 5. All spec sections covered.
- Types consistent: `TenantCategory` (camelCase) is the single domain type used across service, screen, picker, and customer read; DB mapping isolated in `mapCategory`/`toCategoryRow`.
- No jest tasks: repo has no component-test harness (per Global Constraints); each task gates on `type-check` + explicit manual steps.
