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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { promoService, Promo, PromoType } from '../../services/promoService';

// Admin: manage promo codes (percentage / fixed discounts) customers enter at
// checkout. Mirrors AdminBrandManagerScreen; mock-backed (AsyncStorage) so it
// works offline in demo mode. No image/logo — promos are text-only.
const emptyForm = (): Partial<Promo> => ({ code: '', type: 'percentage', value: undefined, minPurchase: undefined, isActive: true });

const AdminPromoManagerScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<Partial<Promo>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setPromos(await promoService.getAll());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(emptyForm()); setModalVisible(true); };
  const openEdit = (p: Promo) => { setForm({ ...p }); setModalVisible(true); };

  // Human-readable discount line: "10% off" / "$5 off" (+ " • min $30").
  const describe = (p: Promo): string => {
    const off = p.type === 'percentage' ? `${p.value}% off` : `$${p.value} off`;
    return p.minPurchase ? `${off} • min $${p.minPurchase}` : off;
  };

  const save = async () => {
    const code = form.code?.trim();
    const value = Number(form.value) || 0;
    if (!code || value <= 0) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('admin.promos.codeRequired', { defaultValue: 'Code and a value are required' })
      );
      return;
    }
    setSaving(true);
    try {
      const min = form.minPurchase != null && String(form.minPurchase) !== '' ? Number(form.minPurchase) : undefined;
      await promoService.save({
        id: form.id,
        code,
        type: (form.type as PromoType) ?? 'percentage',
        value,
        minPurchase: min && min > 0 ? min : undefined,
        isActive: form.isActive ?? true,
        sortOrder: form.sortOrder,
      });
      setModalVisible(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: Promo) => {
    Alert.alert(
      t('admin.promos.deleteTitle', { defaultValue: 'Delete promo code?' }),
      p.code,
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => { await promoService.remove(p.id); await load(); },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Promo }) => (
    <View style={[styles.row, { backgroundColor: theme.colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.codeBox, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
        <Ionicons name="ticket-outline" size={24} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={[styles.code, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{item.code}</Text>
        <Text style={[styles.sub, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{describe(item)}</Text>
        <Text style={[styles.status, { color: item.isActive ? theme.colors.success : theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
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

  const isPercentage = (form.type ?? 'percentage') === 'percentage';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('admin.promos.title', { defaultValue: 'Promo Codes' })}</Text>
        <TouchableOpacity onPress={openAdd} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="add" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={promos}
          renderItem={renderItem}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<View style={styles.center}><Text style={{ color: theme.colors.textSecondary }}>{t('admin.promos.empty', { defaultValue: 'No promo codes yet. Tap + to add one.' })}</Text></View>}
        />
      )}

      {/* Add/Edit modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
              {form.id ? t('admin.promos.edit', { defaultValue: 'Edit Code' }) : t('admin.promos.add', { defaultValue: 'Add Code' })}
            </Text>

            <Text style={[styles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.promos.code', { defaultValue: 'Code' })}</Text>
            <TextInput
              value={form.code}
              onChangeText={code => setForm(f => ({ ...f, code }))}
              autoCapitalize="characters"
              placeholder="e.g. WELCOME10"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
            />

            <Text style={[styles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left', marginTop: 16 }]}>{t('admin.promos.type', { defaultValue: 'Type' })}</Text>
            <View style={[styles.segment, { flexDirection: isRTL ? 'row-reverse' : 'row', borderColor: theme.colors.border }]}>
              <TouchableOpacity
                onPress={() => setForm(f => ({ ...f, type: 'percentage' }))}
                style={[styles.pill, { backgroundColor: isPercentage ? theme.colors.primary : 'transparent' }]}
              >
                <Text style={{ color: isPercentage ? theme.colors.textOnPrimary : theme.colors.text, fontWeight: '600' }}>{t('admin.promos.percentage', { defaultValue: 'Percentage (%)' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setForm(f => ({ ...f, type: 'fixed' }))}
                style={[styles.pill, { backgroundColor: !isPercentage ? theme.colors.primary : 'transparent' }]}
              >
                <Text style={{ color: !isPercentage ? theme.colors.textOnPrimary : theme.colors.text, fontWeight: '600' }}>{t('admin.promos.fixed', { defaultValue: 'Fixed ($)' })}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left', marginTop: 16 }]}>
              {isPercentage ? t('admin.promos.percentOff', { defaultValue: 'Percent off (%)' }) : t('admin.promos.amountOff', { defaultValue: 'Amount off ($)' })}
            </Text>
            <TextInput
              value={form.value != null ? String(form.value) : ''}
              onChangeText={v => setForm(f => ({ ...f, value: v === '' ? undefined : Number(v) }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={theme.colors.placeholder}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
            />

            <Text style={[styles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left', marginTop: 16 }]}>{t('admin.promos.minPurchase', { defaultValue: 'Min purchase ($)' })}</Text>
            <TextInput
              value={form.minPurchase != null ? String(form.minPurchase) : ''}
              onChangeText={v => setForm(f => ({ ...f, minPurchase: v === '' ? undefined : Number(v) }))}
              keyboardType="numeric"
              placeholder="0"
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
  codeBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  code: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  sub: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  actionBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  segment: { borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 },
  pill: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  switchRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  modalActions: { marginTop: 22, gap: 12 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});

export default AdminPromoManagerScreen;
