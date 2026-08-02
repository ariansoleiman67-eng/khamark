// Admin detail screen for a single trade-in (sell-your-phone) request — the
// counterpart AdminTradeInsScreen (Task 8) navigates to on row tap, with
// { requestId }. Row structure, status colours, and the tenancy gate below are
// kept deliberately identical to that screen so the two read as one feature.
//
// Full status flow this screen participates in:
//   submitted -> [admin sends a quote here] -> quoted
//     -> [CUSTOMER accepts/declines in MyTradeInsScreen, Task 7] -> accepted/declined
//   accepted -> [admin marks completed once the phone + payment have changed hands] -> completed
// Creating the product listing is a SEPARATE action from marking completed, not a step
// in that transition — it is offered in both 'accepted' and 'completed' (see the two
// independent status checks below, not a single shared one) because "pay the customer,
// then list the phone" is the ordinary order and the button must not disappear the
// moment the deal is marked done.
// The admin never accepts/declines on the customer's behalf — that action, and
// its locale strings (tradeIn.accept / tradeIn.decline), belong only to the
// customer screen.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  I18nManager,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import AppNumber from '../../components/AppNumber';
import Button from '../../components/Button';
import { tradeInService } from '../../services/tradeInService';
import { ProductService } from '../../services/productService';
import { buildListingDraft } from '../../utils/tradeIn';
import { formatPrice } from '../../utils/currency';
import { getRelativeTime } from '../../utils/dateUtils';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { TRADE_IN_QUESTIONS, TradeInQuestion } from '../../constants/tradeInQuestions';
import { TradeInRequest, TradeInStatus } from '../../types';
import { SPACING } from '../../constants/theme';

// Mirrors AdminTradeInsScreen's getStatusColor exactly, for visual continuity
// between the list and this detail screen.
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

const AdminTradeInDetailScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const requestId: string | undefined = route.params?.requestId;

  // GOLDEN_RULES §7: never render, query, or key an admin screen without tenantId.
  const { tenantId } = useTenant();
  const { currency, exchangeRateIQD } = useCurrency();

  const [request, setRequest] = useState<TradeInRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [offerAmount, setOfferAmount] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [sendingQuote, setSendingQuote] = useState(false);
  const [markingCompleted, setMarkingCompleted] = useState(false);

  // What the shop sells this model for new — the comparison the owner asked for.
  // Admin-only: customers see used listings on their own, without a price contrast.
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [newPriceChecked, setNewPriceChecked] = useState(false);

  // Monotonic id so a slow earlier response can't clobber a newer one (tenant
  // switch, or a fast refresh right after an action) — same guard
  // AdminTradeInsScreen uses for its list fetch.
  const reqIdRef = useRef(0);

  // tradeInService has no getById — its committed surface (Task 4) is
  // createRequest / getMyRequests / getTenantRequests / sendQuote / setStatus.
  // Chosen here: fetch the tenant's requests and find this one, rather than
  // adding a narrow getById to the service. getTenantRequests is already
  // tenant-scoped, so a requestId belonging to another shop (or a stale/bad id)
  // simply never appears in `all` and falls through to the not-found branch
  // below for free — a standalone getById would have to re-implement that same
  // tenant_id filter to keep the same safety property. This screen is opened
  // rarely (not a hot path) against what is normally a short per-shop list, the
  // same cost profile AdminTradeInsScreen's list view already pays.
  const load = useCallback(async (refresh = false) => {
    if (!tenantId || !requestId) return;
    const callId = ++reqIdRef.current;
    const isLatest = () => callId === reqIdRef.current;
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const all = await tradeInService.getTenantRequests(tenantId);
      if (!isLatest()) return;
      const found = all.find((r) => r.id === requestId) || null;
      if (!found) {
        // Row genuinely gone, wrong tenant, or a stale id — presenting a blank
        // screen would invite acting on nothing. Same alert+goBack shape as
        // AdminEditStoreLocationScreen's not-found handling.
        Alert.alert(t('admin.common.error'), t('errors.loadingData'));
        navigation.goBack();
        return;
      }
      setRequest(found);
    } catch (e: any) {
      if (!isLatest()) return;
      Alert.alert(t('admin.common.error'), e?.message || t('errors.loadingData'));
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tenantId, requestId, t, navigation]);

  // Clear ALL tenant state on tenant change (GOLDEN_RULES §7), matching
  // AdminTradeInsScreen — a switch cannot show or reuse a previous tenant's row
  // while the new tenant's request is in flight.
  useEffect(() => {
    setRequest(null);
    setLoading(true);
  }, [tenantId]);

  // A missing requestId is a caller bug, not tenantId-still-resolving — surface
  // it once instead of spinning forever (load() no-ops without it).
  useEffect(() => {
    if (!requestId) {
      Alert.alert(t('admin.common.error'), t('errors.loadingData'));
      navigation.goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // What the shop sells this model for new — the comparison the owner asked for.
  useEffect(() => {
    if (!request || !tenantId) return;
    let cancelled = false;
    setNewPrice(null);
    setNewPriceChecked(false);
    (async () => {
      try {
        // searchProducts(searchQuery, filters, tenantId) — productService.ts:219+.
        // tenantId is the THIRD argument; passing it second would silently search
        // every shop's catalogue and could surface another store's price here.
        const matches = await ProductService.searchProducts(request.deviceModel, {}, tenantId);
        if (cancelled) return;
        const newOne = matches.find(
          (p) => (p.condition || 'new') === 'new' &&
                 p.name.toLowerCase().includes(request.deviceModel.toLowerCase())
        );
        setNewPrice(newOne ? newOne.priceUSD : null);
      } catch {
        if (!cancelled) setNewPrice(null);
      } finally {
        if (!cancelled) setNewPriceChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, tenantId]);

  const handleSendQuote = async () => {
    if (!request || !tenantId) return;
    const amount = parseFloat(offerAmount);
    if (!(amount > 0)) {
      Alert.alert(t('admin.common.error'), t('tradeIn.offerAmount'));
      return;
    }
    setSendingQuote(true);
    try {
      // reviewedBy must be the TENANT id: sendQuote scopes its UPDATE with
      // .eq('tenant_id', reviewedBy) as a defence alongside RLS
      // (tradeInService.ts). TenantContext resolves tenantId to the signed-in
      // admin's own uid, so tenantId and a `user.uid` non-null assertion would
      // be the same value here — tenantId is used directly since it is already
      // null-checked above and is the value the service contract documents.
      const ok = await tradeInService.sendQuote(request.id, amount, offerNote, tenantId);
      if (!ok) {
        // THE POINT of this screen's concurrency guard: another admin already
        // quoted this request (sendQuote only matches status='submitted'). Never
        // treat false as success — tell the admin and reload the real state.
        Alert.alert(t('admin.common.error'), t('tradeIn.alreadyQuoted'));
        await load();
        return;
      }
      setOfferAmount('');
      setOfferNote('');
      await load();
    } catch (e: any) {
      Alert.alert(t('admin.common.error'), e?.message || t('common.somethingWentWrong'));
    } finally {
      setSendingQuote(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!request) return;
    setMarkingCompleted(true);
    try {
      const ok = await tradeInService.setStatus(request.id, 'completed');
      if (!ok) {
        // Same false-is-not-success rule as sendQuote: setStatus matched no row
        // (status moved since this screen last loaded). Reuses the exact key
        // MyTradeInsScreen uses for this identical setStatus-returned-false shape.
        Alert.alert(t('admin.common.error'), t('tradeIn.offerNoLongerAvailable'));
        await load();
        return;
      }
      await load();
    } catch (e: any) {
      Alert.alert(t('admin.common.error'), e?.message || t('common.somethingWentWrong'));
    } finally {
      setMarkingCompleted(false);
    }
  };

  const handleCreateListing = () => {
    if (!request) return;
    const draft = buildListingDraft({
      deviceBrand: request.deviceBrand,
      deviceModel: request.deviceModel,
      storage: request.storage,
      photos: request.photos,
    });
    // NOT navigation.navigate('AdminProducts', { prefill: draft }) — AdminProducts is a
    // Tab.Screen nested inside AdminTabNavigator (rendered as this stack's "Main" screen),
    // not a screen of this Stack.Navigator. A bare cross-navigator name only bubbles UP
    // to parent navigators (@react-navigation/core's useOnAction), never down into a child
    // navigator unless the action carries an explicit target — so that call is silently
    // unhandled. AdminStockReportScreen.tsx and ReportsGenerator.tsx hit this exact
    // situation reaching the "AdminOrders" tab and use this same nested { screen, params }
    // form, which AdminTabNavigator's Tab.Navigator picks up via its own route's params
    // (useNavigationBuilder.js watches route.params.screen/params for the nested navigator).
    navigation.navigate('Main', { screen: 'AdminProducts', params: { prefill: draft } });
  };

  const handleCall = () => {
    if (!request?.contactPhone) return;
    Linking.openURL(`tel:${request.contactPhone}`).catch(() => {});
  };

  const renderAnswer = (q: TradeInQuestion) => {
    const raw = request?.answers?.[q.key];
    if (!raw) {
      return (
        <Text allowFontScaling={false} style={[styles.answerText, { color: theme.colors.textSecondary }]}>
          {'—'}
        </Text>
      );
    }
    if (q.type === 'percent') {
      return <AppNumber value={`${raw}%`} style={[styles.answerText, { color: theme.colors.text }]} />;
    }
    const opt = q.options?.find((o) => o.value === raw);
    return (
      <Text allowFontScaling={false} style={[styles.answerText, { color: theme.colors.text }]}>
        {opt ? t(opt.labelKey) : raw}
      </Text>
    );
  };

  // GOLDEN_RULES §7: block the whole screen until tenantId resolves.
  if (!tenantId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const statusColor = request ? getStatusColor(request.status, theme) : theme.colors.textSecondary;
  const title = request ? [request.deviceBrand, request.deviceModel].filter(Boolean).join(' ') : '';
  // Local const so the != null check below narrows cleanly (plain variable
  // narrowing, rather than relying on narrowing through request.offerUSD).
  const offerUSD = request?.offerUSD ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header — mirrors AdminTradeInsScreen's header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminTradeIns'))}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false}
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 18,
              fontWeight: '600',
              color: theme.colors.text,
              marginLeft: isRTL ? 0 : SPACING.md,
              marginRight: isRTL ? SPACING.md : 0,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {title}
          </Text>
          {request ? (
            <View style={[styles.statusChip, { backgroundColor: statusColor + '20' }]}>
              <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: statusColor }}>
                {t(`tradeIn.status.${request.status}`)}
              </Text>
            </View>
          ) : null}
        </View>

        {loading && !request ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : !request ? (
          <View style={styles.centerFill} />
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {/* Single vertical scroll owner for the whole screen. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
              }
            >
              {/* Device */}
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.infoRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                    {t('tradeIn.selectBrand')}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.colors.text }]}>
                    {request.deviceBrand}
                  </Text>
                </View>
                <View style={[styles.infoRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                    {t('tradeIn.selectModel')}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.colors.text }]}>
                    {request.deviceModel}
                  </Text>
                </View>
                {request.storage ? (
                  <View style={[styles.infoRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                      {t('tradeIn.storage')}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.colors.text }]}>
                      {request.storage}
                    </Text>
                  </View>
                ) : null}
                <Text allowFontScaling={false}
                  style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: SPACING.xs, textAlign: isRTL ? 'right' : 'left' }}
                >
                  {getRelativeTime(request.createdAt, i18n.language)}
                </Text>
              </View>

              {/* Photos */}
              {request.photos.length > 0 ? (
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('tradeIn.photos')}
                  </Text>
                  <View style={[styles.photoGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {request.photos.map((uri, idx) => (
                      <View key={`${uri}-${idx}`} style={[styles.photoThumb, { backgroundColor: theme.colors.background }]}>
                        <Image source={{ uri: getThumbnailUrl(uri, 300) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Customer contact */}
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.contactRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="person-circle-outline" size={20} color={theme.colors.text} />
                  <Text allowFontScaling={false}
                    numberOfLines={1}
                    style={[styles.contactText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }]}
                  >
                    {request.contactName}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleCall} style={[styles.contactRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="call-outline" size={20} color={theme.colors.success} />
                  <Text allowFontScaling={false}
                    numberOfLines={1}
                    style={[styles.contactText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }]}
                  >
                    {request.contactPhone}
                  </Text>
                  <View style={[styles.callBadge, { backgroundColor: theme.colors.success + '20' }]}>
                    <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: theme.colors.success }}>
                      {t('common.call')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Customer note */}
              {request.customerNote ? (
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('tradeIn.note')}
                  </Text>
                  <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }}>
                    {request.customerNote}
                  </Text>
                </View>
              ) : null}

              {/* The ten answers. No card header — reusing admin.tradeIn.title (the
                  LIST screen's page title, "Trade-In Requests") here would repeat
                  misleadingly next to this screen's own device-name header, and
                  there is no dedicated section-header key for this block. The ten
                  question labels below make the section self-evident. */}
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                {TRADE_IN_QUESTIONS.map((q) => (
                  <View key={q.key} style={[styles.infoRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text allowFontScaling={false} numberOfLines={2} style={[styles.infoLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left', flexShrink: 1 }]}>
                      {t(q.labelKey)}
                    </Text>
                    {renderAnswer(q)}
                  </View>
                ))}
              </View>

              {/* New-price comparison */}
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.contactRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="pricetag-outline" size={20} color={theme.colors.primary} />
                  {!newPriceChecked ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                      style={{ marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }}
                    />
                  ) : newPrice != null ? (
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.text }}>
                        {t('tradeIn.newPriceLabel')}
                        {'  '}
                      </Text>
                      <AppNumber
                        value={formatPrice(newPrice, currency, exchangeRateIQD)}
                        style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}
                      />
                    </View>
                  ) : (
                    <Text allowFontScaling={false}
                      style={{ fontSize: 14, color: theme.colors.textSecondary, marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }}
                    >
                      {t('tradeIn.notStocked')}
                    </Text>
                  )}
                </View>
              </View>

              {/* Quote form — only while still open to a first quote */}
              {request.status === 'submitted' ? (
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('tradeIn.sendQuote')}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('tradeIn.offerAmount')}
                  </Text>
                  <TextInput allowFontScaling={false}
                    value={offerAmount}
                    onChangeText={setOfferAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textSecondary}
                    editable={!sendingQuote}
                    style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
                  />
                  <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left', marginTop: SPACING.sm }]}>
                    {t('tradeIn.offerNote')}
                  </Text>
                  <TextInput allowFontScaling={false}
                    value={offerNote}
                    onChangeText={setOfferNote}
                    multiline
                    editable={!sendingQuote}
                    style={[styles.input, styles.multilineInput, { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.border, textAlign: isRTL ? 'right' : 'left' }]}
                  />
                  <Button
                    title={t('tradeIn.sendQuote')}
                    onPress={handleSendQuote}
                    loading={sendingQuote}
                    fullWidth
                    style={{ marginTop: SPACING.md }}
                  />
                </View>
              ) : null}

              {/* Read-only quote, once one exists */}
              {offerUSD != null ? (
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('tradeIn.offerReceived')}
                  </Text>
                  <AppNumber
                    value={formatPrice(offerUSD, currency, exchangeRateIQD)}
                    style={{ fontSize: 22, fontWeight: '700', color: theme.colors.primary }}
                    containerStyle={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}
                  />
                  {request.offerNote ? (
                    <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.textSecondary, marginTop: SPACING.xs, textAlign: isRTL ? 'right' : 'left' }}>
                      {request.offerNote}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Mark completed — only while still 'accepted'. There is nothing left to
                  mark once the request is already 'completed', so this one stays on the
                  single condition. Kept as its own block (not shared with Create listing
                  below) precisely so widening one never silently widens the other. */}
              {request.status === 'accepted' ? (
                <Button
                  title={t('tradeIn.markCompleted')}
                  onPress={handleMarkCompleted}
                  loading={markingCompleted}
                  variant="outline"
                  fullWidth
                  style={{ marginBottom: SPACING.sm }}
                />
              ) : null}

              {/* Create listing — deliberately survives past 'accepted' into 'completed',
                  unlike Mark completed above. Marking a trade-in completed (phone and
                  payment have changed hands) and turning it into a product listing are
                  independent admin actions with no fixed order, and "I paid for it, now
                  let me list it" is the ordinary real-world sequence. The two used to
                  share one `status === 'accepted'` condition in a single wrapper, which
                  meant tapping Mark completed first made this button vanish before the
                  admin ever got to use it — losing the whole point of buildListingDraft
                  (not retyping model/storage/photos the trade-in already captured). Do
                  NOT fold this back into one shared condition with Mark completed. */}
              {request.status === 'accepted' || request.status === 'completed' ? (
                <Button
                  title={t('tradeIn.createListing')}
                  onPress={handleCreateListing}
                  variant="primary"
                  fullWidth
                />
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
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
  statusChip: {
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  infoRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: SPACING.sm,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  answerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  photoGrid: {
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  photoThumb: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  contactRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  contactText: {
    fontSize: 14,
    flex: 1,
  },
  callBadge: {
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
});

export default AdminTradeInDetailScreen;
