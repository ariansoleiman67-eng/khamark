import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING } from '../../constants/theme';
import { OWNER_STORE_TENANT_ID } from '../../constants/config';
import { useAuth } from '../../contexts/AuthContext';
import { getAssignedProducts, createTenantAdminService } from '../../services/tenantAdminService';
import { useTranslation } from 'react-i18next';
import { Product } from '../../types';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { sharePartnerInventoryInvoice, partnerEffectiveStock as effectiveStock, partnerWholesalePrice } from './partnerInvoice';

const ACCENT = '#8B5CF6';
const PROFIT = '#10B981';
const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Localized ar-IQ/ku numeric keypads emit Eastern-Arabic (٠-٩) or Persian (۰-۹) digits and the
// Arabic decimal separator (٫); normalize them to ASCII so typed amounts aren't parsed as 0.
const normalizeDigits = (s: string): string =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, '.');

export default function AdminPartnerDashboardScreen() {
  const { theme, isDark } = useTheme();
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // When the OWNER opens this from Partner Management we get a partnerUid param → show THAT
  // partner's shared products. When a partner opens their own home, fall back to their uid.
  const viewUid: string | undefined = route.params?.partnerUid || user?.uid;
  const viewName: string | undefined = route.params?.partnerName;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [realizedProfit, setRealizedProfit] = useState(0);  // wholesale profit EARNED from units sold
  const [soldById, setSoldById] = useState<Map<string, number>>(new Map());  // units sold per shared product
  const [ledger, setLedger] = useState<Array<{ id: string; dir: 'in' | 'out' | 'item'; amount: number; note?: string; at: string; productId?: string; kind?: 'unshare' | 'manual' }>>([]);
  const [moneyModal, setMoneyModal] = useState(false);
  const [moneyDir, setMoneyDir] = useState<'in' | 'out'>('in');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyNote, setMoneyNote] = useState('');
  const [savingMoney, setSavingMoney] = useState(false);
  const savingMoneyRef = useRef(false);                          // synchronous guard (blocks double-tap before setSavingMoney commits)
  const [itemPickerOpen, setItemPickerOpen] = useState(false);   // "pay out via item" picker
  const [savingItem, setSavingItem] = useState(false);           // in-flight guard for item payout
  const savingItemRef = useRef(false);                           // synchronous guard (blocks double-tap before the confirm Alert resolves)
  // The owner reaches this screen WITH a partnerUid param (from Partner Management) → can edit
  // the money ledger. A partner on their own home has no param → read-only.
  const isOwnerViewing = !!route.params?.partnerUid;

  // Inventory totals the partner should know: units, cost (buy value), retail (sell
  // value), and potential profit across all assigned products.
  const totals = useMemo(() => {
    let stock = 0, invested = 0, wholesaleTotal = 0;
    for (const p of products as any[]) {
      const remaining = effectiveStock(p);
      const sold = soldById.get(p.id) || 0;
      const received = remaining + sold;   // all units ever shared — STABLE as stock sells down
      stock += remaining;                  // current on-hand
      invested += (p.purchasePrice || 0) * received;
      wholesaleTotal += partnerWholesalePrice(p) * received;
    }
    return { stock, invested, wholesaleTotal, count: products.length };
  }, [products, soldById]);

  // Money ledger rollups.
  // • Money IN is fresh capital the partner puts in → it ADDS to Total Invested.
  // • Money OUT is a payout of profit → it is drawn from (reduces) Earned, never from the
  //   invested capital, and may not exceed the profit earned from sales so far.
  const ledgerIn = ledger.reduce((s, e) => s + (e.dir === 'in' ? e.amount : 0), 0);
  const ledgerOut = ledger.reduce((s, e) => s + (e.dir === 'out' ? e.amount : 0), 0);
  // Manual "take out this much" item payouts don't un-share (stock unchanged), so they must be
  // subtracted from Total Invested here. Whole-item returns ('unshare') already lowered it via
  // the product leaving totals.invested, so they are NOT subtracted (would double-count).
  // Only count manual draws on products STILL assigned. If a product is later un-shared (its cost
  // leaves totals.invested), an orphaned manual entry for it stops subtracting here too — so Total
  // Invested stays correct even if the ledger cleanup didn't run (self-correcting, not just floored).
  const assignedIds = useMemo(() => new Set((products as any[]).map((p) => p.id)), [products]);
  const ledgerItemManual = ledger.reduce((s, e) => s + ((e.dir === 'item' && e.kind === 'manual' && assignedIds.has(e.productId)) ? e.amount : 0), 0);
  const totalInvested = Math.max(0, totals.invested + ledgerIn - ledgerItemManual);   // product cost + cash in − manual item payouts (never below 0)
  const netEarned = Math.max(0, realizedProfit - ledgerOut); // sales profit kept after payouts, floored at 0
                                                             // (never show a "negative earnings" figure)

  const reloadLedger = async () => {
    const ownerTenant = (products[0] as any)?.tenantId || OWNER_STORE_TENANT_ID;
    if (ownerTenant && viewUid) setLedger(await createTenantAdminService(ownerTenant).getPartnerLedger(viewUid));
  };

  const handleAddMoney = async () => {
    if (savingMoneyRef.current) return;   // synchronous re-entry lock — a 2nd tap bails before the write
    const amt = parseFloat(normalizeDigits(moneyAmount || '').replace(/[^0-9.]/g, '')) || 0;
    const ownerTenant = (products[0] as any)?.tenantId || OWNER_STORE_TENANT_ID;
    if (amt <= 0) {
      Alert.alert(
        t('admin.partnerDashboard.enterAmountTitle', { defaultValue: 'Enter an amount' }),
        t('admin.partnerDashboard.enterAmount', { defaultValue: 'Please enter a valid amount greater than 0.' })
      );
      return;
    }
    if (!viewUid || !ownerTenant) return;
    // A payout can only be drawn from the profit earned so far (not yet paid out).
    if (moneyDir === 'out') {
      const available = realizedProfit - ledgerOut;
      if (amt > available + 0.005) {
        Alert.alert(
          t('admin.partnerDashboard.payoutCapTitle', { defaultValue: 'Not enough earned profit' }),
          t('admin.partnerDashboard.payoutCap', { max: money(Math.max(0, available)), defaultValue: `You can only pay out up to ${money(Math.max(0, available))} — the profit earned from sales so far.` })
        );
        return;
      }
    }
    try {
      savingMoneyRef.current = true;   // claimed synchronously (all code above is sync → no interleave)
      setSavingMoney(true);
      await createTenantAdminService(ownerTenant).addPartnerLedgerEntry(viewUid, { dir: moneyDir, amount: amt, note: moneyNote.trim() });
      await reloadLedger();
      setMoneyModal(false); setMoneyAmount(''); setMoneyNote(''); setMoneyDir('in');
    } catch {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.partnerDashboard.moneyFailed', { defaultValue: 'Could not save the entry.' }));
    } finally {
      savingMoneyRef.current = false;
      setSavingMoney(false);
    }
  };

  const handleDeleteMoney = (e: { id: string; dir: 'in' | 'out' | 'item'; kind?: 'unshare' | 'manual' }) => {
    const ownerTenant = (products[0] as any)?.tenantId || OWNER_STORE_TENANT_ID;
    if (!viewUid || !ownerTenant) return;
    // Deleting a whole-item ('unshare') record only removes the history note — it does NOT re-share
    // the product back to the partner. Make that explicit so the owner isn't surprised.
    const msg = (e.dir === 'item' && e.kind !== 'manual')
      ? t('admin.partnerDashboard.deleteUnshareNote', { defaultValue: 'This only removes the record. It does NOT give the item back to the partner.' })
      : '';
    Alert.alert(
      t('admin.partnerDashboard.deleteEntry', { defaultValue: 'Delete this entry?' }), msg,
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: async () => {
          try { await createTenantAdminService(ownerTenant).deletePartnerLedgerEntry(viewUid, e.id); await reloadLedger(); } catch { /* ignore */ }
        } },
      ]
    );
  };

  const itemReceivedCost = (p: any) => (p?.purchasePrice || 0) * (effectiveStock(p) + (soldById.get(p?.id) || 0));

  // WHOLE-item return: un-share the product → it returns to the owner's revenue/analytics with its
  // full sales history, drops off the partner's list (so Total Invested falls by its cost), and is
  // recorded as an 'item'/'unshare' ledger entry. In-flight guarded against double-tap.
  const handleItemPayout = (p: any) => {
    const ownerTenant = (products[0] as any)?.tenantId || OWNER_STORE_TENANT_ID;
    if (!viewUid || !ownerTenant || savingItem || savingItemRef.current) return;
    savingItemRef.current = true;   // claim synchronously so a 2nd tap can't stack another Alert
    const release = () => { savingItemRef.current = false; };
    const cost = itemReceivedCost(p);
    const doReturn = async () => {
      try {
        setSavingItem(true);
        setItemPickerOpen(false);
        const svc = createTenantAdminService(ownerTenant);
        await svc.unassignProductFromPartner(viewUid, p.id);
        await svc.addPartnerLedgerEntry(viewUid, { dir: 'item', kind: 'unshare', amount: cost, note: p.name || '', productId: p.id });
        await load(true);   // silent reload: item drops off, ledger gains the record (no spinner flash)
      } catch {
        Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.partnerDashboard.itemPayoutFailed', { defaultValue: 'Could not return the item.' }));
      } finally { setSavingItem(false); release(); }
    };
    Alert.alert(
      t('admin.partnerDashboard.itemPayoutTitle', { defaultValue: 'Return the whole item?' }),
      (cost <= 0 ? t('admin.partnerDashboard.itemNoCost', { name: p.name, defaultValue: `"${p.name}" has no buy price set — recorded as $0. ` }) : '') +
      t('admin.partnerDashboard.itemPayoutMsg', { name: p.name, amount: money(cost), defaultValue: `Hand "${p.name}" back to you. It leaves this partner, Total Invested drops by ${money(cost)}, and the item (with its full sales history) returns to your revenue & analytics.` }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel', onPress: release },
        { text: t('admin.partnerDashboard.confirmReturn', { defaultValue: 'Return to me' }), style: 'destructive', onPress: doReturn },
      ],
      { onDismiss: release }
    );
  };

  // Generate the inventory invoice in the chosen language (en / ar / ku-sorani),
  // independent of the current app language.
  const runInvoice = useCallback(async (lang: 'en' | 'ar' | 'ku') => {
    if (!products.length || generating) return;
    setLangPickerOpen(false);
    try {
      setGenerating(true);
      // invoiceSettings (logo/company/contact) live under the OWNER's tenant; the
      // assigned products carry that tenantId. tenant_settings read is public.
      const ownerTenant = (products[0] as any)?.tenantId || OWNER_STORE_TENANT_ID;
      let invoiceSettings: any = null;
      try { invoiceSettings = await createTenantAdminService(ownerTenant).getSettings('invoiceSettings'); } catch {}
      const dateStr = new Date().toLocaleDateString(
        lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ',
        { year: 'numeric', month: 'long', day: 'numeric' }
      );
      const ok = await sharePartnerInventoryInvoice({
        products,
        invoiceSettings,
        // When the owner is viewing a partner, label the invoice with THAT partner's name.
        partnerName: viewName || (user as any)?.fullName || (user as any)?.name || '',
        lang,
        dateStr,
        // Pass the dashboard's exact money figures so the invoice's headline cards MATCH the
        // dashboard (Total Invested / Wholesale Value / Earned), instead of recomputing from
        // current stock only (which omitted sold units + the money ledger).
        totalInvested,
        wholesaleValue: totals.wholesaleTotal,
        earned: netEarned,
      });
      if (!ok) {
        Alert.alert(
          t('admin.common.error', { defaultValue: 'Error' }),
          t('admin.partnerDashboard.invoiceFailed', { defaultValue: 'Could not create the invoice.' })
        );
      }
    } finally {
      setGenerating(false);
    }
  }, [products, generating, user, viewName, t, totalInvested, totals.wholesaleTotal, netEarned]);

  // `silent` skips the full-screen spinner — used by the live poll + pull-to-refresh
  // so the list updates in place (e.g. stock dropping after a sale) without flashing.
  const load = useCallback(async (silent = false) => {
    if (!viewUid) return;
    try {
      if (!silent) setLoading(true);
      const assigned = await getAssignedProducts(viewUid);
      setProducts(assigned as Product[]);
      // Earned profit + units-sold per product, from delivered orders. Recomputed on EVERY
      // load (incl. the live poll) so stock and sold always move together — keeping Total
      // Invested stable as units sell. Best-effort: needs read access to the owner's orders.
      try {
        // Resolve the owner tenant even with ZERO assigned products (e.g. the owner just returned
        // the last item) so the money ledger still loads for reconciliation.
        const ownerTenant = (assigned[0] as any)?.tenantId || (isOwnerViewing ? OWNER_STORE_TENANT_ID : undefined);
        if (ownerTenant) {
          const svc = createTenantAdminService(ownerTenant);
          if (assigned.length) {
            const marginById = new Map((assigned as any[]).map((p) => [p.id, partnerWholesalePrice(p) - (p.purchasePrice || 0)]));
            const sold = new Map<string, number>();
            let earned = 0;
            // Both views use the SAME server-side aggregate (unbounded, tenant-scoped) so the owner
            // and the partner's own dashboard always agree. If the RPC isn't deployed yet (null),
            // the OWNER falls back to reading orders directly; the partner can't (RLS) → shows
            // nothing until it's live. Once deployed, the partner's $0/understated figures are fixed.
            const rows = await svc.getPartnerProductSales(viewUid as string);
            if (rows) {
              for (const r of rows) {
                const m = marginById.get(r.productId);
                if (m == null) continue;
                earned += m * r.unitsSold;
                sold.set(r.productId, r.unitsSold);
              }
            } else if (isOwnerViewing) {
              const orders = await svc.getOrders(500, 'delivered');
              for (const o of (orders || [])) {
                for (const it of (((o as any).items as any[]) || [])) {
                  const m = marginById.get(it.productId);
                  if (m == null) continue;
                  const q = Number(it.quantity) || 0;
                  earned += m * q;
                  sold.set(it.productId, (sold.get(it.productId) || 0) + q);
                }
              }
            }
            setRealizedProfit(earned);
            setSoldById(sold);
          } else {
            setRealizedProfit(0);
            setSoldById(new Map());
          }
          // Money ledger (deposits in / payouts out / returned items) — loads regardless of product count.
          try { setLedger(await svc.getPartnerLedger(viewUid as string)); } catch { /* ignore */ }
        }
      } catch { /* no order-read access (e.g. partner's own view) → leave as-is */ }
    } catch (error) {
      console.error('Failed to load assigned products:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [viewUid]);

  // Live: refetch on focus + poll every 10s while the screen is open, so stock and
  // pricing changes from the main store show up here on their own.
  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(() => load(true), 10000);
      return () => clearInterval(id);
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const renderProductItem = ({ item }: { item: Product; index: number }) => {
    const p: any = item;
    const buyPrice = p.purchasePrice || 0;
    // Wholesale-only view: show the wholesale price + wholesale profit, never per-unit retail.
    const wholesalePrice = partnerWholesalePrice(p);
    const profit = wholesalePrice - buyPrice;
    const profitMargin = buyPrice > 0 ? ((profit / buyPrice) * 100).toFixed(1) : '100';
    const loss = profit < 0;                          // a wholesale tier priced below cost
    const profitColor = loss ? '#EF4444' : PROFIT;

    const stock = effectiveStock(p);
    const totalBuyValue = buyPrice * stock; // cost of all units of this product in stock
    const status = p.status || 'available';
    const isComing = status === 'coming_soon';
    const isOnWay = status === 'on_the_way';
    const isUnavailable = isComing || isOnWay;
    const outOfStock = !isUnavailable && stock <= 0;
    const lowStock = !isUnavailable && stock > 0 && stock <= 5;

    const stockColor = isUnavailable ? '#3B82F6' : outOfStock ? '#EF4444' : lowStock ? '#F59E0B' : PROFIT;
    const stockLabel = isComing
      ? t('admin.partnerDashboard.comingSoon', { defaultValue: 'Coming soon' })
      : isOnWay
      ? t('admin.partnerDashboard.onTheWay', { defaultValue: 'On the way' })
      : outOfStock
      ? t('admin.partnerDashboard.outOfStock', { defaultValue: 'Out of stock' })
      : t('admin.partnerDashboard.inStockUnits', { count: stock, defaultValue: `${stock} in stock` });

    return (
      <Animated.View entering={FadeInUp.duration(220)}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, shadowColor: isDark ? '#000' : ACCENT }]}>
          {/* Header: image + name + part number + category/brand */}
          <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {item.imageUrls && item.imageUrls.length > 0 ? (
              <Image source={{ uri: item.imageUrls[0] }} style={[styles.productImage, isRTL && { marginRight: 0, marginLeft: SPACING.md }]} />
            ) : (
              <View style={[styles.placeholderImage, isRTL && { marginRight: 0, marginLeft: SPACING.md }, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.1)' }]}>
                <Ionicons name="image-outline" size={32} color={theme.colors.textSecondary} />
              </View>
            )}
            <View style={styles.headerText}>
              <Text allowFontScaling={false} style={[styles.productName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={[styles.badge, isRTL && { alignSelf: 'flex-end' }, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
                <Ionicons name="barcode-outline" size={14} color={theme.colors.textSecondary} style={{ marginRight: 4 }} />
                <Text allowFontScaling={false} style={[styles.partNumber, { color: theme.colors.textSecondary }]}>
                  {item.partNumber || 'N/A'}
                </Text>
              </View>
              {!!(p.category || p.brand) && (
                <Text allowFontScaling={false} style={[styles.metaLine, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {[p.brand, p.category].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>

          {/* Live stock pill */}
          <View style={styles.stockRow}>
            <View style={[styles.stockPill, { backgroundColor: stockColor + '1A' }]}>
              <Ionicons
                name={isUnavailable ? 'time-outline' : outOfStock ? 'close-circle-outline' : 'cube-outline'}
                size={15}
                color={stockColor}
              />
              <Text allowFontScaling={false} style={[styles.stockText, { color: stockColor }]}>{stockLabel}</Text>
            </View>
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text allowFontScaling={false} style={styles.liveText}>{t('admin.partnerDashboard.live', { defaultValue: 'Live' })}</Text>
            </View>
          </View>

          {/* In-stock: show total buy value (stock × buy). Incoming (on the way /
              coming soon): the stock isn't owned yet, so show the incoming unit count
              instead of a misleading buy-value total. */}
          <View style={[styles.stockValueRow, { backgroundColor: isUnavailable ? (isDark ? 'rgba(59,130,246,0.14)' : 'rgba(59,130,246,0.08)') : (isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.07)') }]}>
            <View style={styles.stockValueLeft}>
              <Ionicons name={isUnavailable ? 'cube-outline' : 'wallet-outline'} size={16} color={isUnavailable ? '#3B82F6' : '#EF4444'} />
              <Text allowFontScaling={false} style={[styles.stockValueLabel, { color: theme.colors.text }]}>
                {isUnavailable
                  ? t('admin.partnerDashboard.incomingStock', { defaultValue: 'Incoming Stock' })
                  : t('admin.partnerDashboard.totalBuyValue', { defaultValue: 'Total Buy Value' })}
              </Text>
            </View>
            <View style={styles.stockValueRight}>
              {isUnavailable ? (
                <Text allowFontScaling={false} style={[styles.stockValueAmount, { color: '#3B82F6' }]}>{t('admin.partnerDashboard.unitsCount', { count: stock, defaultValue: `${stock} units` })}</Text>
              ) : (
                <>
                  <Text allowFontScaling={false} style={[styles.stockValueAmount, { color: '#EF4444' }]}>${totalBuyValue.toFixed(2)}</Text>
                  <Text allowFontScaling={false} style={[styles.stockValueHint, { color: theme.colors.textSecondary }]}>{stock.toLocaleString('en-US')} × ${buyPrice.toFixed(2)}</Text>
                </>
              )}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />

          {/* Pricing: buy -> wholesale */}
          <View style={styles.pricingRow}>
            <View style={styles.priceColumn}>
              <Text allowFontScaling={false} style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>{t('admin.partnerDashboard.buyPrice', { defaultValue: 'Buy Price' })}</Text>
              <Text allowFontScaling={false} style={[styles.priceValue, { color: theme.colors.text }]}>${buyPrice.toFixed(2)}</Text>
            </View>
            <View style={styles.priceSeparator}>
              <Ionicons name="arrow-forward" size={16} color={theme.colors.textSecondary} />
            </View>
            <View style={styles.priceColumn}>
              <Text allowFontScaling={false} style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>{t('admin.partnerDashboard.wholesalePrice', { defaultValue: 'Wholesale' })}</Text>
              <Text allowFontScaling={false} style={[styles.priceValue, { color: ACCENT }]}>${wholesalePrice.toFixed(2)}</Text>
            </View>
          </View>

          {/* Wholesale profit (turns into a red "loss" if a tier is priced below cost) */}
          <LinearGradient
            colors={loss
              ? (isDark ? ['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.05)'] : ['rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0.05)'])
              : (isDark ? ['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)'] : ['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)'])}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.profitContainer}
          >
            <View style={styles.profitLeft}>
              <MaterialIcons name={loss ? 'trending-down' : 'trending-up'} size={20} color={profitColor} />
              <Text allowFontScaling={false} style={[styles.profitLabel, { color: profitColor }]} numberOfLines={1}>{loss ? t('admin.partnerDashboard.wholesaleLoss', { defaultValue: 'Wholesale Loss' }) : t('admin.partnerDashboard.wholesaleProfit', { defaultValue: 'Wholesale Profit' })}</Text>
            </View>
            <View style={styles.profitRight}>
              <Text allowFontScaling={false} style={[styles.profitAmount, { color: profitColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{loss ? '-' : '+'}${Math.abs(profit).toFixed(2)}</Text>
              <View style={[styles.marginBadge, { backgroundColor: profitColor }]}>
                <Text allowFontScaling={false} style={styles.marginText} numberOfLines={1}>{profitMargin}%</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Premium Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {/* For the owner (reached from Partner Management) this goes back; for a partner —
            whose dashboard IS their root screen — there's nothing behind it, so it logs out
            (avoids the "GO_BACK was not handled" error). */}
        <TouchableOpacity style={styles.backButton} onPress={() => { navigation.canGoBack() ? navigation.goBack() : signOut(); }}>
          <Ionicons name={navigation.canGoBack() ? (isRTL ? 'chevron-forward' : 'chevron-back') : 'log-out-outline'} size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>{viewName || t('admin.partnerDashboard.title', { defaultValue: 'Partner Dashboard' })}</Text>
          <Text allowFontScaling={false} style={[styles.headerSubtitle, { color: ACCENT }]}>{products.length} {t('admin.partnerDashboard.assignedProducts', { defaultValue: 'Assigned Products' })}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        renderItem={renderProductItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} colors={[ACCENT]} />}
        ListHeaderComponent={(products.length > 0 || isOwnerViewing || ledger.length > 0) ? (
          <>
          {products.length > 0 && (
          <LinearGradient colors={['#7C3AED', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
            <View style={styles.sumTopRow}>
              <View>
                <Text allowFontScaling={false} style={styles.sumLabelLight}>{t('admin.partnerDashboard.totalStock', { defaultValue: 'Total Stock' })}</Text>
                <Text allowFontScaling={false} style={styles.sumBigValue}>{totals.stock.toLocaleString('en-US')}</Text>
                <Text allowFontScaling={false} style={styles.sumUnitHint}>{t('admin.partnerDashboard.unitsAcross', { count: totals.count, defaultValue: `units across ${totals.count} products` })}</Text>
              </View>
              <View style={styles.sumProfitChip}>
                <MaterialIcons name="trending-up" size={16} color="#fff" />
                <View style={{ marginLeft: 5 }}>
                  <Text allowFontScaling={false} style={styles.sumProfitText}>{money(netEarned)}</Text>
                  <Text allowFontScaling={false} style={styles.sumProfitChipLabel}>{t('admin.partnerDashboard.profitEarned', { defaultValue: 'Earned from sales' })}</Text>
                </View>
              </View>
            </View>

            <View style={styles.sumTiles}>
              <View style={styles.sumTile}>
                <Text allowFontScaling={false} style={styles.sumTileLabel}>{t('admin.partnerDashboard.totalInvested', { defaultValue: 'Total Invested' })}</Text>
                <Text allowFontScaling={false} style={styles.sumTileValue}>{money(totalInvested)}</Text>
              </View>
              <View style={styles.sumTileDivider} />
              <View style={styles.sumTile}>
                <Text allowFontScaling={false} style={styles.sumTileLabel}>{t('admin.partnerDashboard.wholesaleValue', { defaultValue: 'Wholesale Value' })}</Text>
                <Text allowFontScaling={false} style={styles.sumTileValue}>{money(totals.wholesaleTotal)}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.invoiceBtn} onPress={() => { if (products.length && !generating) setLangPickerOpen(true); }} disabled={generating} activeOpacity={0.85}>
              {generating ? (
                <ActivityIndicator size="small" color="#7C3AED" />
              ) : (
                <>
                  <Ionicons name="document-text" size={18} color="#7C3AED" />
                  <Text allowFontScaling={false} style={styles.invoiceBtnText}>{t('admin.partnerDashboard.generateInvoice', { defaultValue: 'Generate Invoice' })}</Text>
                </>
              )}
            </TouchableOpacity>
          </LinearGradient>
          )}

          {/* Money Account — running cash ledger between you and the partner.
              Stays visible even with 0 products so the owner can reconcile after returning the last item. */}
          {(isOwnerViewing || ledger.length > 0) && (
          <View style={[styles.moneyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.moneyHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text allowFontScaling={false} style={[styles.moneyTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.partnerDashboard.moneyAccount', { defaultValue: 'Money Account' })}</Text>
              {isOwnerViewing && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setItemPickerOpen(true)} style={[styles.moneyItemBtn, { borderColor: ACCENT }]} activeOpacity={0.85}>
                    <Ionicons name="cube-outline" size={15} color={ACCENT} />
                    <Text allowFontScaling={false} style={[styles.moneyItemBtnText, { color: ACCENT }]}>{t('admin.partnerDashboard.payViaItem', { defaultValue: 'Item' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setMoneyDir('in'); setMoneyAmount(''); setMoneyNote(''); setMoneyModal(true); }} style={[styles.moneyAddBtn, { backgroundColor: ACCENT, marginLeft: 6 }]} activeOpacity={0.85}>
                    <Ionicons name="add" size={15} color="#fff" />
                    <Text allowFontScaling={false} style={styles.moneyAddText}>{t('admin.partnerDashboard.addMoney', { defaultValue: 'Add' })}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={[styles.moneyStatsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.moneyStat}>
                <Text allowFontScaling={false} style={[styles.moneyStatLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.partnerDashboard.paidIn', { defaultValue: 'Partner paid in' })}</Text>
                <Text allowFontScaling={false} style={[styles.moneyStatValue, { color: PROFIT, textAlign: isRTL ? 'right' : 'left' }]}>{money(ledgerIn)}</Text>
              </View>
              <View style={styles.moneyStat}>
                <Text allowFontScaling={false} style={[styles.moneyStatLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.partnerDashboard.paidOut', { defaultValue: 'You paid out' })}</Text>
                <Text allowFontScaling={false} style={[styles.moneyStatValue, { color: '#EF4444', textAlign: isRTL ? 'right' : 'left' }]}>{money(ledgerOut)}</Text>
              </View>
            </View>
            {ledger.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.moneyEmpty, { color: theme.colors.textSecondary }]}>{t('admin.partnerDashboard.noEntries', { defaultValue: 'No money entries yet.' })}</Text>
            ) : ledger.map((e) => {
              const isIn = e.dir === 'in';
              const isItem = e.dir === 'item';
              const isManual = isItem && e.kind === 'manual';
              const color = isIn ? PROFIT : isItem ? '#F59E0B' : '#EF4444';
              const icon = isIn ? 'arrow-down' : isManual ? 'cash-outline' : isItem ? 'cube-outline' : 'arrow-up';
              const kindLabel = isManual
                ? ((e as any).qty ? t('admin.partnerDashboard.tookOutUnits', { count: (e as any).qty, defaultValue: `Took out ${(e as any).qty} units` }) : t('admin.partnerDashboard.tookOut', { defaultValue: 'Took out value' }))
                : t('admin.partnerDashboard.returnedItem', { defaultValue: 'Returned item' });
              const label = e.note || (isIn ? t('admin.partnerDashboard.depositLabel', { defaultValue: 'Deposit' }) : isItem ? kindLabel : t('admin.partnerDashboard.payoutLabel', { defaultValue: 'Payout' }));
              return (
                <View key={e.id} style={[styles.moneyEntry, { borderTopColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.moneyDot, { backgroundColor: color + '22' }]}>
                    <Ionicons name={icon as any} size={13} color={color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, marginHorizontal: 8 }}>
                    <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13, textAlign: isRTL ? 'right' : 'left' }} numberOfLines={1}>{label}</Text>
                    <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 11, textAlign: isRTL ? 'right' : 'left' }}>{isItem ? `${kindLabel} · ` : ''}{new Date(e.at).toLocaleDateString()}</Text>
                  </View>
                  <Text allowFontScaling={false} style={{ color, fontWeight: '800', fontSize: 14 }}>{isIn ? '+' : '−'}{money(e.amount)}</Text>
                  {isOwnerViewing && (
                    <TouchableOpacity onPress={() => handleDeleteMoney(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={isRTL ? { marginRight: 10 } : { marginLeft: 10 }}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
          )}
          </>
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
              <Ionicons name="briefcase-outline" size={48} color={ACCENT} />
            </View>
            <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>{t('admin.partnerDashboard.emptyTitle', { defaultValue: 'No Products Assigned' })}</Text>
            <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              {t('admin.partnerDashboard.emptySubtitle', { defaultValue: 'You have not been assigned any products yet. Contact the main administrator.' })}
            </Text>
          </View>
        }
      />

      {/* Add a money entry (owner only) */}
      <Modal visible={moneyModal} transparent animationType="slide" onRequestClose={() => setMoneyModal(false)}>
        <View style={styles.langOverlay}>
          <View style={[styles.langSheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.langHeader}>
              <Ionicons name="wallet-outline" size={20} color={ACCENT} />
              <Text allowFontScaling={false} style={[styles.langTitle, { color: theme.colors.text }]}>{t('admin.partnerDashboard.addMoneyTitle', { defaultValue: 'Add money entry' })}</Text>
            </View>
            <View style={styles.moneyToggle}>
              <TouchableOpacity onPress={() => setMoneyDir('in')} style={[styles.moneyToggleBtn, { borderColor: theme.colors.border }, moneyDir === 'in' && { backgroundColor: PROFIT, borderColor: PROFIT }]}>
                <Text allowFontScaling={false} style={{ color: moneyDir === 'in' ? '#fff' : theme.colors.text, fontWeight: '700' }}>{t('admin.partnerDashboard.moneyIn', { defaultValue: 'Money in' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMoneyDir('out')} style={[styles.moneyToggleBtn, { borderColor: theme.colors.border }, moneyDir === 'out' && { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}>
                <Text allowFontScaling={false} style={{ color: moneyDir === 'out' ? '#fff' : theme.colors.text, fontWeight: '700' }}>{t('admin.partnerDashboard.moneyOut', { defaultValue: 'Money out' })}</Text>
              </TouchableOpacity>
            </View>
            <TextInput allowFontScaling={false} value={moneyAmount} onChangeText={setMoneyAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.colors.textSecondary} style={[styles.moneyInput, { color: theme.colors.text, borderColor: theme.colors.border }]} />
            <TextInput allowFontScaling={false} value={moneyNote} onChangeText={setMoneyNote} placeholder={t('admin.partnerDashboard.noteOptional', { defaultValue: 'Note (optional)' })} placeholderTextColor={theme.colors.textSecondary} style={[styles.moneyNoteInput, { color: theme.colors.text, borderColor: theme.colors.border }]} />
            <View style={styles.moneyModalBtns}>
              <TouchableOpacity onPress={() => setMoneyModal(false)} style={[styles.moneyCancelBtn, { borderColor: theme.colors.border }]}>
                <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '700' }}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddMoney} disabled={savingMoney} style={[styles.moneySaveBtn, { backgroundColor: ACCENT, opacity: savingMoney ? 0.7 : 1 }]}>
                {savingMoney ? <ActivityIndicator color="#fff" /> : <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '800' }}>{t('common.save', { defaultValue: 'Save' })}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pay out via item — hand the WHOLE item back to the owner (owner only) */}
      <Modal visible={itemPickerOpen} transparent animationType="slide" onRequestClose={() => setItemPickerOpen(false)}>
        <View style={styles.langOverlay}>
          <View style={[styles.langSheet, { backgroundColor: theme.colors.surface, maxHeight: '82%' }]}>
            <View style={styles.langHeader}>
              <Ionicons name="cube-outline" size={20} color={ACCENT} />
              <Text allowFontScaling={false} style={[styles.langTitle, { color: theme.colors.text }]}>{t('admin.partnerDashboard.payViaItemTitle', { defaultValue: 'Pay out via an item' })}</Text>
            </View>
            <Text allowFontScaling={false} style={[styles.moneyEmpty, { color: theme.colors.textSecondary, textAlign: 'left', paddingVertical: 0, marginBottom: SPACING.sm }]}>
              {t('admin.partnerDashboard.payViaItemHint', { defaultValue: 'Pick an item to hand back. It leaves this partner and returns to your revenue & analytics, and Total Invested drops by its cost.' })}
            </Text>
            {products.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.moneyEmpty, { color: theme.colors.textSecondary }]}>{t('admin.partnerDashboard.emptyTitle', { defaultValue: 'No Products Assigned' })}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {(products as any[]).map((p) => {
                  const cost = itemReceivedCost(p);
                  return (
                    <TouchableOpacity key={p.id} onPress={() => handleItemPayout(p)} disabled={savingItem} style={[styles.itemRow, { borderTopColor: theme.colors.border, opacity: savingItem ? 0.5 : 1 }]} activeOpacity={0.7}>
                      <View style={[styles.moneyDot, { backgroundColor: '#F59E0B22' }]}>
                        <Ionicons name="arrow-undo" size={15} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, marginHorizontal: 10 }}>
                        <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
                        <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{effectiveStock(p)} {t('admin.partnerDashboard.inStockShort', { defaultValue: 'in stock' })} · {money(cost)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity onPress={() => setItemPickerOpen(false)} style={[styles.sheetGhostBtn, { borderColor: theme.colors.border, marginTop: SPACING.md }]}>
              <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '700' }}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invoice language picker — generate in EN / AR / KU-Sorani on demand */}
      <Modal visible={langPickerOpen} transparent animationType="fade" onRequestClose={() => setLangPickerOpen(false)}>
        <TouchableOpacity style={styles.langOverlay} activeOpacity={1} onPress={() => setLangPickerOpen(false)}>
          <View style={[styles.langSheet, { backgroundColor: theme.colors.surface }]} onStartShouldSetResponder={() => true}>
            <View style={styles.langHeader}>
              <Ionicons name="language" size={20} color={ACCENT} />
              <Text allowFontScaling={false} style={[styles.langTitle, { color: theme.colors.text }]}>{t('admin.partnerDashboard.invoiceLanguage', { defaultValue: 'Invoice language' })}</Text>
            </View>
            {([['en', 'English'], ['ar', 'العربية'], ['ku', 'کوردی سۆرانی']] as const).map(([code, label]) => (
              <TouchableOpacity
                key={code}
                style={[styles.langOption, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                onPress={() => runInvoice(code)}
                activeOpacity={0.7}
              >
                <View style={[styles.langDot, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
                  <Ionicons name="document-text-outline" size={17} color={ACCENT} />
                </View>
                <Text allowFontScaling={false} style={[styles.langOptionText, { color: theme.colors.text }]}>{label}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  summaryCard: {
    borderRadius: 22,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  sumTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sumLabelLight: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sumBigValue: { color: '#fff', fontSize: 38, fontWeight: '900', marginTop: 2, letterSpacing: -1 },
  sumUnitHint: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '500', marginTop: 1 },
  sumProfitChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
  sumProfitText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sumProfitChipLabel: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 9, marginTop: 1 },
  moneyCard: { borderRadius: 16, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md },
  moneyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moneyTitle: { fontSize: 15, fontWeight: '800' },
  moneyAddBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  moneyAddText: { color: '#fff', fontWeight: '700', fontSize: 12.5, marginLeft: 3 },
  moneyItemBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  moneyItemBtnText: { fontWeight: '700', fontSize: 12.5, marginLeft: 3 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2, borderTopWidth: 1 },
  itemActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12 },
  // Full-width, content-height sheet button (NO flex) — for standalone Cancel/Back inside a column
  // sheet, where moneyCancelBtn's flex:1 would stretch it to fill the sheet.
  sheetGhostBtn: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderWidth: 1, borderRadius: 12 },
  moneyStatsRow: { flexDirection: 'row', marginTop: SPACING.sm, marginBottom: 4 },
  moneyStat: { flex: 1 },
  moneyStatLabel: { fontSize: 11, fontWeight: '600' },
  moneyStatValue: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  moneyEmpty: { fontSize: 12.5, paddingVertical: SPACING.sm, textAlign: 'center' },
  moneyEntry: { flexDirection: 'row', alignItems: 'center', paddingTop: SPACING.sm, marginTop: SPACING.sm, borderTopWidth: 1 },
  moneyDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  moneyToggle: { flexDirection: 'row', marginTop: SPACING.md, marginBottom: SPACING.sm },
  moneyToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderRadius: 12, marginHorizontal: 4 },
  moneyInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  moneyNoteInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: SPACING.md },
  moneyModalBtns: { flexDirection: 'row' },
  moneyCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderRadius: 12, marginRight: 6 },
  moneySaveBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, marginLeft: 6 },
  sumTiles: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: SPACING.md,
    marginTop: SPACING.lg,
  },
  sumTile: { flex: 1, alignItems: 'center' },
  sumTileDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  sumTileLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  sumTileValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: SPACING.lg,
  },
  invoiceBtnText: { color: '#7C3AED', fontWeight: '800', fontSize: 15, marginLeft: 8 },
  langOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  langSheet: { width: '100%', maxWidth: 360, borderRadius: 20, padding: SPACING.lg },
  langHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  langTitle: { fontSize: 17, fontWeight: '800', marginLeft: 8 },
  langOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4, borderTopWidth: 0.5 },
  langDot: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  langOptionText: { flex: 1, fontSize: 16, fontWeight: '600' },
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
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  productImage: { width: 80, height: 80, borderRadius: 16, marginRight: SPACING.md },
  placeholderImage: {
    width: 80, height: 80, borderRadius: 16, marginRight: SPACING.md,
    justifyContent: 'center', alignItems: 'center',
  },
  headerText: { flex: 1, justifyContent: 'flex-start', minHeight: 80, paddingVertical: 2 },
  productName: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 5,
  },
  partNumber: { fontSize: 12, fontWeight: '600' },
  metaLine: { fontSize: 12.5, marginTop: 5, fontWeight: '500' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  stockPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  stockText: { fontSize: 13.5, fontWeight: '700', marginLeft: 6 },
  liveTag: { flexDirection: 'row', alignItems: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PROFIT, marginRight: 5 },
  liveText: { fontSize: 11, fontWeight: '700', color: PROFIT, textTransform: 'uppercase', letterSpacing: 0.5 },
  stockValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginTop: SPACING.sm,
  },
  stockValueLeft: { flexDirection: 'row', alignItems: 'center' },
  stockValueLabel: { fontSize: 13.5, fontWeight: '700', marginLeft: 7 },
  stockValueRight: { alignItems: 'flex-end' },
  stockValueAmount: { fontSize: 17, fontWeight: '800' },
  stockValueHint: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  divider: { height: 1, width: '100%', marginVertical: SPACING.md },
  pricingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm, marginBottom: SPACING.md,
  },
  priceColumn: { alignItems: 'center' },
  priceSeparator: { paddingTop: 16 },
  priceLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  priceValue: { fontSize: 18, fontWeight: '800' },
  profitContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, borderRadius: 12,
  },
  profitLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 10 },
  profitLabel: { color: PROFIT, fontWeight: '700', fontSize: 15, marginLeft: 8, flexShrink: 1 },
  profitRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  profitAmount: { color: PROFIT, fontWeight: '800', fontSize: 18, marginRight: 10 },
  marginBadge: { backgroundColor: PROFIT, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  marginText: { color: 'white', fontSize: 12, fontWeight: '700' },
  tiersBox: { marginTop: SPACING.md, borderWidth: 1, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  tiersHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  tiersTitle: { fontSize: 13, fontWeight: '700', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  tierQty: { fontSize: 13.5, fontWeight: '600' },
  tierRight: { flexDirection: 'row', alignItems: 'center' },
  tierPrice: { fontSize: 15, fontWeight: '800' },
  tierProfit: { fontSize: 12.5, fontWeight: '700', color: PROFIT, marginLeft: 8 },
  emptyContainer: { paddingTop: 60, alignItems: 'center', paddingHorizontal: SPACING.xl },
  emptyIconCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: SPACING.sm, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
