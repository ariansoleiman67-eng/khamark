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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { brandService, Brand } from '../../services/brandService';
import { ImageService } from '../../services/imageService';
import { USE_MOCK_DATA } from '../../services/mockData';

// Admin: manage brands (name + logo) shown in the Home "Our Brands" grid,
// replacing the auto letter-icons. Mock-backed (AsyncStorage) so it works offline.
const emptyForm = (): Partial<Brand> => ({ name: '', logoUrl: undefined, isActive: true });

const AdminBrandManagerScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { tenantId } = useTenant();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<Partial<Brand>>(emptyForm());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBrands(await brandService.getAllBrands(tenantId || undefined));
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(emptyForm()); setModalVisible(true); };
  const openEdit = (b: Brand) => { setForm({ ...b }); setModalVisible(true); };

  const pickLogo = async () => {
    setPicking(true);
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;
      let logoUrl = uri;
      if (!USE_MOCK_DATA) {
        const res = await ImageService.uploadImage(uri);
        // Never fall back to the raw local file:// uri: it renders fine on this
        // device so the logo looks saved, but every customer gets a blank tile
        // (and so does the admin once the OS clears its cache).
        if (!res?.success || !res.url) {
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            t('admin.brands.logoUploadFailed', { defaultValue: 'Could not upload the logo. Check your connection and try again.' })
          );
          return;
        }
        logoUrl = res.url;
      }
      setForm(f => ({ ...f, logoUrl }));
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    if (!form.name?.trim()) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.brands.nameRequired', { defaultValue: 'Brand name is required' }));
      return;
    }
    setSaving(true);
    try {
      await brandService.saveBrand({ id: form.id, name: form.name.trim(), logoUrl: form.logoUrl, isActive: form.isActive ?? true, sortOrder: form.sortOrder, tenantId: tenantId || undefined });
      setModalVisible(false);
      await load();
    } catch {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('admin.brands.saveFailed', { defaultValue: 'Could not save. Try again.' })
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = (b: Brand) => {
    Alert.alert(
      t('admin.brands.deleteTitle', { defaultValue: 'Delete brand?' }),
      b.name,
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await brandService.deleteBrand(b.id, tenantId || undefined);
              await load();
            } catch {
              Alert.alert(
                t('common.error', { defaultValue: 'Error' }),
                t('admin.brands.deleteFailed', { defaultValue: 'Could not delete. Try again.' })
              );
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Brand }) => (
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
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('admin.brands.title', { defaultValue: 'Brands' })}</Text>
        <TouchableOpacity onPress={openAdd} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="add" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={brands}
          renderItem={renderItem}
          keyExtractor={b => b.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<View style={styles.center}><Text style={{ color: theme.colors.textSecondary }}>{t('admin.brands.empty', { defaultValue: 'No brands yet. Tap + to add one.' })}</Text></View>}
        />
      )}

      {/* Add/Edit modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
              {form.id ? t('admin.brands.edit', { defaultValue: 'Edit Brand' }) : t('admin.brands.add', { defaultValue: 'Add Brand' })}
            </Text>

            <TouchableOpacity onPress={pickLogo} activeOpacity={0.8} style={[styles.logoPicker, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
              {picking ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : form.logoUrl ? (
                <Image source={{ uri: form.logoUrl }} style={styles.logoPreview} contentFit="contain" transition={0} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color={theme.colors.textSecondary} />
                  <Text style={{ color: theme.colors.textSecondary, marginTop: 6, fontSize: 12 }}>{t('admin.brands.pickLogo', { defaultValue: 'Add logo' })}</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.brands.name', { defaultValue: 'Brand name' })}</Text>
            <TextInput
              value={form.name}
              onChangeText={name => setForm(f => ({ ...f, name }))}
              placeholder="e.g. Samsung"
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

export default AdminBrandManagerScreen;
