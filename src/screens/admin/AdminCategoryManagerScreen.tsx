import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  I18nManager,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { categoryStore, StoredCategory } from '../../services/categoryStore';
// Storefront categories are cached; drop that cache after an edit so shoppers see
// the change immediately instead of waiting for the TTL. (Called from the screen
// rather than categoryStore to avoid a categoryService <-> categoryStore import cycle.)
import { categoryService } from '../../services/categoryService';
import { ImageService } from '../../services/imageService';
import { USE_MOCK_DATA } from '../../services/mockData';
import { sameCategory, suggestCategory } from '../../utils/categoryMatch';

// Admin: manage categories (name + logo) shown as the Categories screen tiles,
// replacing the auto icons. Mock-backed (AsyncStorage) so it works offline.
const emptyForm = (): Partial<StoredCategory> => ({ name: '', logoUrl: undefined, isActive: true });

const AdminCategoryManagerScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { tenantId } = useTenant();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [items, setItems] = useState<StoredCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<Partial<StoredCategory>>(emptyForm());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  // A failed fetch must not look like an empty store — the owner would think
  // their categories were gone and re-create them.
  const [loadFailed, setLoadFailed] = useState(false);
  // The names the shop's products actually use, spellings merged, with counts.
  const [productCats, setProductCats] = useState<Array<{ name: string; count: number }>>([]);

  const load = useCallback(async () => {
    try {
      setLoadFailed(false);
      const [tiles, used] = await Promise.all([
        categoryStore.getAll(tenantId || undefined),
        // Best effort: without it the screen still manages tiles, it just
        // cannot point out names with no tile or suggest spellings.
        categoryStore.productCategoryCounts(tenantId || undefined).catch(() => []),
      ]);
      setItems(tiles);
      setProductCats(used);
    } catch (e) {
      console.warn('[AdminCategoryManager] Failed to load categories', e);
      setItems([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const openAdd = (name = '') => { setForm({ ...emptyForm(), name }); setModalVisible(true); };

  // Names products use that no tile covers (spelling variants count as covered).
  // On a category page these show as bare auto-tiles: no logo, no Arabic or
  // Kurdish name, not in the shop's order. One tap turns them into real ones.
  const unmatched = useMemo(
    () => productCats.filter(pc => !items.some(i => sameCategory(i.name, pc.name))),
    [productCats, items],
  );

  // Autocorrect: the name the products already use that the admin most likely
  // means — "Heatset" -> "Headsets", "Earphones" -> "Earphone". Only product
  // names are offered, so following a suggestion always lands on real products.
  const suggestion = useMemo(() => {
    const typed = form.name || '';
    const s = suggestCategory(typed, productCats.map(p => p.name));
    if (!s || s.trim() === typed.trim()) return null;
    return productCats.find(p => p.name === s) ?? null;
  }, [form.name, productCats]);
  const openEdit = (c: StoredCategory) => { setForm({ ...c }); setModalVisible(true); };

  const pickLogo = async () => {
    setPicking(true);
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;
      if (!USE_MOCK_DATA) {
        // Upload to Supabase Storage and ONLY keep the returned public URL. Never
        // fall back to the local file:// path — that "works" on this device but
        // shows a broken image everywhere else and after the app restarts.
        const res = await ImageService.uploadImage(uri);
        if (!res?.success || !res.url) {
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            res?.error || t('admin.categoryMgr.imageUploadFailed', { defaultValue: 'Image upload failed. Check your connection and try again.' })
          );
          return;
        }
        setForm(f => ({ ...f, logoUrl: res.url }));
      } else {
        setForm(f => ({ ...f, logoUrl: uri }));
      }
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    const name = form.name?.trim();
    if (!name) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.categoryMgr.nameRequired', { defaultValue: 'Category name is required' }));
      return;
    }
    // Storefront tiles are keyed by name, so two categories sharing one name collide
    // into a single tile (and only one logo wins) — reject it here instead.
    // Same category however it is spelled: "Phone" beside "Phones" would be two
    // tiles for one set of products.
    if (items.some(c => c.id !== form.id && sameCategory(c.name, name))) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.categoryMgr.duplicateName', { defaultValue: 'A category with this name already exists' }));
      return;
    }
    setSaving(true);
    try {
      await categoryStore.save({
        id: form.id,
        name,
        logoUrl: form.logoUrl,
        isActive: form.isActive ?? true,
        sortOrder: form.sortOrder,
        tenantId: tenantId || undefined,
      });
      await categoryService.clearCache();
      setModalVisible(false);
      await load();
    } catch (e) {
      // Without this the write failed silently: the sheet stayed open and the admin
      // assumed the category was saved.
      console.warn('[AdminCategoryManager] Failed to save category', e);
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.categoryMgr.saveError', { defaultValue: 'Could not save the category. Please try again.' }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: StoredCategory) => {
    // Products name their category by text, so deleting the tile strands every
    // product in it: they stay in the shop but on no category page. Say so.
    const count = await categoryStore.countProducts(c.name, tenantId || undefined);
    const stranded = count
      ? '\n\n' + t('admin.categoryMgr.deleteHasProducts', {
          count,
          defaultValue: '{{count}} products are in this category. After you delete it they will not show on any category page until you move them to another category.',
        })
      : '';
    Alert.alert(
      t('admin.categoryMgr.deleteTitle', { defaultValue: 'Delete category?' }),
      c.name + stranded,
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: async () => {
          try {
            await categoryStore.remove(c.id);
            await categoryService.clearCache();
            await load();
          } catch (e) {
            // A rejected delete (RLS, network) left the row listed with no feedback.
            console.warn('[AdminCategoryManager] Failed to delete category', e);
            Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.categoryMgr.deleteError', { defaultValue: 'Could not delete the category. Please try again.' }));
          }
        } },
      ]
    );
  };

  const renderItem = ({ item }: { item: StoredCategory }) => (
    <View style={[styles.row, { backgroundColor: theme.colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.logoBox, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
        {item.logoUrl ? (
          <Image source={{ uri: item.logoUrl }} style={styles.logoImg} contentFit="contain" transition={0} />
        ) : (
          <Text style={[styles.logoLetter, { color: theme.colors.primary }]}>{item.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={[styles.name, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.sub, { color: item.isActive ? theme.colors.success : theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
          {item.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.hidden', { defaultValue: 'Hidden' })}
        </Text>
      </View>
      <TouchableOpacity onPress={() => openEdit(item)} hitSlop={8} style={styles.actionBtn}>
        <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => remove(item)} hitSlop={8} style={styles.actionBtn}>
        <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('admin.categoryMgr.title', { defaultValue: 'Categories' })}</Text>
        <TouchableOpacity onPress={() => openAdd()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="add" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : loadFailed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.textSecondary} />
          <Text style={[styles.loadError, { color: theme.colors.textSecondary }]}>
            {t('admin.categoryMgr.loadFailed', { defaultValue: 'Could not load categories. Check your connection and try again.' })}
          </Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={[styles.retryBtn, { backgroundColor: theme.colors.primary }]}>
            <Text style={{ color: theme.colors.textOnPrimary, fontWeight: '700' }}>{t('common.retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            unmatched.length > 0 ? (
              <View style={[styles.unmatchedCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.primary + '40' }]}>
                <Text style={[styles.unmatchedTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('admin.categoryMgr.unmatchedTitle', { defaultValue: 'Used by products, not a category yet' })}
                </Text>
                <Text style={[styles.unmatchedHint, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('admin.categoryMgr.unmatchedHint', { defaultValue: 'Add them so they get your logo, translations and order.' })}
                </Text>
                {unmatched.map(pc => (
                  <View key={pc.name} style={[styles.unmatchedRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.name, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{pc.name}</Text>
                      <Text style={[styles.sub, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                        {t('admin.categoryMgr.productCount', { count: pc.count, defaultValue: '{{count}} products' })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => openAdd(pc.name)}
                      style={[styles.addThisBtn, { backgroundColor: theme.colors.primary }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: theme.colors.textOnPrimary, fontWeight: '700' }}>
                        {t('admin.categoryMgr.addThis', { defaultValue: 'Add' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={<View style={styles.center}><Text style={{ color: theme.colors.textSecondary }}>{t('admin.categoryMgr.empty', { defaultValue: 'No categories yet. Tap + to add one.' })}</Text></View>}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          {/* Scrollable card: the logo picker makes this sheet tall, so on a short
              screen the name field still landed under the keyboard even with the
              KeyboardAvoidingView. Scrolling lets the focused input always come up. */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
              {form.id ? t('admin.categoryMgr.edit', { defaultValue: 'Edit Category' }) : t('admin.categoryMgr.add', { defaultValue: 'Add Category' })}
            </Text>

            <TouchableOpacity onPress={pickLogo} activeOpacity={0.8} style={[styles.logoPicker, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
              {picking ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : form.logoUrl ? (
                <Image source={{ uri: form.logoUrl }} style={styles.logoPreview} contentFit="contain" transition={0} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color={theme.colors.textSecondary} />
                  <Text style={{ color: theme.colors.textSecondary, marginTop: 6, fontSize: 12 }}>{t('admin.categoryMgr.pickLogo', { defaultValue: 'Add logo' })}</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.categoryMgr.name', { defaultValue: 'Category name' })}</Text>
            <TextInput
              value={form.name}
              onChangeText={name => setForm(f => ({ ...f, name }))}
              placeholder={t('admin.categoryMgr.namePlaceholder', { defaultValue: 'e.g. Chargers' })}
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
            />
            {!!suggestion && (
              <TouchableOpacity
                onPress={() => setForm(f => ({ ...f, name: suggestion.name }))}
                style={[styles.suggestion, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.primary + '14' }]}
                accessibilityRole="button"
              >
                <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.suggestionText, { color: theme.colors.primary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                  {t('admin.categoryMgr.didYouMean', { name: suggestion.name, defaultValue: 'Did you mean “{{name}}”?' })}
                  {'  ·  '}
                  {t('admin.categoryMgr.productCount', { count: suggestion.count, defaultValue: '{{count}} products' })}
                </Text>
              </TouchableOpacity>
            )}

            <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={{ color: theme.colors.text }}>{t('admin.active', { defaultValue: 'Active' })}</Text>
              <Switch value={form.isActive ?? true} onValueChange={v => setForm(f => ({ ...f, isActive: v }))} trackColor={{ true: theme.colors.primary }} />
            </View>

            <View style={[styles.modalActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.btn, { backgroundColor: isDark ? theme.colors.surface : '#EDEDED' }]}>
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} disabled={saving} style={[styles.btn, { backgroundColor: theme.colors.primary }]}>
                {saving ? <ActivityIndicator color={theme.colors.textOnPrimary} /> : <Text style={{ color: theme.colors.textOnPrimary, fontWeight: '700' }}>{t('common.save', { defaultValue: 'Save' })}</Text>}
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontWeight: '800', fontSize: 20, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadError: { fontSize: 14, marginTop: 12, marginBottom: 16, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' },
  row: { alignItems: 'center', borderRadius: 16, padding: 12, marginBottom: 12 },
  logoBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '80%', height: '80%' },
  logoLetter: { fontSize: 22, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  actionBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 0 },
  modalScrollContent: { justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  logoPicker: { alignSelf: 'center', width: 120, height: 120, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden' },
  logoPreview: { width: '85%', height: '85%' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  switchRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  suggestion: { alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  suggestionText: { flex: 1, fontSize: 14, fontWeight: '600' },
  unmatchedCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16, gap: 4 },
  unmatchedTitle: { fontSize: 15, fontWeight: '800' },
  unmatchedHint: { fontSize: 13, marginBottom: 6 },
  unmatchedRow: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  addThisBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  modalActions: { marginTop: 22, gap: 12 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});

export default AdminCategoryManagerScreen;
