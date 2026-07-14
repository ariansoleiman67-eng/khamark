import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../../components/ThemeProvider';
import { partnerWholesalePrice } from './partnerInvoice';
import { SPACING } from '../../constants/theme';
import { OWNER_UIDS } from '../../constants/config';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  createTenantAdminService,
  Partner,
  TenantProduct,
  TenantCustomer,
} from '../../services/tenantAdminService';

const ACCENT = '#8B5CF6';
const PROFIT = '#10B981';

const monogram = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name[0].toUpperCase();
};

interface PartnerWithStats extends Partner {
  productCount: number;
  profitPotential: number;
}

export default function AdminPartnerManagementScreen() {
  const { theme, isDark } = useTheme();
  const { tenantId } = useTenant();
  const { isOwner } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [partners, setPartners] = useState<PartnerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Add-partner modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState<TenantCustomer[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const service = createTenantAdminService(tenantId);
      const [partnerList, products, orders] = await Promise.all([
        service.getPartners(),
        service.getAllProducts(),
        service.getOrders(500, 'delivered').catch(() => [] as any[]),
      ]);
      // Units actually SOLD per product (across delivered orders) → realized profit, matching
      // the partner dashboard's "Earned from sales" (grows as items sell, never decreases).
      const soldById = new Map<string, number>();
      for (const o of (orders || [])) {
        for (const it of (((o as any).items as any[]) || [])) {
          if (it?.productId) soldById.set(it.productId, (soldById.get(it.productId) || 0) + (Number(it.quantity) || 0));
        }
      }
      const withStats: PartnerWithStats[] = partnerList.map((p) => {
        const assigned = (products as TenantProduct[]).filter(
          (prod: any) => Array.isArray(prod.coAdminIds) && prod.coAdminIds.includes(p.uid)
        );
        // Realized wholesale profit EARNED = Σ soldUnits × (wholesale − buy).
        const profitPotential = assigned.reduce((sum: number, prod: any) => {
          const margin = partnerWholesalePrice(prod) - (prod.purchasePrice || 0);
          const sold = soldById.get(prod.id) || 0;
          return sum + margin * sold;
        }, 0);
        return { ...p, productCount: assigned.length, profitPotential };
      });
      setPartners(withStats);
    } catch (e) {
      console.error('Failed to load partners:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openPicker = useCallback(async () => {
    if (!tenantId) return;
    setPickerOpen(true);
    setSearch('');
    setUsersLoading(true);
    try {
      // ADMIN users only — a partner must already have their own admin account.
      // Normal customers are never eligible (no silent promotion).
      const admins = await createTenantAdminService(tenantId).getAdminUsers();
      const partnerUids = new Set(partners.map((p) => p.uid));
      const candidates = admins.filter(
        (u) => !OWNER_UIDS.includes(u.uid) && !partnerUids.has(u.uid)
      );
      setUsers(candidates);
    } catch (e) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.partners.loadUsersFailed', { defaultValue: 'Could not load users.' }));
    } finally {
      setUsersLoading(false);
    }
  }, [tenantId, partners, t]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const confirmAdd = useCallback(
    (u: TenantCustomer) => {
      Alert.alert(
        t('admin.partners.confirmAddTitle', { defaultValue: 'Add Partner' }),
        t('admin.partners.confirmAddMsg', {
          name: u.displayName || u.phone || 'this user',
          defaultValue: `Make ${u.displayName || u.phone || 'this admin'} your partner? They'll see the products you share with them. (Only admins can be partners.)`,
        }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('admin.partners.makePartner', { defaultValue: 'Make Partner' }),
            onPress: async () => {
              if (!tenantId) return;
              try {
                setAdding(true);
                await createTenantAdminService(tenantId).addPartner({
                  uid: u.uid,
                  name: u.displayName,
                  phone: u.phone,
                });
                setPickerOpen(false);
                await load();
              } catch (e: any) {
                Alert.alert(
                  t('admin.common.error', { defaultValue: 'Error' }),
                  e?.message || t('admin.partners.addFailed', { defaultValue: 'Could not add partner.' })
                );
              } finally {
                setAdding(false);
              }
            },
          },
        ]
      );
    },
    [tenantId, load, t]
  );

  const confirmRemove = useCallback(
    (p: PartnerWithStats) => {
      Alert.alert(
        t('admin.partners.confirmRemoveTitle', { defaultValue: 'Remove Partner' }),
        t('admin.partners.confirmRemoveMsg', {
          name: p.name || 'this partner',
          defaultValue: `Remove ${p.name || 'this partner'}? The products you shared with them will be unshared. Their own admin account is not affected.`,
        }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('admin.partners.remove', { defaultValue: 'Remove' }),
            style: 'destructive',
            onPress: async () => {
              if (!tenantId) return;
              try {
                setBusyUid(p.uid);
                await createTenantAdminService(tenantId).removePartner(p.uid);
                await load();
              } catch (e: any) {
                Alert.alert(
                  t('admin.common.error', { defaultValue: 'Error' }),
                  e?.message || t('admin.partners.removeFailed', { defaultValue: 'Could not remove partner.' })
                );
              } finally {
                setBusyUid(null);
              }
            },
          },
        ]
      );
    },
    [tenantId, load, t]
  );

  const goAssign = (p: PartnerWithStats) =>
    navigation.navigate('AdminPartnerAssignment', {
      userId: p.uid,
      userName: p.name,
      userEmail: p.email || '',
    });

  // Open this partner's own dashboard (everything shared with them, wholesale prices + profit).
  const goView = (p: PartnerWithStats) =>
    navigation.navigate('AdminPartnerDashboard', { partnerUid: p.uid, partnerName: p.name });

  // Defense-in-depth: the menu entry is owner-gated, but guard the screen too.
  if (!isOwner) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.partners.title', { defaultValue: 'Partner Management' })}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary, marginTop: SPACING.md }]}>
            {t('admin.partners.ownerOnly', { defaultValue: 'Only the store owner can manage partners.' })}
          </Text>
        </View>
      </View>
    );
  }

  const renderPartner = ({ item }: { item: PartnerWithStats }) => (
    <Animated.View entering={FadeInUp.duration(250)}>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, shadowColor: isDark ? '#000' : ACCENT }]}>
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.12)' }]}>
            <Text allowFontScaling={false} style={[styles.avatarText, { color: ACCENT }]}>{monogram(item.name)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text allowFontScaling={false} style={[styles.partnerName, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name || t('admin.partners.unnamed', { defaultValue: 'Partner' })}
            </Text>
            {!!item.phone && (
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={13} color={theme.colors.textSecondary} />
                <Text allowFontScaling={false} style={[styles.phoneText, { color: theme.colors.textSecondary }]} numberOfLines={1}>{item.phone}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => confirmRemove(item)}
            disabled={busyUid === item.uid}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.removeBtn}
          >
            {busyUid === item.uid ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            )}
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: isDark ? 'rgba(139,92,246,0.14)' : 'rgba(139,92,246,0.08)' }]}>
            <Ionicons name="cube-outline" size={15} color={ACCENT} />
            <Text allowFontScaling={false} style={[styles.statText, { color: ACCENT }]}>
              {item.productCount === 1
                ? t('admin.partners.productsCountOne', { defaultValue: '1 product' })
                : t('admin.partners.productsCount', { count: item.productCount, defaultValue: `${item.productCount} products` })}
            </Text>
          </View>
          {item.profitPotential > 0 && (
            <View style={[styles.statChip, { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)' }]}>
              <MaterialIcons name="trending-up" size={15} color={PROFIT} />
              <Text allowFontScaling={false} style={[styles.statText, { color: PROFIT }]}>${item.profitPotential.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtnOutline, { borderColor: theme.colors.primary }]} onPress={() => goView(item)} activeOpacity={0.85}>
            <Ionicons name="eye-outline" size={17} color={theme.colors.primary} />
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.actionText, { color: theme.colors.primary }]}>{t('admin.partners.viewProducts', { defaultValue: 'View' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnSolid} onPress={() => goAssign(item)} activeOpacity={0.85}>
            <LinearGradient colors={['#9D6BFF', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionGradient}>
              <Ionicons name="pricetags-outline" size={17} color="#fff" />
              <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.actionText, { color: '#fff' }]}>{t('admin.partners.manageProducts', { defaultValue: 'Manage Products' })}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.partners.title', { defaultValue: 'Partner Management' })}</Text>
          <Text allowFontScaling={false} style={[styles.headerSubtitle, { color: ACCENT }]}>
            {partners.length === 1
              ? t('admin.partners.subtitleOne', { defaultValue: '1 partner' })
              : t('admin.partners.subtitle', { count: partners.length, defaultValue: `${partners.length} partners` })}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => item.uid}
          renderItem={renderPartner}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <TouchableOpacity activeOpacity={0.9} onPress={openPicker} style={styles.addBtnWrap}>
              <LinearGradient colors={['#9D6BFF', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtn}>
                <Ionicons name="person-add" size={20} color="#fff" />
                <Text allowFontScaling={false} style={styles.addBtnText}>{t('admin.partners.addPartner', { defaultValue: 'Add Partner' })}</Text>
              </LinearGradient>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
                <Ionicons name="people-outline" size={48} color={ACCENT} />
              </View>
              <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>{t('admin.partners.emptyTitle', { defaultValue: 'No Partners Yet' })}</Text>
              <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
                {t('admin.partners.emptySubtitle', { defaultValue: 'Add a partner to share products and create orders for them.' })}
              </Text>
            </View>
          }
        />
      )}

      {/* Add-partner picker modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + SPACING.md }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.colors.text }]}>{t('admin.partners.selectUser', { defaultValue: 'Choose an admin to make partner' })}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { backgroundColor: isDark ? theme.colors.background : '#F0F2F5' }]}>
              <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
              <TextInput allowFontScaling={false}
                value={search}
                onChangeText={setSearch}
                placeholder={t('admin.partners.searchUsers', { defaultValue: 'Search by name or phone' })}
                placeholderTextColor={theme.colors.textSecondary}
                style={[styles.searchInput, { color: theme.colors.text }]}
                autoCorrect={false}
              />
            </View>

            {usersLoading ? (
              <View style={[styles.center, { paddingVertical: 40 }]}>
                <ActivityIndicator size="large" color={ACCENT} />
              </View>
            ) : (
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.uid}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 380 }}
                contentContainerStyle={{ paddingBottom: SPACING.md }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.userRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
                    onPress={() => confirmAdd(item)}
                    disabled={adding}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.userAvatar, { backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.12)' }]}>
                      <Text allowFontScaling={false} style={[styles.avatarText, { color: ACCENT, fontSize: 15 }]}>{monogram(item.displayName || item.phone || '?')}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: SPACING.md }}>
                      <Text allowFontScaling={false} style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.displayName || t('admin.partners.unnamed', { defaultValue: 'Partner' })}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.userMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {item.phone || item.email || '—'}
                      </Text>
                    </View>
                    {item.isSystemAdmin || item.role === 'admin' ? (
                      <View style={[styles.adminBadge, { backgroundColor: ACCENT + '22' }]}>
                        <Text allowFontScaling={false} style={[styles.adminBadgeText, { color: ACCENT }]}>{t('admin.partners.adminBadge', { defaultValue: 'Admin' })}</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={[styles.center, { paddingVertical: 40, paddingHorizontal: SPACING.lg }]}>
                    <Ionicons name="shield-outline" size={36} color={theme.colors.textSecondary} style={{ marginBottom: 10 }} />
                    <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                      {t('admin.partners.noEligibleAdmins', { defaultValue: 'No eligible admins. Only users who already have an admin account can be added as partners.' })}
                    </Text>
                  </View>
                }
              />
            )}
            {adding && (
              <View style={styles.addingOverlay}>
                <ActivityIndicator size="large" color={ACCENT} />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: { padding: 4 },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl },

  addBtnWrap: { marginBottom: SPACING.lg },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 10 },

  card: {
    borderRadius: 20,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.1)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800' },
  partnerName: { fontSize: 17, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  phoneText: { fontSize: 13, marginLeft: 5 },
  removeBtn: { padding: 6, marginLeft: SPACING.sm },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.md, gap: SPACING.sm },
  statChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statText: { fontSize: 13, fontWeight: '700', marginLeft: 5 },

  actionsRow: { flexDirection: 'row', marginTop: SPACING.md, gap: SPACING.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  actionBtnSolid: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  actionBtnOutline: { flex: 1, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11.5, paddingHorizontal: 8 },
  actionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 8 },
  actionText: { fontSize: 14, fontWeight: '700', marginLeft: 7, flexShrink: 1 },

  emptyContainer: { paddingTop: 50, alignItems: 'center', paddingHorizontal: SPACING.xl },
  emptyIconCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: SPACING.sm, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: SPACING.md },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  modalTitle: { fontSize: 17, fontWeight: '700', flex: 1, marginRight: SPACING.sm },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, height: 46, marginBottom: SPACING.sm },
  // Fixed height + zero vertical padding + no font padding stops the Android
  // "text bounces while typing" jitter (text scrolling inside an over-tall input).
  searchInput: { flex: 1, height: 38, marginLeft: 8, fontSize: 15, ...(Platform.OS === 'android' ? { includeFontPadding: false, paddingVertical: 0, textAlignVertical: 'center' as const } : {}) },

  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5 },
  userAvatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '600' },
  userMeta: { fontSize: 13, marginTop: 2 },
  adminBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  adminBadgeText: { fontSize: 11, fontWeight: '700' },

  addingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)', justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
});
