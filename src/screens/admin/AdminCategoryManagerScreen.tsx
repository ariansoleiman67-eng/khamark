import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { categoryStore, StoredCategory } from '../../services/categoryStore';
import { ImageService } from '../../services/imageService';
import { USE_MOCK_DATA } from '../../services/mockData';

// Admin: manage categories (name + logo) shown as the Categories screen tiles,
// replacing the auto icons. Mock-backed (AsyncStorage) so it works offline.
const emptyForm = (): Partial<StoredCategory> => ({ name: '', logoUrl: undefined, isActive: true });

const AdminCategoryManagerScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [items, setItems] = useState<StoredCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<Partial<StoredCategory>>(emptyForm());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setItems(await categoryStore.getAll());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(emptyForm()); setModalVisible(true); };
  const openEdit = (c: StoredCategory) => { setForm({ ...c }); setModalVisible(true); };

  const pickLogo = async () => {
    setPicking(true);
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;
      let logoUrl = uri;
      if (!USE_MOCK_DATA) {
        const res = await ImageService.uploadImage(uri);
        if (res?.success && res.url) logoUrl = res.url;
      }
      setForm(f => ({ ...f, logoUrl }));
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    if (!form.name?.trim()) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.categoryMgr.nameRequired', { defaultValue: 'Category name is required' }));
      return;
    }
    setSaving(true);
    try {
      await categoryStore.save({ id: form.id, name: form.name.trim(), logoUrl: form.logoUrl, isActive: form.isActive ?? true, sortOrder: form.sortOrder });
      setModalVisible(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: StoredCategory) => {
    Alert.alert(
      t('admin.categoryMgr.deleteTitle', { defaultValue: 'Delete category?' }),
      c.name,
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: async () => { await categoryStore.remove(c.id); await load(); } },
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
        <TouchableOpacity onPress={openAdd} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="add" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<View style={styles.center}><Text style={{ color: theme.colors.textSecondary }}>{t('admin.categoryMgr.empty', { defaultValue: 'No categories yet. Tap + to add one.' })}</Text></View>}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
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
              placeholder="e.g. Chargers"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
            />

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
        </View>
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
  row: { alignItems: 'center', borderRadius: 16, padding: 12, marginBottom: 12 },
  logoBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '80%', height: '80%' },
  logoLetter: { fontSize: 22, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  actionBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  logoPicker: { alignSelf: 'center', width: 120, height: 120, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden' },
  logoPreview: { width: '85%', height: '85%' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  switchRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  modalActions: { marginTop: 22, gap: 12 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});

export default AdminCategoryManagerScreen;
