// Admin inbox of incoming trade-in (sell/swap) requests for this shop, filterable by
// status. Row structure and the status-colour mapping mirror MyTradeInsScreen.tsx
// (Task 7, the customer-facing sibling that lists a customer's OWN requests) so the
// two screens read as one feature.
//
// Tenancy: this app has already shipped three cross-store leaks (brands, promos,
// banners) from admin screens that filtered client-side instead of gating/scoping on
// tenantId. This screen follows GOLDEN_RULES.md §7 literally — block rendering until
// tenantId resolves, pass it into the query, and fold it into the React key so a
// tenant switch can never reuse another shop's rows mid-transition.
//
// Tapping a row navigates to AdminTradeInDetail (Task 9), which does not exist yet —
// the route will dangle exactly as MyTradeIns dangled after Task 6.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  I18nManager,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { tradeInService } from '../../services/tradeInService';
import { TradeInRequest, TradeInStatus } from '../../types';
import { getRelativeTime } from '../../utils/dateUtils';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { SPACING } from '../../constants/theme';

const STATUS_FILTERS: (TradeInStatus | 'all')[] = [
  'all', 'submitted', 'quoted', 'accepted', 'declined', 'completed', 'cancelled',
];

const getStatusColor = (status: TradeInStatus, theme: any): string => {
  switch (status) {
    case 'submitted':
      return theme.colors.warning;
    case 'quoted':
      return theme.colors.primary;
    case 'accepted':
    case 'completed':
      return theme.colors.success;
    case 'declined':
      return theme.colors.error;
    case 'cancelled':
    default:
      return theme.colors.textSecondary;
  }
};

const AdminTradeInsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation<any>();
  // GOLDEN_RULES §7: never render an admin screen without tenantId. useTenant()
  // resolves it synchronously from the admin's own uid but starts null on first
  // render, so this is gated below rather than firing getTenantRequests(null, ...).
  const { tenantId } = useTenant();

  const [requests, setRequests] = useState<TradeInRequest[]>([]);
  const [filter, setFilter] = useState<TradeInStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Only show the full skeleton spinner on the first load for a given tenant; later
  // focus/pull-to-refresh/filter-change reloads happen silently over the
  // already-rendered list (mirrors MyTradeInsScreen's hasLoadedRef).
  const hasLoadedRef = useRef(false);
  // Monotonic request id so a slow earlier response (previous tenant, or a filter the
  // admin has since switched away from) can't overwrite a newer one.
  const reqIdRef = useRef(0);

  // Clear ALL tenant state on tenant change (GOLDEN_RULES §7) so a switch cannot show
  // or reuse a previous tenant's rows while the new tenant's request is in flight.
  useEffect(() => {
    setRequests([]);
    hasLoadedRef.current = false;
    setLoading(true);
  }, [tenantId]);

  const load = useCallback(async (refresh = false) => {
    if (!tenantId) return;
    const reqId = ++reqIdRef.current;
    const isLatest = () => reqId === reqIdRef.current;
    try {
      if (refresh) {
        setRefreshing(true);
      } else if (!hasLoadedRef.current) {
        setLoading(true);
      }
      const data = await tradeInService.getTenantRequests(tenantId, filter === 'all' ? undefined : filter);
      if (!isLatest()) return;
      setRequests(data);
      hasLoadedRef.current = true;
    } catch (e: any) {
      if (!isLatest()) return;
      Alert.alert(t('admin.common.error'), e?.message || t('errors.loadingData'));
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tenantId, filter, t]);

  // Refetch on focus (e.g. returning from the detail screen after quoting/declining
  // a request) AND whenever `load`'s identity changes — which happens when `filter`
  // changes, so tapping a status chip refetches without a separate effect.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const renderFilterChip = useCallback((status: TradeInStatus | 'all') => {
    const active = filter === status;
    const label = status === 'all' ? t('notifications.filter.all') : t(`tradeIn.status.${status}`);
    return (
      <TouchableOpacity
        key={status}
        onPress={() => setFilter(status)}
        activeOpacity={0.7}
        style={[
          styles.filterChip,
          {
            backgroundColor: active ? theme.colors.primary : theme.colors.surface,
            borderColor: active ? theme.colors.primary : theme.colors.border,
          },
        ]}
      >
        <Text allowFontScaling={false}
          numberOfLines={1}
          style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : theme.colors.text }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }, [filter, theme, t]);

  // Filter chips as ListHeaderComponent — NOT a separate scroller — per house rule:
  // one vertical scroll owner per screen. They wrap onto a second line instead of
  // scrolling horizontally, so there is no nested scroll surface at all.
  const renderHeader = useCallback(() => (
    <View style={[styles.filterRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      {STATUS_FILTERS.map(renderFilterChip)}
    </View>
  ), [isRTL, renderFilterChip]);

  const renderItem = useCallback(({ item }: { item: TradeInRequest }) => {
    const statusColor = getStatusColor(item.status, theme);
    const photo = item.photos?.[0];
    const title = [item.deviceBrand, item.deviceModel].filter(Boolean).join(' ');

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AdminTradeInDetail', { requestId: item.id })}
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
          {/* First photo thumbnail */}
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: theme.colors.background,
                marginRight: isRTL ? 0 : SPACING.md,
                marginLeft: isRTL ? SPACING.md : 0,
              },
            ]}
          >
            {photo ? (
              <Image
                source={{ uri: getThumbnailUrl(photo, 160) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="phone-portrait-outline" size={24} color={theme.colors.textSecondary} />
            )}
          </View>

          {/* Model + contact + relative age */}
          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false}
              numberOfLines={1}
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme.colors.text,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {title}
            </Text>
            <Text allowFontScaling={false}
              numberOfLines={1}
              style={{
                fontSize: 13,
                color: theme.colors.textSecondary,
                marginTop: 2,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {item.contactName}
            </Text>
            <Text allowFontScaling={false}
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                marginTop: 2,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {getRelativeTime(item.createdAt, i18n.language)}
            </Text>
          </View>

          {/* Status chip */}
          <View style={[styles.statusChip, { backgroundColor: statusColor + '20' }]}>
            <Text allowFontScaling={false}
              numberOfLines={1}
              style={{ fontSize: 12, fontWeight: '600', color: statusColor }}
            >
              {t(`tradeIn.status.${item.status}`)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [theme, isRTL, navigation, i18n.language, t]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="phone-portrait-outline" size={64} color={theme.colors.textSecondary} />
        <Text allowFontScaling={false}
          style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginTop: SPACING.lg,
            textAlign: 'center',
          }}
        >
          {t('admin.tradeIn.empty', { defaultValue: 'No trade-in requests yet' })}
        </Text>
      </View>
    );
  }, [loading, theme, t]);

  // GOLDEN_RULES §7: block the whole screen until tenantId resolves — never query,
  // key rows, or render admin content against a null tenant.
  if (!tenantId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')}
          >
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: isRTL ? 0 : SPACING.md,
            marginRight: isRTL ? SPACING.md : 0,
          }}>
            {t('admin.tradeIn.title', { defaultValue: 'Trade-In Requests' })}
          </Text>
        </View>

        {/* GOLDEN TEMPLATE: FlatList as the SINGLE vertical scroll owner. Status filter
            chips live in ListHeaderComponent so there is no second scroller. */}
        <FlatList
          data={requests}
          renderItem={renderItem}
          // tenantId folded into the key (GOLDEN_RULES §7) so a tenant switch mid-flight
          // can never let a stale row from the previous shop reuse a React element.
          keyExtractor={(item) => `${tenantId}-${item.id}`}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={{ flexGrow: 1, paddingVertical: SPACING.sm, paddingBottom: SPACING.xl }}
        />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  filterRow: {
    flexWrap: 'wrap',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  filterChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    borderRadius: 12,
    padding: SPACING.md,
  },
  thumb: {
    width: 56,
    aspectRatio: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  statusChip: {
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl * 2,
  },
});

export default AdminTradeInsScreen;
