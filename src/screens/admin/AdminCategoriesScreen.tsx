import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService, TenantCategory } from '../../services/tenantAdminService';
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
    if (!tenantId) { setLoading(false); return; }
    const svc = createTenantAdminService(tenantId);
    try {
      let list = await svc.getCategories();
      // First-run seed: no categories yet -> create one per distinct product category.
      if (list.length === 0) {
        const products = await ProductService.getProductsByTenantId(tenantId);
        const names = Array.from(new Set(
          (products || []).map((p: any) => (p.category || '').trim()).filter(Boolean)
        ));
        for (const name of names) {
          // Seed only the English name; leave Arabic/Kurdish blank so their fields
          // show a placeholder and the admin fills real translations (display falls
          // back to `name` until then).
          try { await svc.addCategory({ name, isActive: true }); } catch {}
        }
        if (names.length) list = await svc.getCategories();
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
    if (!tenantId) return;
    const svc = createTenantAdminService(tenantId);
    setSaving(true);
    try {
      if (editing?.id) await svc.updateCategory(editing.id, form);
      else await svc.addCategory(form);
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
          if (!c.id || !tenantId) return;
          try {
            await createTenantAdminService(tenantId).deleteCategory(c.id);
            setCats(prev => prev.filter(x => x.id !== c.id));
          } catch { Alert.alert(t('common.error', 'Error'), t('admin.categories.saveError', 'Could not save')); }
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
              <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center' }}>{t('admin.categories.empty', 'No categories yet. Tap + to add one.')}</Text>
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

              {(['name', 'nameAr', 'nameKu'] as const).map((k) => {
                const label = t(`admin.categories.${k}`, k === 'name' ? 'Name' : k === 'nameAr' ? 'Arabic name' : 'Kurdish name');
                return (
                  <View key={k} style={{ marginBottom: 12 }}>
                    <Text allowFontScaling={false} style={[styles.fieldLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
                    <TextInput allowFontScaling={false}
                      style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left', marginBottom: 0 }]}
                      placeholder={label}
                      placeholderTextColor={theme.colors.textSecondary}
                      value={(form as any)[k] || ''}
                      onChangeText={(v) => setForm(prev => ({ ...prev, [k]: v }))} />
                  </View>
                );
              })}

              <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text allowFontScaling={false} style={{ color: theme.colors.text }}>{t('admin.categories.active', 'Active')}</Text>
                <Switch value={form.isActive !== false} onValueChange={(v) => setForm(prev => ({ ...prev, isActive: v }))} />
              </View>

              <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.border }]} onPress={() => setModalOpen(false)}>
                  <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '600' }}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color={theme.colors.textOnPrimary} /> : <Text allowFontScaling={false} style={{ color: theme.colors.textOnPrimary, fontWeight: '700' }}>{t('common.save', 'Save')}</Text>}
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
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 15, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 12 },
  switchRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  actions: { gap: 12, marginTop: 4 },
  btn: { alignItems: 'center', borderRadius: 12, flex: 1, paddingVertical: 14 },
});
