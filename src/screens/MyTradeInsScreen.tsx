// Customer's own list of trade-in requests: what they sent us, and the shop's
// offer once one exists. Modelled on OrdersScreen.tsx — a customer's own list of
// things, each with a status chip — but built as a stack-pushed screen (this
// Stack.Navigator runs with headerShown:false; see FavoritesScreen.tsx and this
// feature's own TradeInRequestScreen.tsx) so it draws its own back-button header
// instead of relying on a tab's native header.
//
// Reached today via TradeInRequestScreen's post-submit `navigation.replace('MyTradeIns')`.
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

import { useTheme } from '../components/ThemeProvider';
import AppText from '../components/AppText';
import AppNumber from '../components/AppNumber';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { useAuthGate } from '../hooks/useAuthGate';
import { useCurrency } from '../contexts/CurrencyContext';
import { tradeInService } from '../services/tradeInService';
import { TradeInRequest, TradeInStatus } from '../types';
import { formatPrice } from '../utils/currency';
import { formatFirestoreDate } from '../utils/dateUtils';
import { getThumbnailUrl } from '../utils/imageUtils';
import { SPACING } from '../constants/theme';

const MyTradeInsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { currency, exchangeRateIQD } = useCurrency();

  // Deep-link guard, same pattern as OrdersScreen and TradeInRequestScreen: a
  // signed-out visitor can reach this route directly (stale nav state, deep link)
  // even though every entry point gates it. Redirect rather than call
  // getMyRequests with no uid / hit RLS with no explanation.
  const { needsAuth } = useAuthGate();
  useEffect(() => {
    if (needsAuth()) {
      // No 'tradeIn' reason exists in LoginGate's reason union (checkout / orders /
      // message / address / payment / profile — useAuthGate.ts, LoginGateScreen.tsx),
      // and 'orders' rendered "Sign in to View Orders / see your order history and
      // track current deliveries" — wrong content for a trade-in. Omitting reason
      // falls through to LoginGateScreen's generic "Sign in Required" default
      // instead of adding a whole new reason variant (plus locale entries in all
      // three languages) for this one call site.
      navigation.navigate('LoginGate');
    }
  }, [needsAuth, navigation]);

  const [requests, setRequests] = useState<TradeInRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Only show the full skeleton spinner on the first cold load; later focus/
  // pull-to-refresh reloads happen silently over the already-rendered list
  // (mirrors OrdersScreen's hasLoadedRef).
  const hasLoadedRef = useRef(false);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const reqIdRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    if (!user?.uid) {
      setRequests([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    const isLatest = () => reqId === reqIdRef.current;
    try {
      if (refresh) {
        setRefreshing(true);
      } else if (!hasLoadedRef.current) {
        setLoading(true);
      }
      const mine = await tradeInService.getMyRequests(user.uid);
      if (!isLatest()) return;
      setRequests(mine);
      hasLoadedRef.current = true;
    } catch (e: any) {
      if (!isLatest()) return;
      Alert.alert(t('common.error'), e?.message || t('errors.unknown'));
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user?.uid, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Synchronous in-flight guard, same rationale as TradeInRequestScreen's
  // submittingRef: disabled={} is async React state and won't block a rage/
  // double-tap that lands before the re-render commits. Keyed per request id
  // (a Set, not one shared boolean) so accepting/declining one row can never
  // block a different row's independent action. Without this, a fast double-tap
  // fires setStatus twice; the second finds no matching row (RLS filters on the
  // OLD status, already moved past 'quoted' by the first call) and shows a
  // spurious "offer no longer available" on a decision the customer just made.
  const respondingRef = useRef<Set<string>>(new Set());

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (respondingRef.current.has(id)) return;
    respondingRef.current.add(id);
    try {
      // setStatus returns false when the update matched no row — RLS filters on the
      // OLD status, so an offer the shop has already withdrawn or completed silently
      // changes nothing. Without this branch the customer is shown a successful
      // "Accepted" for something that did not happen.
      const applied = await tradeInService.setStatus(id, status);
      if (!applied) {
        Alert.alert(t('common.error'), t('tradeIn.offerNoLongerAvailable'));
      }
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('errors.unknown'));
    } finally {
      respondingRef.current.delete(id);
    }
  };

  const getStatusColor = (status: TradeInStatus) => {
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

  const renderItem = ({ item }: { item: TradeInRequest }) => {
    const statusColor = getStatusColor(item.status);
    const photo = item.photos?.[0];
    const title = [item.deviceBrand, item.deviceModel].filter(Boolean).join(' ');

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface },
        ]}
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

          {/* Model + submitted date */}
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
              style={{
                fontSize: 13,
                color: theme.colors.textSecondary,
                marginTop: 2,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {formatFirestoreDate(item.createdAt, i18n.language)}
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

        {item.status === 'quoted' && (
          <View style={[styles.offerBlock, { borderTopColor: theme.colors.border }]}>
            <Text allowFontScaling={false}
              style={[styles.offerLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
            >
              {t('tradeIn.offerReceived')}
            </Text>
            <AppNumber
              value={formatPrice(item.offerUSD || 0, currency, exchangeRateIQD)}
              style={[styles.offerAmount, { color: theme.colors.primary }]}
            />
            {!!item.offerNote && (
              <AppText
                style={[styles.offerNote, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
              >
                {item.offerNote}
              </AppText>
            )}
            <View style={[styles.offerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Button
                title={t('tradeIn.accept')}
                onPress={() => respond(item.id, 'accepted')}
                style={{ flex: 1 }}
              />
              <Button
                title={t('tradeIn.decline')}
                variant="outline"
                onPress={() => respond(item.id, 'declined')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

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
          {t('tradeIn.noRequests')}
        </Text>
      </View>
    );
  }, [loading, theme, t]);

  // Same guard as TradeInRequestScreen: all hooks above still ran, we just render
  // nothing while the redirect effect above navigates a guest away.
  if (!user?.uid) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Profile')}
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
            {t('tradeIn.myRequests')}
          </Text>
        </View>

        {/* GOLDEN TEMPLATE: FlatList as the SINGLE vertical scroll owner */}
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
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
  offerBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  offerLabel: {
    fontSize: 13,
  },
  offerAmount: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  offerNote: {
    fontSize: 13,
    marginTop: SPACING.xs,
  },
  offerActions: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl * 2,
  },
});

export default MyTradeInsScreen;
