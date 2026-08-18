import { supabase, uniqueChannel } from '../../services/supabase';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ActivityIndicator, Alert, Modal, ScrollView, Linking, Platform, Pressable, KeyboardAvoidingView, Image, I18nManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
// FIX: Removed Reanimated imports
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
// NOTE: Marker is lazy-loaded to prevent iOS production crash
// when the native maps module isn't ready at screen mount time.
let _OrdersMarker: any = null;
function getOrdersMarker() {
  if (!_OrdersMarker) {
    try {
      const maps = require('react-native-maps');
      _OrdersMarker = maps.Marker || maps.default?.Marker;
    } catch {
      _OrdersMarker = null;
    }
  }
  return _OrdersMarker;
}
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, LAYOUT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext'; // RESTORED
import { createTenantAdminService } from '../../services/tenantAdminService';
import { findConversationByTenant, createAdminInitiatedConversation, sendMessage } from '../../services/chatService';

import SafeMapView from '../../components/SafeMapView';
import { LiveOrderMap } from '../../components/LiveOrderMap';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Order, OrderStatus, normalizeOrderStatus } from '../../types';
import { InvoiceSettings } from '../../services/tenantAdminService';
import { BRAND, brandContact } from '../../constants/config';
import OrderStatusBadge, { getStatusConfig } from '../../components/OrderStatusBadge';
import { formatPrice, convertUSDToIQD } from '../../utils/currency';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { formatFirestoreDate } from '../../utils/dateUtils';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { LOGO_BASE64 } from '../../constants/logoBase64';
import * as FileSystem from 'expo-file-system/legacy';

// expo-print snapshots the HTML before remote <img> finish downloading, so product
// images came out blank on the invoice. Download each one and inline it as a base64
// data URI (the same trick the logo uses) so it's already embedded when the PDF renders.
// Uses expo-file-system (reliable in RN — fetch().blob()/FileReader is not). Pulls a
// small cropped copy via the wsrv.nl resizer to keep the embedded data tiny (~1KB),
// and falls back to the original URL if the proxy is unreachable.
const fetchImageAsDataUri = async (url: string, index: number): Promise<string | null> => {
  const candidates = [
    `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=120&h=120&fit=cover&output=jpg&q=80`,
    url,
  ];
  const target = `${FileSystem.cacheDirectory}inv_img_${index}.jpg`;
  for (const candidate of candidates) {
    try {
      const { status } = await FileSystem.downloadAsync(candidate, target);
      if (status !== 200) continue;
      const b64 = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.Base64 });
      FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (b64 && b64.length > 100) return `data:image/jpeg;base64,${b64}`;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
};

const ORDER_FILTERS: (OrderStatus | 'all')[] = [
  'all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled_by_store', 'cancelled_by_user'
];

const UPDATE_STATUSES: OrderStatus[] = [
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled_by_store'
];

const MODAL_OVERLAY_COLOR = 'rgba(0,0,0,0.5)';





// Color name to hex mapping for displaying color variant text in actual color
const COLOR_NAME_TO_HEX: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#F44336',
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFEB3B',
  orange: '#FF9800',
  purple: '#9C27B0',
  brown: '#795548',
  gray: '#9E9E9E',
  grey: '#9E9E9E',
  pink: '#E91E63',
  gold: '#FFD700',
  silver: '#C0C0C0',
  beige: '#F5F5DC',
  navy: '#000080',
  maroon: '#800000',
  teal: '#008080',
  cyan: '#00BCD4',
};

const getColorHexAdmin = (colorName: string, isDarkMode: boolean): string | null => {
  const hex = COLOR_NAME_TO_HEX[colorName.trim().toLowerCase()];
  if (!hex) return null;
  if (hex === '#000000' && isDarkMode) return '#CCCCCC';
  if (hex === '#FFFFFF' && !isDarkMode) return '#CCCCCC';
  return hex;
};

const getStatusColor = (status: OrderStatus, t: (key: string) => string): string => {
  return getStatusConfig(status, t).color;
};

const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
  const flow: Record<OrderStatus, OrderStatus | null> = {
    pending: 'confirmed',
    confirmed: 'processing',
    processing: 'shipped',
    shipped: 'delivered',
    delivered: null,
    cancelled: null,
    cancelled_by_store: null,
    cancelled_by_user: null,
  };
  return flow[currentStatus];
};

const AdminOrdersScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { user: propsUser } = useAuth(); // Get current admin user
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';
  const [orders, setOrders] = useState<Order[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, { fullName: string, phone: string, profileImageUrl?: string, role?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<OrderStatus | 'all' | 'unpaid'>('all');
  const listRef = useRef<FlatList<any>>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [messagingCustomer, setMessagingCustomer] = useState(false); // action-scoped: opening the customer chat (must NOT gate the whole screen)
  const [trackingUrl, setTrackingUrl] = useState('');
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [returnModalOpen, setReturnModalOpen] = useState(false);     // return/refund picker
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({}); // item index → qty to return
  const [returning, setReturning] = useState(false);
  const [sortOldestFirst, setSortOldestFirst] = useState(false);      // work the longest-waiting first
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null); // spinner on the card being advanced
  const [serverSearching, setServerSearching] = useState(false);     // "search all orders" (full history) in progress
  const [selectionMode, setSelectionMode] = useState(false);          // bulk multi-select mode
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({}); // accurate full-history tab counts

  // Sync amountPaidInput when selectedOrder changes
  useEffect(() => {
    if (selectedOrder) {
      const isIQD = selectedOrder.currency === 'IQD';
      const paidUSD = selectedOrder.amountPaidUSD || 0;
      if (isIQD && selectedOrder.exchangeRate) {
        setAmountPaidInput(String(convertUSDToIQD(paidUSD, selectedOrder.exchangeRate)));
      } else {
        setAmountPaidInput(String(paidUSD));
      }
    } else {
      setAmountPaidInput('');
    }
  }, [selectedOrder]);

  // Auto-open order detail when navigated with orderId param (from unpaid orders modal)
  useEffect(() => {
    const incomingOrderId = route.params?.orderId;
    if (incomingOrderId && orders.length > 0 && !loading) {
      const matchedOrder = orders.find(o => o.id === incomingOrderId);
      if (matchedOrder) {
        setSelectedOrder(matchedOrder);
        setTrackingUrl(matchedOrder.trackingUrl || '');
        setModalVisible(true);
        // Clear the param so it doesn't re-trigger
        navigation.setParams({ orderId: undefined } as any);
      }
    }
  }, [route.params?.orderId, orders, loading]);

  // Tapping the Orders tab while it shows the "waiting" badge deep-links here with a
  // focusPending stamp — jump to the Pending filter and scroll to the top so the
  // waiting orders are immediately in view.
  useEffect(() => {
    if (route.params?.focusPending) {
      // Keep the All view on open; just scroll to top (was forcing Pending).
      requestAnimationFrame(() => {
        try { listRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch { /* list not ready */ }
      });
      navigation.setParams({ focusPending: undefined } as any);
    }
  }, [route.params?.focusPending]);

  const handleUpdateAmountPaid = async () => {
    if (!tenantId || !selectedOrder || !propsUser?.uid) return;
    if (orderWriteRef.current) return;
    orderWriteRef.current = true;
    try {
      const isIQD = selectedOrder.currency === 'IQD';
      const inputVal = parseFloat(amountPaidInput) || 0;
      // Overpayment was rejected below but there was no lower bound, so a pasted or
      // typed "-500" went through: amount_paid_usd went negative and remainingOf's
      // `total - (-500)` then INFLATED the outstanding balance by 500 across the
      // Unpaid tab, the cash-owed tile and the invoice's Remaining Due.
      if (!Number.isFinite(inputVal) || inputVal < 0) {
        Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.orders.invalidAmountPaid', { defaultValue: 'Enter a valid, non-negative amount.' }));
        return;
      }
      let newAmountUSD = inputVal;

      if (isIQD && selectedOrder.exchangeRate) {
        // Check if user exactly paid the full formatted IQD total
        const totalNative = convertUSDToIQD(selectedOrder.totalUSD || 0, selectedOrder.exchangeRate);
        if (inputVal === totalNative) {
          newAmountUSD = selectedOrder.totalUSD || 0; // Prevent float overflow rejection
        } else {
          newAmountUSD = inputVal / selectedOrder.exchangeRate;
          newAmountUSD = Math.round(newAmountUSD * 100) / 100;
        }
      } else {
        newAmountUSD = Math.round(newAmountUSD * 100) / 100;
      }

      // Block overpayment. The totalUSD is the source of truth.
      const totalUSD = selectedOrder.totalUSD || 0;
      if (newAmountUSD > totalUSD) {
        Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.orders.overpayment', { defaultValue: 'Amount paid cannot exceed the total order amount.' }));
        return;
      }

      setUpdating(true);
      const service = createTenantAdminService(tenantId);
      await service.updateOrderAmountPaid(selectedOrder.id, newAmountUSD, propsUser.uid);

      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id ? { ...o, amountPaidUSD: newAmountUSD } : o
      ));
      setSelectedOrder(prev => prev ? { ...prev, amountPaidUSD: newAmountUSD } : null);
      Alert.alert(t('admin.common.success'), t('admin.orders.paymentUpdated', { defaultValue: 'Payment updated successfully' }));
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.orders.updatePaymentFailed', { defaultValue: 'Failed to update payment status' }));
    } finally {
      setUpdating(false);
      orderWriteRef.current = false;
    }
  };

  // Process a return/refund: restock the chosen units + lower the order total/paid.
  const handleConfirmReturn = async () => {
    if (!tenantId || !selectedOrder) return;
    // returnOrderItems is the one explicitly non-idempotent write here: it restocks,
    // reduces line quantities and lowers total/amount_paid. Two same-frame taps both
    // pass validation and both restock.
    if (orderWriteRef.current) return;
    const orderItems = (selectedOrder.items || []) as any[];
    const returns = orderItems.map((it, i) => ({
      index: i,
      productId: it.productId,
      variationId: it.variationId,
      quantity: Math.min(returnQtys[i] || 0, it.quantity || 0),
      priceUSD: it.priceUSD || 0,
    })).filter(r => r.quantity > 0);
    if (!returns.length) return;
    orderWriteRef.current = true;
    try {
      setReturning(true);
      const service = createTenantAdminService(tenantId);
      const { refundUSD } = await service.returnOrderItems(selectedOrder.id, returns);
      setReturnModalOpen(false);
      setReturnQtys({});
      setModalVisible(false);
      await loadOrders();
      Alert.alert(
        t('admin.orders.returnDone', { defaultValue: 'Return processed' }),
        t('admin.orders.returnDoneMsg', { amount: `$${refundUSD.toFixed(2)}`, defaultValue: `Items restocked and $${refundUSD.toFixed(2)} refunded.` }),
      );
    } catch (e: any) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), e?.message || 'Failed to process return');
    } finally {
      setReturning(false);
      orderWriteRef.current = false;
    }
  };

  const handleMarkAsPaidInFull = async () => {
    if (!tenantId || !selectedOrder || !propsUser?.uid) return;
    try {
      setUpdating(true);
      const newAmountUSD = selectedOrder.totalUSD || 0;
      const service = createTenantAdminService(tenantId);
      await service.updateOrderAmountPaid(selectedOrder.id, newAmountUSD, propsUser.uid);

      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id ? { ...o, amountPaidUSD: newAmountUSD } : o
      ));
      setSelectedOrder(prev => prev ? { ...prev, amountPaidUSD: newAmountUSD } : null);
      Alert.alert(t('admin.common.success', { defaultValue: 'Success' }), t('admin.orders.markedPaidInFull', { defaultValue: 'Order marked as paid in full' }));
    } catch (error) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.orders.updatePaymentFailed', { defaultValue: 'Failed to update payment status' }));
    } finally {
      setUpdating(false);
    }
  };

  // Map modal state
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
    title: string;
  } | null>(null);

  // Invoice settings (loaded from Firestore)
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);

  // Load invoice settings on mount
  useEffect(() => {
    if (!tenantId) return;
    const loadInvoiceSettings = async () => {
      try {
        const service = createTenantAdminService(tenantId);
        const data = await service.getSettings('invoiceSettings') as InvoiceSettings | null;
        if (data) setInvoiceSettings(data);
      } catch (err) {
        // silently fail - will use defaults
      }
    };
    loadInvoiceSettings();
  }, [tenantId]);

  // Customer profile photo
  const [customerPhotoUrl, setCustomerPhotoUrl] = useState<string | null>(null);

  // Fetch customer photo when order is selected
  useEffect(() => {
    const fetchCustomerPhoto = async () => {
      if (selectedOrder?.userId) {
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('profile_image_url')
            .eq('id', selectedOrder.userId)
            .maybeSingle();
          setCustomerPhotoUrl(userData?.profile_image_url || null);
        } catch (error) {
          setCustomerPhotoUrl(null);
        }
      } else {
        setCustomerPhotoUrl(null);
      }
    };
    fetchCustomerPhoto();
  }, [selectedOrder?.userId]);

  const loadOrders = useCallback(async () => {
    if (!tenantId) {
      if (!tenantLoading) {
        setLoading(false);
      }
      return;
    }

    try {
      const service = createTenantAdminService(tenantId);
      // The latest 100 orders, PLUS every pending order. Pending orders pile up if never
      // actioned and can be far older than the latest 100 — the Orders-tab badge counts
      // ALL pending, so without this an old pending order is unreachable in the list and
      // the badge can never be cleared. Merge + dedupe (a recent pending appears in both).
      const [ordersData, pendingData] = await Promise.all([
        service.getAllOrders(100),
        service.getOrders(500, 'pending'),
      ]);
      const byId = new Map<string, any>();
      [...(ordersData as any[]), ...(pendingData as any[])].forEach((o) => byId.set(o.id, o));
      // Normalize legacy 'cancelled' status to 'cancelled_by_store', then sort newest-first
      // (merging the two fetches can interleave dates).
      const normalizedOrders = (Array.from(byId.values()) as any as Order[])
        .map(order => ({ ...order, status: normalizeOrderStatus(order.status) }))
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      // In-store sales live on their own screen; the regular Orders screen hides them.
      const isInStoreView = route.params?.source === 'in-store';
      const visibleOrders = normalizedOrders.filter((o: any) =>
        isInStoreView ? o.source === 'in-store' : o.source !== 'in-store');
      setOrders(visibleOrders);

      // Accurate tab-badge counts across the WHOLE history (not just the loaded window).
      service.getOrderCounts(isInStoreView).then(setOrderCounts).catch(() => {});

      // Fetch latest user details to show updated names
      const uniqueUserIds = [...new Set(normalizedOrders.map((o: Order) => o.userId).filter(Boolean))] as string[];
      const newUsersMap: Record<string, { fullName: string, phone: string, profileImageUrl?: string, role?: string }> = {};

      try {
        if (uniqueUserIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, full_name, phone, profile_image_url, role')
            .in('id', uniqueUserIds);
          (usersData || []).forEach((u) => {
            newUsersMap[u.id] = {
              fullName: u.full_name || '',
              phone: u.phone || '',
              profileImageUrl: u.profile_image_url || '',
              role: u.role || 'customer',
            };
          });
        }
        setUsersMap(newUsersMap);
      } catch (e) {
        console.error("Failed to fetch user profiles", e);
      }
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.orders.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, tenantLoading]);

  useEffect(() => {
    if (!tenantLoading) {
      loadOrders();
    }
  }, [loadOrders, tenantLoading]);

  // The tab badges count the WHOLE history, but loadOrders only pulls the newest 100 (+ pending),
  // so older orders of a status (e.g. cancelled) weren't in the list — the badge said 4 but the
  // list was empty. When a specific status tab is selected, fetch that status server-side and
  // merge it in, so the list matches the badge for any status.
  useEffect(() => {
    if (!tenantId || selectedFilter === 'all' || selectedFilter === 'unpaid') return;
    let stale = false;
    (async () => {
      try {
        const statusOrders = await createTenantAdminService(tenantId).getOrders(500, selectedFilter);
        if (stale || !statusOrders?.length) return;
        const isInStoreView = route.params?.source === 'in-store';
        setOrders((prev) => {
          const byId = new Map<string, any>((prev as any[]).map((o) => [o.id, o]));
          (statusOrders as any[])
            .map((o) => ({ ...o, status: normalizeOrderStatus(o.status) }))
            .filter((o) => (isInStoreView ? o.source === 'in-store' : o.source !== 'in-store'))
            .forEach((o) => byId.set(o.id, o));
          return (Array.from(byId.values()) as any[]).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      } catch { /* keep the already-loaded list */ }
    })();
    return () => { stale = true; };
  }, [selectedFilter, tenantId]);

  // Live updates: re-pull when any order in this tenant changes, so new orders and status
  // changes appear without pull-to-refresh. Requires the orders table in the
  // supabase_realtime publication (one-time SQL provided separately); harmless otherwise.
  useEffect(() => {
    if (!tenantId) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = uniqueChannel(`orders_admin_${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => { loadOrders(); }, 700); // debounce bursts of changes
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [tenantId, loadOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  // Search the FULL order history on demand — for an order older than the loaded window
  // (the latest 100 + pending). Merges any matches into the list so they become reachable.
  const runServerSearch = useCallback(async () => {
    if (!tenantId || !searchQuery.trim()) return;
    setServerSearching(true);
    try {
      const found = await createTenantAdminService(tenantId).searchOrders(searchQuery.trim());
      const normalized = (found as any as Order[])
        .map(o => ({ ...o, status: normalizeOrderStatus(o.status) }))
        .filter((o: any) => (route.params?.source === 'in-store' ? o.source === 'in-store' : o.source !== 'in-store'));
      if (!normalized.length) {
        Alert.alert(t('admin.orders.noSearchResults', { query: searchQuery, defaultValue: `No results for "${searchQuery}"` }));
        return;
      }
      setOrders(prev => {
        const byId = new Map<string, Order>();
        [...prev, ...normalized].forEach(o => byId.set(o.id, o));
        return Array.from(byId.values());
      });
      const ids = [...new Set(normalized.map((o: any) => o.userId).filter(Boolean))] as string[];
      const missing = ids.filter(id => !usersMap[id]);
      if (missing.length) {
        const { data } = await supabase.from('users').select('id, full_name, phone, profile_image_url, role').in('id', missing);
        if (data?.length) {
          setUsersMap(prev => {
            const n = { ...prev };
            data.forEach((u: any) => { n[u.id] = { fullName: u.full_name || '', phone: u.phone || '', profileImageUrl: u.profile_image_url || '', role: u.role || 'customer' }; });
            return n;
          });
        }
      }
    } catch (e) {
      Alert.alert(t('admin.common.error'), t('admin.orders.failedToLoad'));
    } finally {
      setServerSearching(false);
    }
  }, [tenantId, searchQuery, usersMap, route.params?.source, t]);

  // Pull ALL delivered-but-unpaid orders (any age) when the Unpaid filter is opened, so old
  // receivables outside the loaded window still surface. Merges into the list.
  const loadUnpaid = useCallback(async () => {
    if (!tenantId) return;
    try {
      const delivered = await createTenantAdminService(tenantId).getOrders(500, 'delivered');
      const unpaid = (delivered as any as Order[])
        .map(o => ({ ...o, status: normalizeOrderStatus(o.status) }))
        .filter((o: any) => (route.params?.source === 'in-store' ? o.source === 'in-store' : o.source !== 'in-store'))
        .filter((o: any) => Math.max(0, (o.totalUSD || 0) - (o.amountPaidUSD || 0)) > 0.01);
      if (!unpaid.length) return;
      setOrders(prev => {
        const m = new Map<string, Order>();
        [...prev, ...unpaid].forEach(o => m.set(o.id, o));
        return Array.from(m.values());
      });
      const ids = [...new Set(unpaid.map((o: any) => o.userId).filter(Boolean))] as string[];
      const missing = ids.filter(id => !usersMap[id]);
      if (missing.length) {
        const { data } = await supabase.from('users').select('id, full_name, phone, profile_image_url, role').in('id', missing);
        if (data?.length) {
          setUsersMap(prev => {
            const n = { ...prev };
            data.forEach((u: any) => { n[u.id] = { fullName: u.full_name || '', phone: u.phone || '', profileImageUrl: u.profile_image_url || '', role: u.role || 'customer' }; });
            return n;
          });
        }
      }
    } catch (e) { console.error('loadUnpaid error', e); }
  }, [tenantId, route.params?.source, usersMap]);

  // Bulk-set status on every selected order (a real courier-run dispatch: mark many
  // Shipped/Delivered at once) — confirmed, then applied in parallel.
  const bulkSetStatus = useCallback((newStatus: OrderStatus) => {
    const ids = Array.from(selectedIds);
    if (!tenantId || !ids.length) return;
    Alert.alert(
      t('admin.orders.bulkConfirmTitle', { defaultValue: 'Update orders' }),
      t('admin.orders.bulkConfirmMsg', { count: ids.length, status: getStatusConfig(newStatus, t).text, defaultValue: `Mark ${ids.length} orders as ${getStatusConfig(newStatus, t).text}?` }),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        { text: t('admin.common.update'), onPress: async () => {
          setBulkUpdating(true);
          try {
            const service = createTenantAdminService(tenantId);
            await Promise.all(ids.map(id => service.updateOrderStatus(id, newStatus as any, undefined, 'admin').catch(() => {})));
            setOrders(prev => prev.map(o => (ids.includes(o.id) ? { ...o, status: newStatus } : o)));
            setSelectionMode(false);
            setSelectedIds(new Set());
            Alert.alert(t('admin.common.success'), t('admin.orders.bulkDone', { count: ids.length, defaultValue: `Updated ${ids.length} orders` }));
          } catch {
            Alert.alert(t('admin.common.error'), t('admin.orders.statusUpdateFailed'));
          } finally {
            setBulkUpdating(false);
          }
        } },
      ]
    );
  }, [selectedIds, tenantId, t]);

  const handleStatusUpdate = async (order: Order, newStatus: OrderStatus) => {
    if (!tenantId) return;
    if (orderWriteRef.current) return;

    // GOLDEN: Special confirmation for cancellation with warning
    if (newStatus === 'cancelled_by_store') {
      Alert.alert(
        t('admin.orders.cancelConfirmTitle', { defaultValue: 'Cancel Order?' }),
        t('admin.orders.cancelConfirmWarning', { defaultValue: 'Cancelling this order restores its stock and cannot be undone.' }),
        [
          { text: t('admin.common.cancel'), style: 'cancel' },
          {
            text: t('admin.orders.confirmCancel', { defaultValue: 'Yes, Cancel Order' }),
            style: 'destructive',
            onPress: async () => {
              if (orderWriteRef.current) return;
              orderWriteRef.current = true;
              setUpdating(true);
              try {
                const service = createTenantAdminService(tenantId);
                await service.updateOrderStatus(order.id, newStatus as any, undefined, 'admin');

                setOrders(prev => prev.map(o =>
                  o.id === order.id ? { ...o, status: newStatus, cancelledBy: 'admin' } : o
                ));
                setModalVisible(false);
                Alert.alert(t('admin.common.success'), t('admin.orders.statusUpdateSuccess', { status: getStatusConfig(newStatus, t).text }));
              } catch (error) {
                Alert.alert(t('admin.common.error'), t('admin.orders.statusUpdateFailed'));
              } finally {
                setUpdating(false);
                orderWriteRef.current = false;
              }
            }
          },
        ]
      );
      return;
    }

    orderWriteRef.current = true;
    setUpdating(true);
    try {
      const service = createTenantAdminService(tenantId);
      await service.updateOrderStatus(order.id, newStatus as any);

      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: newStatus } : o
      ));

      // AUTO-MESSAGE: If shipped, notify user with tracking & money info
      if (newStatus === 'shipped' && order.userId && propsUser?.uid) {
        try {
          // 1. Get or create chat
          const conversation = await createAdminInitiatedConversation(
            tenantId,
            order.userId,
            propsUser.uid,
            order.items?.[0]?.productId,
            order.items?.[0]?.productSnapshot
          );

          // 2. Build message
          const totalStr = order.totalUSD != null ? formatPrice(order.totalUSD, order.currency, order.exchangeRate) : 'N/A';
          const orderNum = order.orderNumber?.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '') || 'N/A';
          // Use current state trackingUrl if it matches this order, otherwise use order's existing one
          // But here we might not have set the tracking URL yet in the UI for this specific order flow if just clicking "Shipped" from dropdown.
          // Usually tracking URL is entered in the modal.
          // If we are just changing status to shipped, we might want to check if tracking URL exists on order.
          const trackUrl = trackingUrl || order.trackingUrl || '';

          let msgText = `${t('admin.orders.shippedMsgHeader', { order: orderNum, defaultValue: '📦 Order {{order}} has been shipped!' })}\n\n${t('admin.orders.shippedMsgTotal', { total: totalStr, defaultValue: '💰 Total Amount: {{total}}' })}`;

          if (trackUrl) {
            msgText += `\n\n${t('admin.orders.shippedMsgTrack', { url: trackUrl, defaultValue: '📍 Track your order: {{url}}' })}`;
          }

          msgText += `\n\n${t('admin.orders.shippedMsgThanks', { defaultValue: 'Thank you for your business!' })}`;

          // 3. Send message
          // CORRECTED ARGUMENTS: conversationId, text, senderId, senderType, senderName, attachmentUrl
          await sendMessage(
            conversation.id,
            msgText,
            propsUser.uid,
            'admin',
            'Admin'
          );
          console.log('Auto-message sent for shipped order:', order.id);

        } catch (msgError) {
          console.error('Failed to send auto-message:', msgError);
          // Don't block the UI for this, just log it
        }
      }

      setModalVisible(false);
      Alert.alert(t('admin.common.success'), t('admin.orders.statusUpdateSuccess', { status: getStatusConfig(newStatus, t).text }));
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.orders.statusUpdateFailed'));
    } finally {
      setUpdating(false);
      orderWriteRef.current = false;
    }
  };

  const handleMessageCustomer = async () => {
    if (!selectedOrder || !tenantId) return;

    // Check if user exists
    if (!selectedOrder.userId) {
      Alert.alert(t('admin.common.error'), t('admin.orders.noCustomerInfo'));
      return;
    }

    try {
      setMessagingCustomer(true); // dedicated flag: don't unmount the modal/list behind a fullscreen spinner

      // 1. Try to find existing conversation for this tenant & user
      // detailed in implementation plan
      let conversation = await findConversationByTenant(tenantId, selectedOrder.userId);

      // 2. If not found, create a new one linked to the order items or just user
      if (!conversation) {
        // Use the new ADMIN specific creation function
        // This ensures the userId is the CUSTOMER'S ID, and adminId is US.
        const firstItem = selectedOrder.items && selectedOrder.items.length > 0 ? selectedOrder.items[0] : null;

        // We need the current admin's UID. 
        // We can get it from useAuth or pass it. 
        // Since we don't have auth context here easily, we might need to import it or assume valid auth.
        // BUT, looking at file, we don't have 'user' from useAuth imported.
        // Let's import useAuth at top or get it here.
        // Wait, 'createTenantAdminService' implies we might have auth context wrapper? 
        // checking imports... 'useTenant' is there.
        // We should add `const { user } = useAuth();` to component.

        if (propsUser?.uid) {
          conversation = await createAdminInitiatedConversation(
            tenantId,
            selectedOrder.userId,
            propsUser.uid, // Admin's UID
            firstItem?.productId,
            firstItem?.productSnapshot
          );
        } else {
          Alert.alert(t('admin.common.error'), t('admin.orders.cannotVerifyAdmin', { defaultValue: 'Cannot verify admin identity.' }));
          setMessagingCustomer(false);
          return;
        }
      }

      setMessagingCustomer(false);
      setModalVisible(false); // Close modal before navigating

      if (conversation) {
        // Auto-send tracking URL message BEFORE navigating (avoids race condition)
        const trackUrl = trackingUrl || selectedOrder.trackingUrl;

        // REMOVED: Auto-generation of Google Maps link from coordinates.
        // User requesting strict manual entry for tracking URLs.
        if (trackUrl && propsUser?.uid) {
          try {
            const totalStr = selectedOrder.totalUSD != null ? formatPrice(selectedOrder.totalUSD, selectedOrder.currency, selectedOrder.exchangeRate) : 'N/A';
            const orderNum = selectedOrder.orderNumber?.replace(/ORD/g, '')?.replace(/#/g, '')?.replace(/-/g, '') || 'N/A';
            let msgText = `${t('admin.orders.shippedMsgHeader', { order: orderNum, defaultValue: '📦 Order {{order}} has been shipped!' })}\n\n${t('admin.orders.shippedMsgTotal', { total: totalStr, defaultValue: '💰 Total Amount: {{total}}' })}`;

            // If it's a Google Maps link, use a slightly different label
            if (trackUrl.includes('google.com/maps')) {
              msgText += `\n\n${t('admin.orders.shippedMsgLocation', { url: trackUrl, defaultValue: '📍 Delivery Location: {{url}}' })}`;
            } else {
              msgText += `\n\n${t('admin.orders.shippedMsgTrack', { url: trackUrl, defaultValue: '📍 Track your order: {{url}}' })}`;
            }

            msgText += `\n\n${t('admin.orders.shippedMsgThanks', { defaultValue: 'Thank you for your business!' })}`;

            await sendMessage(
              conversation.id,
              msgText,
              propsUser.uid,
              'admin',
              'Admin'
            );
          } catch (msgErr) {
            console.warn('Failed to auto-send tracking message:', msgErr);
          }
        }

        // Navigate to AdminChatScreen with full context
        const firstItem = selectedOrder.items?.[0];
        // @ts-expect-error
        navigation.navigate('AdminChatScreen', {
          conversationId: conversation.id,
          adminId: propsUser?.uid,
          productId: firstItem?.productId,
          productName: firstItem?.productName || t('admin.orders.orderChat', { defaultValue: 'Order Chat' }),
          productImage: firstItem?.imageUrl || firstItem?.productSnapshot?.imageUrl,
          targetName: selectedOrder.shippingAddress?.fullName || (selectedOrder as any).customerName || t('chat.customer', 'Customer'),
          targetPhone: selectedOrder.shippingAddress?.phone || (selectedOrder as any).customerPhone || '',
          tenantId: tenantId,
        });
      }

    } catch (error) {
      console.error('Error opening chat:', error);
      setMessagingCustomer(false);
      Alert.alert(t('admin.common.error'), t('admin.orders.chatError'));
    }
  };

  const handleQuickStatusAdvance = (order: Order) => {
    const nextStatus = getNextStatus(order.status);
    if (nextStatus) {
      Alert.alert(
        t('admin.orders.confirmUpdateTitle'),
        t('admin.orders.confirmUpdateMessage', {
          orderNumber: order.orderNumber,
          oldStatus: getStatusConfig(order.status, t).text,
          newStatus: getStatusConfig(nextStatus, t).text
        }),
        [
          { text: t('admin.common.cancel'), style: 'cancel' },
          { text: t('admin.common.update'), onPress: () => { setUpdatingOrderId(order.id); Promise.resolve(handleStatusUpdate(order, nextStatus)).finally(() => setUpdatingOrderId(null)); } },
        ]
      );
    }
  };

  const handleViewMap = () => {
    const coords = selectedOrder?.shippingAddress?.coordinates;
    if (coords) {
      // Close order modal first to avoid nested modal freeze
      setModalVisible(false);

      // Small delay to allow first modal to close
      setTimeout(() => {
        setSelectedLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
          title: selectedOrder?.shippingAddress?.fullName || t('admin.orders.deliveryLocation'),
        });
        setMapModalVisible(true);
      }, 300);
    }
  };

  const handleOpenInMaps = () => {
    if (selectedLocation) {
      const { latitude, longitude, title } = selectedLocation;
      const url = Platform.select({
        ios: `maps:0,0?q=${title}@${latitude},${longitude}`,
        android: `geo:0,0?q=${latitude},${longitude}(${title})`,
      });
      if (url) {
        Linking.openURL(url);
      }
    }
  };

  const closeMapModal = () => {
    setMapModalVisible(false);
    setSelectedLocation(null);
  };

  // 🖨️ Print Invoice as PDF - with language support
  const printingRef = useRef(false);
  // One lock across every order-mutating write on this screen.
  //
  // The status grid renders six sibling Touchables, each its own responder, so two
  // simultaneous touches on DIFFERENT buttons both fire in one event batch and both
  // clear a `disabled` that is still a render behind. Both calls then read the same
  // stock_status:'pending' and both deduct — move_part_stock applies a signed
  // RELATIVE delta, so inventory drops by twice the order — and the shipped branch
  // sends the customer two 'Order has been SHIPPED!' messages.
  //
  // NOTE this only closes the single-device case. updateOrderStatus's stock_status
  // check is a read-modify-write across two round trips, so two admin devices can
  // still double-deduct. The durable fix is a compare-and-set inside a SECURITY
  // DEFINER RPC that locks the order row and only moves stock when
  // stock_status <> 'deducted' — cancel_my_order already does exactly this.
  const orderWriteRef = useRef(false);

  const generateInvoiceHtml = (order: Order, lang: 'en' | 'ar' | 'ku', imageMap: Record<string, string> = {}) => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const textAlignOpposite = isRTL ? 'left' : 'right';

    // Invoice labels by language
    const labels = {
      en: {
        invoice: 'INVOICE',
        companyName: invoiceSettings?.companyName || BRAND.name,
        orderNumber: 'Order #:',
        date: 'Date:',
        status: 'Status:',
        shipTo: '📦 Ship To',
        customer: '👤 Customer',
        shippingOffice: '🏢 Shipping Information Office',
        moneyExchanger: '💵 Money Exchanger',
        name: 'Name:',
        phone: 'Phone:',
        address: 'Address:',
        city: 'City:',
        recipient: 'Recipient:',
        mobile: 'Mobile:',
        office: 'Office:',
        officePhone: 'Office Phone:',
        receiverName: 'Receiver Name:',
        receiverPhone: 'Receiver Phone:',
        totalAmount: 'Total Amount:',
        orderItems: '🛒 Order Items',
        product: 'Product',
        qty: 'Qty',
        unitPrice: 'Unit Price',
        total: 'Total',
        partNumber: 'Part #:',
        subtotal: 'Subtotal',
        shipping: 'Shipping',
        tax: 'Tax',
        discount: 'Discount',
        grandTotal: 'Total',
        paid: 'Paid',
        remaining: 'Remaining Due',
        paidInFull: 'PAID IN FULL',
        thankYou: 'Thank you for shopping with us!',
      },
      ar: {
        invoice: 'فاتورة',
        companyName: invoiceSettings?.companyNameAr || 'هرياد أوتو بارت',
        orderNumber: 'رقم الطلب:',
        date: 'التاريخ:',
        status: 'الحالة:',
        shipTo: '📦 عنوان الشحن',
        customer: '👤 الزبون',
        shippingOffice: '🏢 معلومات مكتب الشحن',
        moneyExchanger: '💵 مكتب الصرافة',
        name: 'الاسم:',
        phone: 'الهاتف:',
        address: 'العنوان:',
        city: 'المدينة:',
        recipient: 'المستلم:',
        mobile: 'الموبايل:',
        office: 'المكتب:',
        officePhone: 'هاتف المكتب:',
        receiverName: 'اسم المستلم:',
        receiverPhone: 'هاتف المستلم:',
        totalAmount: 'المبلغ الإجمالي:',
        orderItems: '🛒 عناصر الطلب',
        product: 'المنتج',
        qty: 'الكمية',
        unitPrice: 'سعر الوحدة',
        total: 'المجموع',
        partNumber: 'رقم القطعة:',
        subtotal: 'المجموع الفرعي',
        shipping: 'الشحن',
        tax: 'الضريبة',
        discount: 'الخصم',
        grandTotal: 'الإجمالي',
        paid: 'المدفوع',
        remaining: 'المبلغ المتبقي',
        paidInFull: 'مدفوع بالكامل',
        thankYou: 'شكراً لتسوقكم معنا!',
      },
      ku: {
        invoice: 'پسووڵە',
        companyName: invoiceSettings?.companyNameKu || 'هەریاد ئۆتۆ پارت',
        orderNumber: 'ژمارەی داواکاری:',
        date: 'بەروار:',
        status: 'دۆخ:',
        shipTo: '📦 ناونیشانی گەیاندن',
        customer: '👤 کڕیار',
        shippingOffice: '🏢 زانیاری ئۆفیسی گواستنەوە',
        moneyExchanger: '💵 ئۆفیسی ساراف',
        name: 'ناو:',
        phone: 'تەلەفۆن:',
        address: 'ناونیشان:',
        city: 'شار:',
        recipient: 'وەرگر:',
        mobile: 'مۆبایل:',
        office: 'ئۆفیس:',
        officePhone: 'تەلەفۆنی ئۆفیس:',
        receiverName: 'ناوی وەرگر:',
        receiverPhone: 'تەلەفۆنی وەرگر:',
        totalAmount: 'کۆی بڕ:',
        orderItems: '🛒 کاڵاکان',
        product: 'بەرهەم',
        qty: 'عەدەد',
        unitPrice: 'نرخی یەکە',
        total: 'کۆی گشتی',
        partNumber: 'ژمارەی پارچە:',
        subtotal: 'کۆی لاوەکی',
        shipping: 'گەیاندن',
        tax: 'باج',
        discount: 'داشکاندن',
        grandTotal: 'کۆی گشتی',
        paid: 'پارەی دراو',
        remaining: 'پارەی ماوە',
        paidInFull: 'بە تەواوی دراوە',
        thankYou: 'سوپاس بۆ کڕینتان لەلای ئێمە!',
      },
    };

    const L = labels[lang];

    const orderDate = order.createdAt
      ? formatFirestoreDate(order.createdAt, lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A';

    const statusText = getStatusConfig(order.status, t).text;

    const logoBase64 = LOGO_BASE64;
    const invoiceLogo = invoiceSettings?.logoUrl || '';

    const itemsHtml = order.items.map(item => {
      const rawUrl = item.imageUrl || item.productSnapshot?.imageUrl || '';
      const imageUrl = imageMap[rawUrl] || rawUrl; // prefer the embedded base64 — remote URLs don't render in the PDF
      const imageHtml = imageUrl
        ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #e0e0e0;" onerror="this.style.display='none'" />`
        : `<div style="width: 50px; height: 50px; background: #f5f5f5; border-radius: 6px; display: flex; align-items: center; justify-content: center; border: 1px solid #e0e0e0;"><span style="font-size: 20px;">📦</span></div>`;

      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${imageHtml}
              <div style="flex: 1;">
                <strong style="font-size: 12px; color: #1F2937;">${lang === 'ar' && ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) ? ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) : lang === 'ku' && ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) ? ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) : item.productName}</strong>
                ${item.partNumber ? `<br><span style="color: #666; font-size: 11px;"><strong>${L.partNumber} ${item.partNumber}</strong></span>` : ''}
                ${item.selectedOptions?.color ? `<br><span style="color: #888; font-size: 10px;">${item.selectedOptions.color}</span>` : ''}
              </div>
            </div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle;">${formatPrice(item.priceUSD, order.currency, order.exchangeRate)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: ${textAlignOpposite}; font-weight: bold; vertical-align: middle; color: #FF7816;">${formatPrice(item.priceUSD * item.quantity, order.currency, order.exchangeRate)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html dir="${direction}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; color: #333; background: #fff; font-size: 11px; direction: ${direction}; }
          .header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #FF7816; }
          .logo { font-size: 16px; font-weight: bold; color: #FF7816; margin-bottom: 2px; }
          .invoice-title { font-size: 14px; color: #1F2937; font-weight: 300; letter-spacing: 2px; }
          .order-info { display: flex; justify-content: center; gap: 15px; margin-bottom: 12px; flex-wrap: wrap; }
          .info-box { background: #F8F9FC; padding: 6px 12px; border-radius: 6px; }
          .info-label { font-size: 9px; color: #666; font-weight: 500; }
          .info-value { font-size: 11px; font-weight: 600; color: #1F2937; }
          .section-title { font-size: 10px; font-weight: 600; color: #FF7816; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; text-align: ${textAlign}; }
          .three-column { display: flex; gap: 10px; margin-bottom: 12px; }
          .column { flex: 1; min-width: 0; }
          .detail-box { background: #F8F9FC; padding: 8px; border-radius: 6px; font-size: 10px; line-height: 1.5; text-align: ${textAlign}; }
          .detail-box div { margin-bottom: 2px; }
          .detail-box strong { color: #666; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #1F2937; color: white; padding: 6px 4px; text-align: ${textAlign}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
          th:nth-child(2), th:nth-child(3) { text-align: center; }
          th:last-child { text-align: ${textAlignOpposite}; }
          td { padding: 6px 4px; border-bottom: 1px solid #eee; font-size: 10px; }
          .totals { margin-${isRTL ? 'right' : 'left'}: auto; width: 180px; }
          .total-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 10px; }
          .total-row.grand { border-bottom: none; border-top: 2px solid #1F2937; padding-top: 8px; margin-top: 4px; }
          .total-label { color: #666; }
          .total-value { font-weight: 600; }
          .grand .total-label, .grand .total-value { font-size: 12px; color: #1F2937; font-weight: bold; }
          .grand .total-value { color: #FF7816; }
          .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; color: #888; font-size: 9px; }
          .status-badge { display: inline-block; background: #FF7816; color: white; padding: 3px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="header">
          ${invoiceLogo
        ? `<img src="${invoiceLogo}" style="height: 50px; margin-bottom: 5px;" alt="Logo" onerror="this.style.display='none'" />`
        : logoBase64
          ? `<img src="data:image/png;base64,${logoBase64}" style="height: 50px; margin-bottom: 5px;" alt="Logo" />`
          : ''
      }
          <div class="logo">${L.companyName}</div>
          <div class="invoice-title">${L.invoice}</div>
        </div>
        
        <div class="order-info">
          <div class="info-box"><span class="info-label">${L.orderNumber}</span> <span class="info-value">${order.orderNumber.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '')}</span></div>
          <div class="info-box"><span class="info-label">${L.date}</span> <span class="info-value">${orderDate}</span></div>
          <div class="info-box"><span class="info-label">${L.status}</span> <span class="status-badge">${statusText}</span></div>
        </div>
        
        ${(() => {
          const isVipOrder = (order.userId && usersMap[order.userId]?.role === 'vip') || (order as any).isVip;
          if (!isVipOrder) return '';
          const customerName = order.shippingAddress?.fullName || '';
          const vipTitle = lang === 'ar' ? 'عميل مميز' : lang === 'ku' ? 'کڕیاری تایبەت' : 'VIP Member';
          const vipSubtitle = lang === 'ar' 
            ? `${customerName} — شكراً لولائك. أسعار حصرية مطبّقة على هذا الطلب`
            : lang === 'ku' 
            ? `${customerName} — سوپاس بۆ دڵسۆزیت. نرخی تایبەت لەسەر ئەم داواکارییە جێبەجێ کراوە`
            : `${customerName} — Thank you for your loyalty. Exclusive VIP pricing applied to this order`;
          return `
          <div style="margin: 12px 0; padding: 14px 18px; background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460); border-radius: 10px; text-align: center; position: relative; overflow: hidden;">
            <div style="position: absolute; top: -15px; right: -15px; width: 60px; height: 60px; background: rgba(245,158,11,0.15); border-radius: 50%;"></div>
            <div style="position: absolute; bottom: -10px; left: -10px; width: 40px; height: 40px; background: rgba(245,158,11,0.1); border-radius: 50%;"></div>
            <div style="display: inline-block; padding: 3px 14px; background: linear-gradient(135deg, #F59E0B, #D97706); border-radius: 20px; margin-bottom: 6px;">
              <span style="font-size: 10px; font-weight: 800; color: #fff; letter-spacing: 2px; text-transform: uppercase;">⭐ ${vipTitle} ⭐</span>
            </div>
            <div style="font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.5; margin-top: 4px;">${vipSubtitle}</div>
          </div>`;
        })()}
        
        <div class="three-column">
          <div class="column">
            <div class="section-title">${(order as any).source === 'in-store' ? L.customer : L.shipTo}</div>
            <div class="detail-box">
              <div><strong>${L.name}</strong> ${order.shippingAddress?.fullName || 'N/A'}</div>
              <div><strong>${L.phone}</strong> <span dir="ltr" style="unicode-bidi:isolate;">${order.shippingAddress?.phone || 'N/A'}</span></div>
              ${(order as any).source === 'in-store'
        ? `${order.shippingAddress?.address ? `<div><strong>${L.address}</strong> ${order.shippingAddress.address}</div>` : ''}${order.shippingAddress?.city ? `<div><strong>${L.city}</strong> ${order.shippingAddress.city}</div>` : ''}`
        : `<div><strong>${L.address}</strong> ${order.shippingAddress?.address || ''}</div>
              <div><strong>${L.city}</strong> ${order.shippingAddress?.city || ''}</div>`}
            </div>
          </div>
          ${order.shippingOfficeInfo ? `
          <div class="column">
            <div class="section-title">${L.shippingOffice}</div>
            <div class="detail-box">
              <div><strong>${L.recipient}</strong> ${order.shippingOfficeInfo.recipientName || 'N/A'}</div>
              <div><strong>${L.mobile}</strong> ${order.shippingOfficeInfo.mobileNumber || 'N/A'}</div>
              <div><strong>${L.office}</strong> ${order.shippingOfficeInfo.officeName || ''}</div>
              <div><strong>${L.officePhone}</strong> ${order.shippingOfficeInfo.officePhone || ''}</div>
            </div>
          </div>
          ` : ''}
          ${order.moneyExchangerInfo ? `
          <div class="column">
            <div class="section-title">${L.moneyExchanger}</div>
            <div class="detail-box">
              <div><strong>${L.office}</strong> ${order.moneyExchangerInfo.officeName || 'N/A'}</div>
              <div><strong>${L.officePhone}</strong> ${order.moneyExchangerInfo.officePhone || 'N/A'}</div>
              <div><strong>${L.receiverName}</strong> ${order.moneyExchangerInfo.receiverName || ''}</div>
              <div><strong>${L.receiverPhone}</strong> ${order.moneyExchangerInfo.receiverPhone || ''}</div>
              <div><strong>${L.totalAmount}</strong> ${order.moneyExchangerInfo.totalAmount != null ? formatPrice(Number(order.moneyExchangerInfo.totalAmount), order.currency, order.exchangeRate) : ''}</div>
            </div>
          </div>
          ` : ''}
        </div>
        
        <div class="section-title">${L.orderItems}</div>
        <table>
          <thead>
            <tr>
              <th>${L.product}</th>
              <th>${L.qty}</th>
              <th>${L.unitPrice}</th>
              <th>${L.total}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row">
            <span class="total-label">${L.subtotal}</span>
            <span class="total-value">${(() => {
              const isVip = (order.userId && usersMap[order.userId]?.role === 'vip') || (order as any).isVip;
              if (isVip) {
                let origSubtotal = 0;
                order.items.forEach((item: any) => {
                  origSubtotal += (item.originalPriceUSD || item.priceUSD || 0) * (item.quantity || 1);
                });
                return formatPrice(origSubtotal, order.currency, order.exchangeRate);
              }
              return order.subtotalUSD != null ? formatPrice(order.subtotalUSD, order.currency, order.exchangeRate) : formatPrice(0, order.currency, order.exchangeRate);
            })()}</span>
          </div>
          <div class="total-row">
            <span class="total-label">${L.shipping}</span>
            <span class="total-value">${order.shippingUSD != null ? formatPrice(order.shippingUSD, order.currency, order.exchangeRate) : formatPrice(0, order.currency, order.exchangeRate)}</span>
          </div>
          ${order.taxUSD ? `
          <div class="total-row">
            <span class="total-label">${L.tax}</span>
            <span class="total-value">${formatPrice(order.taxUSD, order.currency, order.exchangeRate)}</span>
          </div>
          ` : ''}
          ${order.discountUSD ? `
          <div class="total-row">
            <span class="total-label">${L.discount}</span>
            <span class="total-value" style="color: #10B981;">-${formatPrice(order.discountUSD, order.currency, order.exchangeRate)}</span>
          </div>
          ` : ''}
          ${(() => {
            const isVipOrder = (order.userId && usersMap[order.userId]?.role === 'vip') || (order as any).isVip;
            if (!isVipOrder) return '';
            let regularTotal = 0;
            let vipTotal = 0;
            order.items.forEach((item: any) => {
              const orig = item.originalPriceUSD || item.priceUSD || 0;
              const discounted = item.priceUSD || 0;
              regularTotal += orig * (item.quantity || 1);
              vipTotal += discounted * (item.quantity || 1);
            });
            const vipSavings = Math.max(regularTotal - vipTotal, 0);
            if (vipSavings <= 0) return '';
            const lblVip = lang === 'ar' ? '⭐ خصم VIP' : lang === 'ku' ? '⭐ داشکاندنی VIP' : '⭐ VIP Discount';
            return `
            <div class="total-row">
              <span class="total-label" style="color: #059669; font-weight: 600;">${lblVip}</span>
              <span class="total-value" style="color: #059669; font-weight: 700;">-${formatPrice(vipSavings, order.currency, order.exchangeRate)}</span>
            </div>`;
          })()}
          <div class="total-row grand">
            <span class="total-label">${L.grandTotal}</span>
            <span class="total-value">${order.totalUSD != null ? formatPrice(order.totalUSD, order.currency, order.exchangeRate) : formatPrice(0, order.currency, order.exchangeRate)}</span>
          </div>
          ${(() => {
            const paidUSD = order.amountPaidUSD || 0;
            const totalU = order.totalUSD || 0;
            const remainingUSD = Math.max(0, totalU - paidUSD);
            if (totalU > 0 && remainingUSD <= 0.01) {
              return `<div class="total-row" style="border-top:1px dashed #e5e7eb;"><span class="total-label" style="color:#10B981;font-weight:700;">✓ ${L.paidInFull}</span><span class="total-value" style="color:#10B981;font-weight:700;">${formatPrice(totalU, order.currency, order.exchangeRate)}</span></div>`;
            }
            return `
            ${paidUSD > 0 ? `<div class="total-row"><span class="total-label" style="color:#10B981;">${L.paid}</span><span class="total-value" style="color:#10B981;">${formatPrice(paidUSD, order.currency, order.exchangeRate)}</span></div>` : ''}
            <div class="total-row" style="border-top:1px dashed #e5e7eb;"><span class="total-label" style="color:#DC2626;font-weight:700;">${L.remaining}</span><span class="total-value" style="color:#DC2626;font-weight:700;">${formatPrice(remainingUSD, order.currency, order.exchangeRate)}</span></div>`;
          })()}
        </div>

        <div class="footer">
          <p><strong>${L.companyName}</strong></p>
          ${invoiceSettings?.phone ? `<p style="margin-top: 4px;">📞 ${invoiceSettings.phone}</p>` : ''}
          ${(invoiceSettings?.email || brandContact(BRAND.contactEmail)) ? `<p style="margin-top: 4px;">📧 ${invoiceSettings?.email || brandContact(BRAND.contactEmail)}</p>` : ''}
          ${invoiceSettings?.website ? `<p style="margin-top: 4px;">🌐 ${invoiceSettings.website}</p>` : ''}
          ${(() => {
            const isVipOrder = (order.userId && usersMap[order.userId]?.role === 'vip') || (order as any).isVip;
            if (!isVipOrder) return `<p style="margin-top: 8px;">${L.thankYou}</p>`;
            const vipThankYou = lang === 'ar' ? '💎 نقدّر ولاءك كعميل VIP. نتطلع لخدمتك دائماً!'
              : lang === 'ku' ? '💎 سوپاس بۆ دڵسۆزیت وەک ئەندامی VIP. هەمیشە خۆشحاڵین بە خزمەتکردنت!'
              : '💎 We appreciate your VIP loyalty. Looking forward to serving you again!';
            return `<p style="margin-top: 8px; color: #B45309; font-weight: 600;">${vipThankYou}</p>`;
          })()}
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintInvoice = async (lang: 'en' | 'ar' | 'ku' = 'en') => {
    if (!selectedOrder || printingRef.current) return; // guard double-tap (now does network fetches)
    printingRef.current = true;

    try {
      // Pre-embed each product image as base64 so they actually show in the PDF —
      // expo-print won't wait for remote <img> to download. Fetched in parallel.
      const urls = Array.from(new Set(
        selectedOrder.items
          .map((it) => it.imageUrl || (it as any).productSnapshot?.imageUrl)
          .filter(Boolean) as string[]
      ));
      const entries = await Promise.all(
        urls.map(async (u, i) => [u, await fetchImageAsDataUri(u, i)] as const)
      );
      const imageMap: Record<string, string> = {};
      for (const [u, data] of entries) if (data) imageMap[u] = data;

      const html = generateInvoiceHtml(selectedOrder, lang, imageMap);
      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice #${selectedOrder.orderNumber}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.orders.invoiceFailed', { defaultValue: 'Failed to generate invoice' }));
    } finally {
      printingRef.current = false;
    }
  };

  const showPrintLanguageOptions = () => {
    if (!selectedOrder) return;

    Alert.alert(
      t('admin.orders.selectLanguage') || 'Select Invoice Language',
      t('admin.orders.selectLanguageMessage') || 'Choose the language for the invoice',
      [
        { text: '🇬🇧 English', onPress: () => handlePrintInvoice('en') },
        { text: '🇸🇦 العربية', onPress: () => handlePrintInvoice('ar') },
        { text: '🇮🇶 کوردی', onPress: () => handlePrintInvoice('ku') },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleDeleteOrder = (order: Order) => {
    Alert.alert(
      t('admin.orders.deleteTitle'),
      t('admin.orders.deleteMessage', {
        orderNumber: order.orderNumber?.replace(/ORD/g, '')?.replace(/#/g, '')?.replace(/-/g, '')
      }),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        {
          text: t('admin.common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!tenantId) return;
            try {
              const service = createTenantAdminService(tenantId);
              await service.deleteOrder(order.id);
              setOrders(prev => prev.filter(o => o.id !== order.id));
              setModalVisible(false);
              Alert.alert(t('admin.common.success'), t('admin.orders.deleteSuccess'));
            } catch (error) {
              Alert.alert(t('admin.common.error'), t('admin.orders.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleUpdatePaymentStatus = async (order: Order, status: 'paid' | 'failed') => {
    if (!tenantId) return;
    // Approve and Decline are separate buttons with no disabled prop at all; tapping
    // both before the first resolves let arrival order decide the stored value.
    if (orderWriteRef.current) return;
    orderWriteRef.current = true;
    try {
      const service = createTenantAdminService(tenantId);
      await service.updateOrderPaymentStatus(order.id, status);

      // Update local state
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, paymentStatus: status } : o));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => prev ? { ...prev, paymentStatus: status } : null);
      }

      Alert.alert(
        t('admin.common.success'),
        status === 'paid' ? t('admin.orders.paymentApproved') : t('admin.orders.paymentDeclined')
      );
    } catch (error) {
      console.error('Error updating payment status:', error);
      Alert.alert(t('admin.common.error'), t('admin.orders.updatePaymentFailed', { defaultValue: 'Failed to update payment status' }));
    } finally {
      orderWriteRef.current = false;
    }
  };

  // Outstanding cash on an order (cancelled orders owe nothing).
  const remainingOf = (o: Order) => {
    if (String(o.status || '').toLowerCase().startsWith('cancel')) return 0;
    return Math.max(0, (o.totalUSD || 0) - (o.amountPaidUSD || 0));
  };

  // Per-status counts for the filter-tab badges (from the loaded orders).
  const statusCounts: Record<string, number> = { all: orders.length };
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  statusCounts['unpaid'] = orders.filter(o => o.status === 'delivered' && remainingOf(o) > 0.01).length;
  // Prefer accurate server counts (whole history); fall back to loaded-window counts until they arrive.
  const tabCounts: Record<string, number> = Object.keys(orderCounts).length ? orderCounts : statusCounts;

  // Today's roll-up: orders placed today, delivered sales today, and cash still owed today.
  const todayStats = (() => {
    const now = new Date();
    const sameDay = (d: any) => {
      const x = new Date(d);
      return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth() && x.getDate() === now.getDate();
    };
    let count = 0, sales = 0, unpaid = 0;
    for (const o of orders) {
      if (!o.createdAt || !sameDay(o.createdAt)) continue;
      count++;
      // Partner-tagged orders are the partner's business — their sales and receivables
      // belong to the partner (tracked on the partner dashboard), not the owner, so they
      // don't count toward the owner's money tiles. The order still counts for fulfillment.
      if ((o as any).partnerId) continue;
      if (o.status === 'delivered') sales += (o.totalUSD || 0);
      unpaid += remainingOf(o);
    }
    return { count, sales, unpaid };
  })();

  const filteredOrdersBase = orders.filter(order => {
    const matchesFilter = selectedFilter === 'all'
      ? true
      : selectedFilter === 'unpaid'
        ? (order.status === 'delivered' && remainingOf(order) > 0.01)
        : order.status === selectedFilter;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesFilter;
    // Search against raw orderNumber, cleaned orderNumber (no #/ORD/-), customer name, phone, recipient name, and user profile name
    const cleanedOrderNum = order.orderNumber?.replace(/^#?ORD-?/i, '').replace(/-/g, '').toLowerCase() || '';
    const rawOrderNum = order.orderNumber?.toLowerCase() || '';
    const customerName = order.shippingAddress?.fullName?.toLowerCase() || '';
    const customerPhone = order.shippingAddress?.phone?.toLowerCase() || '';
    const recipientName = order.shippingOfficeInfo?.recipientName?.toLowerCase() || '';
    const userProfileName = (order.userId && usersMap[order.userId]?.fullName?.toLowerCase()) || '';
    const matchesSearch =
      rawOrderNum.includes(query) ||
      cleanedOrderNum.includes(query) ||
      customerName.includes(query) ||
      customerPhone.includes(query) ||
      recipientName.includes(query) ||
      userProfileName.includes(query);
    return matchesFilter && matchesSearch;
  });
  // Oldest-first option so the longest-waiting orders surface at the top of the queue.
  const filteredOrders = sortOldestFirst
    ? [...filteredOrdersBase].sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime())
    : filteredOrdersBase;

  const renderOrderItem = ({ item }: { item: Order }) => {
    const nextStatus = getNextStatus(item.status);

    // Once an order is delivered the status button is gone — show the profit in
    // its place instead (only when item costs were captured on the order).
    const orderItems = (item.items || []) as any[];
    // Partner-tagged orders are the partner's — no owner profit pill on them.
    const isPartnerOrder = !!(item as any).partnerId;
    const hasProfit = !isPartnerOrder && orderItems.some((itm) => itm.purchasePrice != null && itm.purchasePrice > 0);
    const orderProfit = orderItems.reduce(
      (sum, itm) => (itm.purchasePrice != null && itm.purchasePrice > 0
        ? sum + (itm.priceUSD - itm.purchasePrice) * itm.quantity
        : sum),
      0,
    );
    const showProfit = item.status === 'delivered' && hasProfit;

    return (
      <View>
        <Pressable
          android_disableSound
          style={[styles.orderCard, {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.06,
            shadowRadius: 8,
            elevation: 2,
            borderWidth: selectionMode && selectedIds.has(item.id) ? 2 : 0,
            borderColor: theme.colors.primary,
          }]}
          onLongPress={() => { setSelectionMode(true); setSelectedIds(prev => { const n = new Set(prev); n.add(item.id); return n; }); }}
          onPress={() => {
            if (selectionMode) {
              setSelectedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
            } else {
              setSelectedOrder(item); setTrackingUrl(item.trackingUrl || ''); setModalVisible(true);
            }
          }}
        >
          {/* Order Header */}
          <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {selectionMode && (
              <View style={[styles.selectCheck, { backgroundColor: selectedIds.has(item.id) ? theme.colors.primary : 'transparent', borderColor: selectedIds.has(item.id) ? theme.colors.primary : theme.colors.border + '99' }]}>
                {selectedIds.has(item.id) && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
            )}
            <View style={[styles.orderIcon, { backgroundColor: getStatusColor(item.status, t) + '20', marginRight: isRTL ? 0 : SPACING.md, marginLeft: isRTL ? SPACING.md : 0 }]}>
              <Ionicons name="receipt" size={20} color={getStatusColor(item.status, t)} />
            </View>
            <View style={styles.orderHeaderContent}>
              <Text allowFontScaling={false}
                style={[styles.orderNumber, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {item.orderNumber?.replace(/ORD/g, '')?.replace(/#/g, '')?.replace(/-/g, '')}
              </Text>
              <Text allowFontScaling={false}
                style={[styles.orderDate, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {item.createdAt ? formatFirestoreDate(item.createdAt, i18n.language === 'ar' ? 'ar-IQ' : i18n.language === 'ku' ? 'ckb-IQ' : 'en-US') : 'N/A'}
              </Text>
            </View>
            <OrderStatusBadge status={item.status} size="small" />
          </View>

          {/* Customer Info */}
          <View style={[styles.customerSection, { borderColor: theme.colors.border + '30', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.customerAvatar, { backgroundColor: theme.colors.primary + '20', overflow: 'hidden', marginRight: isRTL ? 0 : SPACING.sm, marginLeft: isRTL ? SPACING.sm : 0 }]}>
              {item.userId && usersMap[item.userId]?.profileImageUrl ? (
                <Image
                  source={{ uri: usersMap[item.userId].profileImageUrl }}
                  style={{ width: 32, height: 32, borderRadius: 16 }}
                />
              ) : (
                <Ionicons name="person" size={16} color={theme.colors.primary} />
              )}
            </View>
            <View style={styles.customerInfo}>
              <Text allowFontScaling={false}
                style={[styles.customerName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {(item.userId && usersMap[item.userId]?.fullName) ? usersMap[item.userId].fullName : (item.shippingAddress?.fullName || t('admin.orders.unknownCustomer'))}
              </Text>
              {item.shippingOfficeInfo?.recipientName ? (
                <Text allowFontScaling={false}
                  style={[styles.customerPhone, { color: theme.colors.primary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  🏢 {item.shippingOfficeInfo.recipientName}
                </Text>
              ) : null}
              {((item.userId && usersMap[item.userId]?.phone) || item.shippingAddress?.phone) && (
                <Text allowFontScaling={false}
                  style={[styles.customerPhone, { color: theme.colors.textSecondary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {(item.userId && usersMap[item.userId]?.phone) ? usersMap[item.userId].phone : item.shippingAddress?.phone}
                </Text>
              )}
            </View>
            {/* Location indicator */}
            {item.shippingAddress?.coordinates && (
              <View style={[styles.locationBadge, { backgroundColor: theme.colors.success + '20' }]}>
                <Ionicons name="location" size={14} color={theme.colors.success} />
              </View>
            )}
          </View>

          {/* Money + age signals: a delivered order that still owes cash (a real
              receivable), a "paid" tick, and a stale flag on long-waiting open orders. */}
          {(() => {
            const remaining = remainingOf(item);
            const delivered = item.status === 'delivered';
            const ageDays = item.createdAt ? Math.floor((Date.now() - new Date(item.createdAt as any).getTime()) / 86400000) : 0;
            const stale = (item.status === 'pending' || item.status === 'confirmed') && ageDays >= 1;
            if (!delivered && !stale) return null;
            return (
              <View style={[styles.signalRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {delivered && remaining > 0.01 ? (
                  <View style={[styles.signalPill, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="cash-outline" size={12} color="#DC2626" />
                    <Text allowFontScaling={false} style={[styles.signalText, { color: '#DC2626' }]} numberOfLines={1}>
                      {t('admin.orders.owes', { defaultValue: 'Owes' })} {formatPrice(remaining, item.currency, item.exchangeRate)}
                    </Text>
                  </View>
                ) : delivered ? (
                  <View style={[styles.signalPill, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="checkmark-circle" size={12} color="#059669" />
                    <Text allowFontScaling={false} style={[styles.signalText, { color: '#059669' }]} numberOfLines={1}>{t('admin.orders.paid', { defaultValue: 'Paid' })}</Text>
                  </View>
                ) : null}
                {stale ? (
                  <View style={[styles.signalPill, { backgroundColor: '#FFFBEB' }]}>
                    <Ionicons name="time-outline" size={12} color="#D97706" />
                    <Text allowFontScaling={false} style={[styles.signalText, { color: '#D97706' }]} numberOfLines={1}>
                      {ageDays}{t('admin.orders.dayShort', { defaultValue: 'd' })} · {t('admin.orders.waiting', { defaultValue: 'waiting' })}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })()}

          {/* Order Footer */}
          <View style={[styles.orderFooter, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View>
              <Text allowFontScaling={false}
                style={[styles.orderTotal, { color: theme.colors.primary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {item.totalUSD != null ? formatPrice(item.totalUSD, item.currency, item.exchangeRate) : formatPrice(0, item.currency, item.exchangeRate)}
              </Text>
            </View>

            {nextStatus ? (
              <TouchableOpacity
                style={[styles.advanceButton, { backgroundColor: getStatusColor(nextStatus, t), opacity: updatingOrderId === item.id ? 0.6 : 1 }]}
                disabled={updatingOrderId === item.id}
                onPress={() => handleQuickStatusAdvance(item)}
              >
                {updatingOrderId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                    <Text allowFontScaling={false}
                      style={styles.advanceButtonText}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t(`orders.status.${nextStatus}`)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : showProfit ? (
              <View style={[styles.profitPill, { backgroundColor: theme.colors.success + '20' }]}>
                <Ionicons name="trending-up" size={14} color={theme.colors.success} />
                <Text allowFontScaling={false}
                  style={[styles.profitPillText, { color: theme.colors.success }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.85}
                >
                  {t('admin.orders.profit', { defaultValue: 'Profit' })} {formatPrice(orderProfit, item.currency, item.exchangeRate)}
                </Text>
              </View>
            ) : null}
          </View>


        </Pressable>
      </View>
    );
  };

  const renderStatusModal = () => (
    <Modal
      visible={modalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setModalVisible(false)}
    >
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.flex1}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}>

              {/* ✨ LUXURY HEADER with Order Summary */}
              <Animated.View entering={FadeInDown.duration(400)} style={[styles.orderDetailHeader, {
                backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                borderRadius: 20, padding: SPACING.md, marginBottom: SPACING.md,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 12, elevation: 3,
              }]}>
                {/* Luxury Close Button */}
                <TouchableOpacity
                  style={{
                    position: 'absolute', right: 16, top: 16, zIndex: 10,
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                    justifyContent: 'center', alignItems: 'center',
                  }}
                  onPress={() => setModalVisible(false)}
                >
                  <Ionicons name="close" size={22} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} />
                </TouchableOpacity>

                {/* Order Number - LARGE & PROMINENT */}
                <Text allowFontScaling={false} style={[styles.orderNumberLarge, { color: theme.colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                  {selectedOrder?.orderNumber?.replace(/ORD/g, '')?.replace(/#/g, '')?.replace(/-/g, '')}
                </Text>

                {/* Status Badge - BIG & COLORFUL */}
                <View style={styles.statusBadgeLarge}>
                  <OrderStatusBadge status={selectedOrder?.status || 'pending'} size="large" />
                </View>

                {/* Date & Total Row */}
                <View style={[styles.orderMetaRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                  <View style={[styles.orderMetaItem, { flexShrink: 1, minWidth: 0 }]}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                    <Text allowFontScaling={false} numberOfLines={1} style={[styles.orderMetaText, { color: theme.colors.textSecondary, flexShrink: 1 }]}>
                      {selectedOrder?.createdAt ? formatFirestoreDate(selectedOrder.createdAt, i18n.language === 'ar' ? 'ar-IQ' : i18n.language === 'ku' ? 'ckb-IQ' : 'en-US') : 'N/A'}
                    </Text>
                  </View>
                  <View style={[styles.orderMetaDivider, { backgroundColor: theme.colors.border }]} />
                  <View style={[styles.orderMetaItem, { flexShrink: 0 }]}>
                    <Text allowFontScaling={false} style={[styles.orderTotalValue, { color: theme.colors.primary }]}>
                      {selectedOrder?.totalUSD != null ? formatPrice(selectedOrder.totalUSD, selectedOrder.currency, selectedOrder.exchangeRate) : formatPrice(0, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                    </Text>
                  </View>
                </View>
              </Animated.View>

              {/* ✅ GOLDEN: ScrollView as SINGLE scroll owner for modal content */}
              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
              >

                {/* 👤 CUSTOMER INFO SECTION */}
                <View style={styles.sectionHeader}>
                  <Ionicons name="person" size={22} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
                    {t('admin.orders.customer')}
                  </Text>
                </View>

                <View style={[styles.customerCard, {
                  backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
                }]}>
                  {/* Customer Avatar */}
                  <View style={styles.customerAvatarSection}>
                    {customerPhotoUrl ? (
                      <Image
                        source={{ uri: customerPhotoUrl }}
                        style={styles.customerAvatarLarge}
                      />
                    ) : (
                      <View style={[styles.customerAvatarLarge, styles.customerAvatarPlaceholder, { backgroundColor: theme.colors.primary }]}>
                        <Text allowFontScaling={false} style={styles.customerAvatarText}>
                          {selectedOrder?.shippingAddress?.fullName?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Customer Name - Large & Bold */}
                  <View style={styles.customerRow}>
                    <Ionicons name="person-circle-outline" size={24} color={theme.colors.text} />
                    <Text allowFontScaling={false} style={[styles.customerNameLarge, { color: theme.colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                      {(selectedOrder?.userId && usersMap[selectedOrder.userId]?.fullName) ? usersMap[selectedOrder.userId].fullName : (selectedOrder?.shippingAddress?.fullName || 'N/A')}
                    </Text>
                  </View>

                  {/* Shipping Office Recipient */}
                  {selectedOrder?.shippingOfficeInfo?.recipientName ? (
                    <View style={styles.customerRow}>
                      <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.customerPhone, { color: theme.colors.primary, fontWeight: '600' }]} adjustsFontSizeToFit numberOfLines={1}>
                        {selectedOrder.shippingOfficeInfo.recipientName}
                      </Text>
                    </View>
                  ) : null}

                  {/* Phone Number */}
                  <TouchableOpacity
                    style={styles.customerRow}
                    onPress={() => {
                      const phone = (selectedOrder?.userId && usersMap[selectedOrder.userId]?.phone) ? usersMap[selectedOrder.userId].phone : selectedOrder?.shippingAddress?.phone;
                      if (phone) Linking.openURL(`tel:${phone}`);
                    }}
                  >
                    <Ionicons name="call-outline" size={20} color="#10B981" />
                    <Text allowFontScaling={false} style={[styles.customerPhone, { color: theme.colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                      {(selectedOrder?.userId && usersMap[selectedOrder.userId]?.phone) ? usersMap[selectedOrder.userId].phone : (selectedOrder?.shippingAddress?.phone || 'N/A')}
                    </Text>
                    <View style={styles.callBadge}>
                      <Text allowFontScaling={false} style={styles.callBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('admin.orders.call', { defaultValue: 'Call' })}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* WhatsApp — Iraqi customers live on WhatsApp, not the in-app chat */}
                  {((selectedOrder?.userId && usersMap[selectedOrder.userId]?.phone) || selectedOrder?.shippingAddress?.phone) ? (
                    <TouchableOpacity
                      style={styles.customerRow}
                      onPress={() => {
                        const phone = (selectedOrder?.userId && usersMap[selectedOrder.userId]?.phone) ? usersMap[selectedOrder.userId].phone : selectedOrder?.shippingAddress?.phone;
                        const digits = (phone || '').replace(/[^0-9]/g, '');
                        if (digits) {
                          const msg = `${t('admin.orders.waMessage', { defaultValue: 'Hello, regarding your order' })} ${selectedOrder?.orderNumber || ''}`.trim();
                          Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`);
                        }
                      }}
                    >
                      <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                      <Text allowFontScaling={false} style={[styles.customerPhone, { color: '#25D366' }]} adjustsFontSizeToFit numberOfLines={1}>{t('admin.orders.whatsapp', { defaultValue: 'WhatsApp' })}</Text>
                      <View style={[styles.callBadge, { backgroundColor: '#E7F9EF' }]}>
                        <Text allowFontScaling={false} style={[styles.callBadgeText, { color: '#25D366' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('admin.orders.open', { defaultValue: 'Open' })}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}

                  {/* Message Customer Button - GOLDEN ADDITION */}
                  <TouchableOpacity
                    style={styles.customerRow}
                    onPress={handleMessageCustomer}
                    disabled={messagingCustomer}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#3B82F6" />
                    <Text allowFontScaling={false} style={[styles.customerPhone, { color: '#3B82F6' }]} adjustsFontSizeToFit numberOfLines={1}>
                      {t('admin.orders.messageCustomer', { defaultValue: 'Message Customer' })}
                    </Text>
                    {messagingCustomer ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <View style={[styles.callBadge, { backgroundColor: '#EFF6FF' }]}>
                        <Text allowFontScaling={false} style={[styles.callBadgeText, { color: '#3B82F6' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('admin.orders.chat', { defaultValue: 'Chat' })}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Address */}
                  <View style={styles.customerRow}>
                    <Ionicons name="location-outline" size={20} color="#6B7280" />
                    <Text allowFontScaling={false} style={[styles.customerAddress, { color: theme.colors.textSecondary }]} adjustsFontSizeToFit numberOfLines={2}>
                      {selectedOrder?.shippingAddress?.address}, {selectedOrder?.shippingAddress?.city}
                    </Text>
                  </View>

                  {/* View Map Button */}
                  {selectedOrder?.shippingAddress?.coordinates && (
                    <TouchableOpacity
                      style={styles.viewMapButtonLarge}
                      onPress={handleViewMap}
                    >
                      <Ionicons name="map" size={20} color="#FFF" />
                      <Text allowFontScaling={false} style={styles.viewMapButtonLargeText}>
                        {t('admin.orders.viewMap')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 📦 SECTION TITLE: Order Products */}
                <View style={styles.sectionHeader}>
                  <Ionicons name="cube" size={22} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
                    {t('admin.orders.items')} ({selectedOrder?.items?.length || 0})
                  </Text>
                </View>

                {/* Order Items - Styled Container */}
                <View style={[styles.productCardsContainer, {
                  backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                  borderRadius: 20, padding: SPACING.md,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
                }]}>
                  {selectedOrder?.items?.map((item, index) => {
                    const itemImageUrl = item.imageUrl || item.productSnapshot?.imageUrl;
                    return (
                      <View key={index} style={[styles.itemCard, { backgroundColor: theme.colors.surface }]}>
                        {/* Product Image */}
                        <View style={styles.itemImageContainer}>
                          {itemImageUrl ? (
                            <Image
                              source={{ uri: getThumbnailUrl(itemImageUrl, 120) }}
                              style={styles.itemImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.colors.disabled }]}>
                              <Ionicons name="cube-outline" size={28} color={theme.colors.textSecondary} />
                            </View>
                          )}
                        </View>

                        {/* Product Info */}
                        <View style={styles.itemDetails}>
                          <Text allowFontScaling={false} style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                            {i18n.language === 'ar' && ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) ? ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) : i18n.language === 'ku' && ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) ? ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) : item.productName}
                          </Text>

                          {/* Part Number & Quantity - Bold with parentheses */}
                          <View style={styles.itemMetaRow}>
                            {item.partNumber && (
                              <Text allowFontScaling={false} style={[styles.itemMetaBold, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                                ({item.partNumber})
                              </Text>
                            )}
                            <Text allowFontScaling={false} style={[styles.itemMetaBold, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                              (Qty: {item.quantity})
                            </Text>
                          </View>

                          {/* Selected Options - Color-coded */}
                          {item.selectedOptions && (
                            <View style={styles.itemMetaRow}>
                              {item.selectedOptions.color && (() => {
                                const colorHex = getColorHexAdmin(item.selectedOptions!.color!, isDark);
                                return (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                                    {colorHex && (
                                      <View style={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: 7,
                                        backgroundColor: COLOR_NAME_TO_HEX[item.selectedOptions!.color!.trim().toLowerCase()] || colorHex,
                                        borderWidth: 1,
                                        borderColor: theme.colors.border,
                                        marginRight: 4,
                                      }} />
                                    )}
                                    <Text allowFontScaling={false} style={[styles.itemMetaBold, colorHex ? { color: colorHex, fontWeight: 'bold' } : {}]}>
                                      ({item.selectedOptions!.color})
                                    </Text>
                                  </View>
                                );
                              })()}
                              {item.selectedOptions.size && (
                                <Text allowFontScaling={false} style={[styles.itemMetaBold, { color: theme.colors.textSecondary }]}>
                                  ({item.selectedOptions.size})
                                </Text>
                              )}
                            </View>
                          )}
                        </View>

                        {/* Price */}
                        <View style={styles.itemPriceContainer}>
                          <Text allowFontScaling={false} style={[styles.itemPriceLabel, { color: theme.colors.primary }]}>
                            {formatPrice(item.priceUSD * item.quantity, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                          </Text>
                          {/* 💰 Per-item Profit (admin-only) — hidden on partner-tagged orders (partner's profit, not owner's) */}
                          {!(selectedOrder as any)?.partnerId && item.purchasePrice != null && item.purchasePrice > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                              <Ionicons name="trending-up" size={13} color="#10B981" style={{ marginRight: 3 }} />
                              <Text allowFontScaling={false} style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                                {formatPrice((item.priceUSD - item.purchasePrice) * item.quantity, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  <View style={[styles.summaryBlock, { borderTopColor: theme.colors.border }]}>
                    <View style={styles.summaryRow}>
                      <Text allowFontScaling={false}
                        style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        {t('admin.orders.subtotal')}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.summaryValue, { color: theme.colors.text }]}>
                        {selectedOrder?.subtotalUSD != null ? formatPrice(selectedOrder.subtotalUSD, selectedOrder.currency, selectedOrder.exchangeRate) : formatPrice(0, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text allowFontScaling={false}
                        style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        {t('admin.orders.shipping')}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.summaryValue, { color: theme.colors.text }]}>
                        {selectedOrder?.shippingUSD != null ? formatPrice(selectedOrder.shippingUSD, selectedOrder.currency, selectedOrder.exchangeRate) : formatPrice(0, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                      </Text>
                    </View>
                    {(selectedOrder?.taxUSD || 0) > 0 && (
                      <View style={styles.summaryRow}>
                        <Text allowFontScaling={false}
                          style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
                          adjustsFontSizeToFit
                          numberOfLines={1}
                        >
                          {t('admin.orders.tax')}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.summaryValue, { color: theme.colors.text }]}>
                          {selectedOrder?.taxUSD != null ? formatPrice(selectedOrder.taxUSD, selectedOrder.currency, selectedOrder.exchangeRate) : formatPrice(0, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                        </Text>
                      </View>
                    )}
                    {(selectedOrder?.discountUSD || 0) > 0 && (
                      <View style={styles.summaryRow}>
                        <Text allowFontScaling={false}
                          style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
                          adjustsFontSizeToFit
                          numberOfLines={1}
                        >
                          {t('admin.orders.discount', { defaultValue: 'Discount' })}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.summaryValue, { color: '#10B981' }]}>
                          -{formatPrice(selectedOrder?.discountUSD || 0, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.totalRow}>
                      <Text allowFontScaling={false}
                        style={[styles.totalLabel, { color: theme.colors.text }]}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        {t('admin.orders.total')}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.totalValue, { color: theme.colors.primary }]}>
                        {selectedOrder?.totalUSD != null ? formatPrice(selectedOrder.totalUSD, selectedOrder.currency, selectedOrder.exchangeRate) : formatPrice(0, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                      </Text>
                    </View>
                    {/* 💰 TOTAL ORDER PROFIT (admin-only) */}
                    {(() => {
                      // Partner-tagged orders are the partner's — no owner profit shown.
                      const isPartnerOrder = !!(selectedOrder as any)?.partnerId;
                      // The whole-order discount comes straight out of the margin, so it must be
                      // netted off here exactly like the in-store ring-up does — otherwise a
                      // discounted sale reads back overstated by the discount amount.
                      const totalProfit = (selectedOrder?.items || []).reduce((sum, itm) => {
                        if (itm.purchasePrice != null && itm.purchasePrice > 0) {
                          return sum + (itm.priceUSD - itm.purchasePrice) * itm.quantity;
                        }
                        return sum;
                      }, 0) - (selectedOrder?.discountUSD || 0);
                      const hasAnyPurchasePrice = !isPartnerOrder && (selectedOrder?.items || []).some(itm => itm.purchasePrice != null && itm.purchasePrice > 0);
                      if (!hasAnyPurchasePrice) return null;
                      return (
                        <View style={[styles.totalRow, { borderTopColor: '#10B981', borderTopWidth: 1, marginTop: 6, paddingTop: 10 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="trending-up" size={18} color="#10B981" style={{ marginRight: 6 }} />
                            <Text allowFontScaling={false} style={[styles.totalLabel, { color: '#10B981' }]} adjustsFontSizeToFit numberOfLines={1}>
                              {t('admin.orders.profit', { defaultValue: 'Profit' })}
                            </Text>
                          </View>
                          <Text allowFontScaling={false} style={[styles.totalValue, { color: '#10B981' }]}>
                            {formatPrice(totalProfit, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>

                {/* Special Instructions / Notes.
                    TWO COLUMNS, because the two surfaces write different ones:
                    this app writes the customer's note to `orders.notes`
                    (OrderService.ts:186) while the website writes it to
                    `orders.special_instructions`. Reading only `notes` meant a
                    web customer's delivery instruction — "call before you come",
                    "second floor" — never reached the shop at all. Neither
                    column is duplicated on write; the readers just have to know
                    about both. */}
                {(selectedOrder?.notes || (selectedOrder as any)?.special_instructions) && (
                  <View style={[styles.modalSection, { backgroundColor: theme.colors.background }]}>
                    <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.textSecondary }]}>
                      {t('admin.orders.specialInstructions', { defaultValue: 'Special Instructions' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.modalValue, { color: theme.colors.text }]}>
                      {selectedOrder?.notes || (selectedOrder as any)?.special_instructions}
                    </Text>
                  </View>
                )}

                {/* Shipping Office Info (for out-of-country customers) */}
                {selectedOrder?.shippingOfficeInfo && (
                  <View style={[styles.modalSection, { backgroundColor: isDark ? theme.colors.surface : theme.colors.primary + '15' }]}>
                    <View style={styles.shippingOfficeHeader}>
                      <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.primary, marginLeft: 8, marginBottom: 0 }]}>
                        {t('shippingInfo.title', { defaultValue: 'Shipping Office' })}
                      </Text>
                    </View>
                    <View style={styles.shippingOfficeGrid}>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.recipientName', { defaultValue: 'Recipient' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {selectedOrder.shippingOfficeInfo.recipientName}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.mobileNumber', { defaultValue: 'Mobile' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {selectedOrder.shippingOfficeInfo.mobileNumber}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.officeName', { defaultValue: 'Office Name' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {selectedOrder.shippingOfficeInfo.officeName}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.officePhone', { defaultValue: 'Office Phone' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {selectedOrder.shippingOfficeInfo.officePhone}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.copyShippingButton, { backgroundColor: theme.colors.primary + '1A' }]}
                      onPress={() => {
                        const info = selectedOrder.shippingOfficeInfo;
                        const text = `${t('shippingInfo.title', { defaultValue: 'Shipping Information Office' })}:\n${t('shippingInfo.recipientName', { defaultValue: 'Recipient Name' })}: ${info?.recipientName}\n${t('shippingInfo.mobileNumber', { defaultValue: 'Mobile Number' })}: ${info?.mobileNumber}\n${t('shippingInfo.officeName', { defaultValue: 'Shipping Office Name' })}: ${info?.officeName}\n${t('shippingInfo.officePhone', { defaultValue: 'Shipping Office Phone' })}: ${info?.officePhone}`;
                        Alert.alert(
                          t('admin.orders.shippingOfficeCopied', { defaultValue: 'Shipping Office Info' }),
                          text,
                          [{ text: t('common.ok') }]
                        );
                      }}
                    >
                      <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.copyShippingButtonText, { color: theme.colors.primary }]}>
                        {t('admin.orders.viewDetails', { defaultValue: 'View Details' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Money Exchanger Payment Info */}
                {(selectedOrder as any)?.moneyExchangerInfo && (
                  <View style={[styles.modalSection, { backgroundColor: isDark ? theme.colors.surface : theme.colors.primary + '15' }]}>
                    <View style={styles.shippingOfficeHeader}>
                      <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.warning} />
                      <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.warning, marginLeft: 8, marginBottom: 0 }]}>
                        {t('checkout.moneyExchangerDetails', { defaultValue: 'Money Transfer Details' })}
                      </Text>
                    </View>
                    <View style={styles.shippingOfficeGrid}>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('checkout.exchangeOfficeName', { defaultValue: 'Office Name' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {(selectedOrder as any).moneyExchangerInfo.officeName}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('checkout.exchangeOfficePhone', { defaultValue: 'Office Phone' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {(selectedOrder as any).moneyExchangerInfo.officePhone}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('checkout.receiverName', { defaultValue: 'Receiver Name' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {(selectedOrder as any).moneyExchangerInfo.receiverName}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('checkout.receiverPhone', { defaultValue: 'Receiver Phone' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {(selectedOrder as any).moneyExchangerInfo.receiverPhone}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('checkout.totalAmount', { defaultValue: 'Total Amount' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.success, fontWeight: '600' }]}>
                          ${(selectedOrder as any).moneyExchangerInfo.totalAmount}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.copyShippingButton, { backgroundColor: theme.colors.warning + '1A' }]}
                      onPress={() => {
                        const info = (selectedOrder as any).moneyExchangerInfo;
                        const text = `${t('checkout.moneyExchangerDetails', { defaultValue: 'Money Transfer Details' })}:\n${t('checkout.exchangeOfficeName', { defaultValue: 'Office Name' })}: ${info?.officeName}\n${t('checkout.exchangeOfficePhone', { defaultValue: 'Office Phone' })}: ${info?.officePhone}\n${t('checkout.receiverName', { defaultValue: 'Receiver Name' })}: ${info?.receiverName}\n${t('checkout.receiverPhone', { defaultValue: 'Receiver Phone' })}: ${info?.receiverPhone}\n${t('checkout.totalAmount', { defaultValue: 'Total Amount' })}: ${info?.totalAmount != null ? formatPrice(Number(info.totalAmount), selectedOrder?.currency, selectedOrder?.exchangeRate) : ''}`;
                        Alert.alert(
                          t('checkout.moneyExchangerDetails', { defaultValue: 'Money Transfer Details' }),
                          text,
                          [{ text: t('common.ok') }]
                        );
                      }}
                    >
                      <Ionicons name="copy-outline" size={16} color={theme.colors.warning} />
                      <Text allowFontScaling={false} style={[styles.copyShippingButtonText, { color: theme.colors.warning }]}>
                        {t('admin.orders.viewDetails', { defaultValue: 'View Details' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* QiCard Payment Info */}
                {selectedOrder?.paymentMethod === 'qi_card' && (
                  <View style={[styles.modalSection, { backgroundColor: isDark ? theme.colors.surface : theme.colors.primary + '15' }]}>
                    <View style={styles.shippingOfficeHeader}>
                      <MaterialCommunityIcons name="credit-card-check-outline" size={20} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.primary, marginLeft: 8, marginBottom: 0 }]}>
                        {t('admin.orders.qiCardPayment', { defaultValue: 'QI Card Payment' })}
                      </Text>
                    </View>
                    <View style={styles.shippingOfficeGrid}>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('admin.orders.paymentStatus', { defaultValue: 'Status' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: selectedOrder.paymentStatus === 'paid' ? theme.colors.success : theme.colors.warning }]}>
                          {selectedOrder.paymentStatus === 'paid' 
                            ? t('admin.orders.paid', { defaultValue: 'Paid' }) 
                            : t('admin.orders.pending', { defaultValue: 'Pending' })}
                        </Text>
                      </View>
                      
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('admin.orders.iqdAmount', { defaultValue: 'Amount (IQD)' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text, fontWeight: '600' }]}>
                          {Math.round((selectedOrder.totalUSD || 0) * (selectedOrder.exchangeRate || 1)).toLocaleString()} IQD
                        </Text>
                      </View>
                      
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('admin.orders.usdAmount', { defaultValue: 'Amount (USD)' })}:
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          ${(selectedOrder.totalUSD || 0).toFixed(2)}
                        </Text>
                      </View>

                      {selectedOrder.exchangeRate && (
                        <View style={styles.shippingOfficeRow}>
                          <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                            {t('admin.orders.exchangeRateApplied', { defaultValue: 'Exchange Rate' })}:
                          </Text>
                          <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                            1 USD = {selectedOrder.exchangeRate.toLocaleString()} IQD
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Tracking URL for Processing/Shipped Orders */}
                {['processing', 'shipped'].includes(selectedOrder?.status || '') && (
                  <View style={[styles.modalSection, { backgroundColor: theme.colors.background }]}>
                    <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.textSecondary }]}>
                      {t('admin.orders.trackingUrlLabel', { defaultValue: 'Tracking URL (GPSOPS)' })}
                    </Text>
                    <TextInput allowFontScaling={false}
                      style={[styles.trackingInput, {
                        color: theme.colors.text,
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border
                      }]}
                      placeholder="https://gpsops.com/track/..."
                      placeholderTextColor={theme.colors.textSecondary}
                      value={trackingUrl}
                      onChangeText={setTrackingUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[styles.saveTrackingButton, { backgroundColor: theme.colors.primary }]}
                      disabled={updating}
                      accessibilityState={{ disabled: updating }}
                      onPress={async () => {
                        if (!tenantId || !selectedOrder) return;
                        // No guard and no disabled prop at all previously. The tracking
                        // write itself is an absolute set and harmless twice, but the
                        // same handler then appends to the customer's chat — so two taps
                        // during the round trip sent two identical "shipped" messages,
                        // and two concurrent createAdminInitiatedConversation calls could
                        // mint duplicate conversations.
                        if (orderWriteRef.current) return;
                        orderWriteRef.current = true;
                        setUpdating(true);
                        try {
                          const service = createTenantAdminService(tenantId);
                          await service.updateOrderTracking(selectedOrder.id, trackingUrl);
                          setOrders(prev => prev.map(o =>
                            o.id === selectedOrder.id ? { ...o, trackingUrl } : o
                          ));

                          // AUTO-SEND tracking URL to the user's chat as a message
                          // ChatScreen will auto-detect the URL and render a "Track Order" button
                          if (trackingUrl && selectedOrder.userId && propsUser?.uid) {
                            try {
                              const conversation = await createAdminInitiatedConversation(
                                tenantId,
                                selectedOrder.userId,
                                propsUser.uid,
                                selectedOrder.items?.[0]?.productId,
                                selectedOrder.items?.[0]?.productSnapshot
                              );

                              const orderNum = selectedOrder.orderNumber?.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '') || 'N/A';
                              const msgText = `${t('admin.orders.shippedMsgHeader', { order: orderNum, defaultValue: '📦 Order {{order}} has been shipped!' })}\n\n${t('admin.orders.shippedMsgTrack', { url: trackingUrl, defaultValue: '📍 Track your order: {{url}}' })}\n\n${t('admin.orders.shippedMsgThanks', { defaultValue: 'Thank you for your business!' })}`;

                              await sendMessage(
                                conversation.id,
                                msgText,
                                propsUser.uid,
                                'admin',
                                'Admin'
                              );
                            } catch (msgErr) {
                              console.warn('Failed to auto-send tracking message:', msgErr);
                            }
                          }

                          Alert.alert(t('admin.common.success'), t('admin.orders.trackingUrlSaved', { defaultValue: 'Tracking URL saved' }));
                        } catch (error) {
                          Alert.alert(t('admin.common.error'), t('admin.orders.trackingUrlSaveFailed', { defaultValue: 'Failed to save tracking URL' }));
                        } finally {
                          setUpdating(false);
                          orderWriteRef.current = false;
                        }
                      }}
                    >
                      <Ionicons name="save-outline" size={16} color={theme.colors.surface} />
                      <Text allowFontScaling={false} style={[styles.saveTrackingButtonText, { color: theme.colors.surface }]}>
                        {t('admin.orders.saveTrackingUrl', { defaultValue: 'Save Tracking URL' })}
                      </Text>
                    </TouchableOpacity>

                    {/* GPS Map Preview */}
                    {(trackingUrl || selectedOrder?.trackingUrl) && (
                      <View style={{ marginTop: 12 }}>
                        <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
                          📍 {t('admin.orders.gpsTrackingPreview', { defaultValue: 'GPS Tracking Preview' })}
                        </Text>
                        <LiveOrderMap
                          orderId={selectedOrder?.id || ''}
                          trackingUrl={trackingUrl || selectedOrder?.trackingUrl}
                          deliveryAddress={selectedOrder?.shippingAddress?.coordinates}
                        />
                      </View>
                    )}
                  </View>
                )}

                {/* Payment Approval Section for Money Exchanger */}
                {(selectedOrder?.paymentMethod === 'money_exchanger' || (selectedOrder as any)?.moneyExchangerInfo) && selectedOrder?.paymentStatus === 'pending' && (
                  <View style={[styles.modalSection, { backgroundColor: isDark ? theme.colors.surface : theme.colors.primary + '15', marginTop: SPACING.md, borderColor: theme.colors.warning, borderWidth: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
                      <Ionicons name="alert-circle" size={24} color={theme.colors.warning} />
                      <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.text, marginLeft: 8, marginBottom: 0, fontWeight: 'bold' }]}>
                        {t('admin.orders.paymentApprovalRequired', { defaultValue: 'Payment Approval Required' })}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginBottom: SPACING.md }}>
                      {t('admin.orders.moneyExchangerReviewMessage', { defaultValue: 'Please review the money transfer details above. If verified, approve the payment.' })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: theme.colors.success, padding: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                        onPress={() => handleUpdatePaymentStatus(selectedOrder, 'paid')}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: 'bold' }}>
                          {t('admin.orders.approvePayment', { defaultValue: 'Approve Payment' })}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: theme.colors.error, padding: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                        onPress={() => handleUpdatePaymentStatus(selectedOrder, 'failed')}
                      >
                        <Ionicons name="close-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: 'bold' }}>
                          {t('admin.orders.declinePayment', { defaultValue: 'Decline Payment' })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Partial Payments Section */}
                <View style={[styles.modalSection, { backgroundColor: isDark ? theme.colors.surface : theme.colors.primary + '15', marginTop: SPACING.md, borderColor: theme.colors.border, borderWidth: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
                    <Ionicons name="cash-outline" size={20} color={theme.colors.primary} />
                    <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.text, marginLeft: 8, marginBottom: 0, fontWeight: 'bold', textTransform: 'uppercase', fontSize: 13 }]}>
                      {t('admin.orders.paymentDetails', 'Payment Details')}
                    </Text>
                  </View>

                  <View style={styles.shippingOfficeGrid}>
                    <View style={styles.shippingOfficeRow}>
                      <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary, fontWeight: 'bold' }]}>
                        {t('admin.orders.total', 'Total Amount')}:
                      </Text>
                      <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text, fontWeight: 'bold', fontSize: 16 }]}>
                        {selectedOrder?.totalUSD != null ? formatPrice(selectedOrder.totalUSD, selectedOrder.currency, selectedOrder.exchangeRate) : '$0'}
                      </Text>
                    </View>

                    <View style={[styles.shippingOfficeRow, { alignItems: 'center', marginVertical: 8 }]}>
                      <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary, fontWeight: 'bold' }]}>
                        {t('admin.orders.amountPaid', 'Amount Paid')}:
                      </Text>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? theme.colors.background : '#FFFFFF', borderRadius: 8, paddingHorizontal: 12, height: 44 }}>
                        <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginRight: 8, fontWeight: '600', fontSize: 16 }}>
                          {selectedOrder?.currency === 'IQD' ? 'IQD' : '$'}
                        </Text>
                        <TextInput allowFontScaling={false}
                          style={{ flex: 1, color: theme.colors.text, fontSize: 16, fontWeight: '600', height: 40, includeFontPadding: false, textAlignVertical: 'center', paddingVertical: 0, textAlign: 'left' }}
                          placeholder="0.00"
                          placeholderTextColor={theme.colors.textSecondary}
                          keyboardType="numeric"
                          value={amountPaidInput}
                          onChangeText={setAmountPaidInput}
                        />
                      </View>
                    </View>

                    <View style={styles.shippingOfficeRow}>
                      <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary, fontWeight: 'bold' }]}>
                        {t('admin.orders.remainingBalance', 'Remaining Balance')}:
                      </Text>
                      <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.error, fontWeight: 'bold', fontSize: 16 }]}>
                        {(() => {
                          const exchangeRate = selectedOrder?.exchangeRate || 1;
                          let totalNative = selectedOrder?.totalUSD || 0;
                          if (selectedOrder?.currency === 'IQD') {
                            totalNative = convertUSDToIQD(totalNative, exchangeRate);
                          }

                          const paidNative = parseFloat(amountPaidInput) || 0;
                          const remainingNative = Math.max(0, totalNative - paidNative);

                          if (selectedOrder?.currency === 'IQD') {
                            return `IQD ${new Intl.NumberFormat('en-US').format(Math.round(remainingNative))}`;
                          } else {
                            return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(remainingNative)}`;
                          }
                        })()}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: SPACING.md }}>
                    <TouchableOpacity
                      style={{
                        flex: 1.1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 12,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        minHeight: 48,
                        backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                        borderColor: theme.colors.success,
                        borderWidth: 1
                      }}
                      onPress={handleMarkAsPaidInFull}
                      disabled={updating}
                    >
                      <Ionicons name="checkmark-done" size={18} color={theme.colors.success} style={{ marginRight: 4 }} />
                      <Text allowFontScaling={false}
                        style={{ color: theme.colors.success, fontWeight: 'bold', fontSize: 15, flexShrink: 1, textAlign: 'center' }}
                      >
                        {t('admin.orders.paidInFull', 'Paid in Full')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 0.9,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 12,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        minHeight: 48,
                        backgroundColor: theme.colors.primary
                      }}
                      onPress={handleUpdateAmountPaid}
                      disabled={updating}
                    >
                      {updating ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 4 }} />
                          <Text allowFontScaling={false}
                            style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, flexShrink: 1, textAlign: 'center' }}
                          >
                            {t('admin.orders.update', 'Update')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Status Update Section - Styled */}
                <View style={[styles.modalSection, {
                  backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                  marginTop: SPACING.md,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
                }]}>
                  <Text allowFontScaling={false} style={[styles.modalLabel, { color: theme.colors.textSecondary, marginBottom: SPACING.sm }]}>
                    {t('admin.orders.confirmUpdateTitle')}
                  </Text>
                  <View style={styles.statusGrid}>
                    {UPDATE_STATUSES.map(status => (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.statusOption,
                          {
                            backgroundColor: getStatusColor(status, t) + '15',
                            borderWidth: selectedOrder?.status === status ? 2 : 0,
                            borderColor: selectedOrder?.status === status ? getStatusColor(status, t) : undefined,
                          }
                        ]}
                        onPress={() => selectedOrder && handleStatusUpdate(selectedOrder, status)}
                        disabled={updating || selectedOrder?.status === status}
                      >
                        {updating ? (
                          <ActivityIndicator size="small" color={getStatusColor(status, t)} />
                        ) : (
                          <Text allowFontScaling={false}
                            style={[styles.statusOptionText, { color: getStatusColor(status, t), textAlign: 'center' }]}
                            numberOfLines={1}
                          >
                            {getStatusConfig(status, t).text}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Print Invoice Button */}
                <TouchableOpacity
                  style={[styles.printInvoiceButton, { backgroundColor: theme.colors.primary }]}
                  onPress={() => showPrintLanguageOptions()}
                >
                  <Ionicons name="print-outline" size={20} color="#FFF" />
                  <Text allowFontScaling={false} style={styles.printInvoiceButtonText}>
                    {t('admin.orders.printInvoice', { defaultValue: 'Print Invoice' })}
                  </Text>
                </TouchableOpacity>

                {/* Return / Refund (restocks items + refunds) */}
                {selectedOrder && !selectedOrder.status.includes('cancelled') && ((selectedOrder.items || []).length > 0) && (
                  <TouchableOpacity
                    style={[styles.printInvoiceButton, { backgroundColor: '#8B5CF6', marginTop: 10 }]}
                    onPress={() => { setReturnQtys({}); setReturnModalOpen(true); }}
                  >
                    <Ionicons name="arrow-undo-outline" size={20} color="#FFF" />
                    <Text allowFontScaling={false} style={styles.printInvoiceButtonText}>
                      {t('admin.orders.returnRefund', { defaultValue: 'Return / Refund' })}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Delete Button for Cancelled Orders */}
                {selectedOrder?.status.includes('cancelled') && (
                  <TouchableOpacity
                    style={[styles.deleteOrderButton, { backgroundColor: '#F44336' }]}
                    onPress={() => selectedOrder && handleDeleteOrder(selectedOrder)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text allowFontScaling={false}
                      style={styles.deleteOrderButtonText}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.orders.deleteCancelledOrder')}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>

          {/* Return / Refund picker — overlay INSIDE this transparent modal. React Native can't
              reliably show two <Modal>s at once, so the old sibling returns Modal opened BEHIND the
              order-detail modal and looked like "nothing happened" on tap. */}
          {returnModalOpen && (
            <View style={[StyleSheet.absoluteFill, styles.returnOverlay]}>
              <View style={[styles.returnSheet, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.returnHeader}>
                  <Text allowFontScaling={false} style={[styles.returnTitle, { color: theme.colors.text }]}>{t('admin.orders.returnRefund', { defaultValue: 'Return / Refund' })}</Text>
                  <TouchableOpacity onPress={() => setReturnModalOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
                <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 10 }}>
                  {t('admin.orders.returnHint', { defaultValue: 'Choose how many of each item to return — they go back in stock and the total is refunded.' })}
                </Text>
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {((selectedOrder?.items || []) as any[]).map((it, i) => {
                    const max = it.quantity || 0;
                    const ret = returnQtys[i] || 0;
                    return (
                      <View key={i} style={[styles.returnRow, { borderColor: theme.colors.border }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{it.productName}</Text>
                          <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                            {formatPrice(it.priceUSD, selectedOrder?.currency, selectedOrder?.exchangeRate)} · {t('admin.orders.ordered', { defaultValue: 'ordered' })} {max}
                          </Text>
                        </View>
                        <View style={styles.returnStepper}>
                          <TouchableOpacity disabled={ret <= 0} onPress={() => setReturnQtys(p => ({ ...p, [i]: Math.max(0, (p[i] || 0) - 1) }))} style={[styles.returnStepBtn, { borderColor: theme.colors.border, opacity: ret <= 0 ? 0.4 : 1 }]}>
                            <Ionicons name="remove" size={16} color={theme.colors.text} />
                          </TouchableOpacity>
                          <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '800', minWidth: 26, textAlign: 'center' }}>{ret}</Text>
                          <TouchableOpacity disabled={ret >= max} onPress={() => setReturnQtys(p => ({ ...p, [i]: Math.min(max, (p[i] || 0) + 1) }))} style={[styles.returnStepBtn, { borderColor: theme.colors.border, opacity: ret >= max ? 0.4 : 1 }]}>
                            <Ionicons name="add" size={16} color={theme.colors.text} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
                {(() => {
                  const its = (selectedOrder?.items || []) as any[];
                  const qtySelected = its.reduce((s, _it, i) => s + (returnQtys[i] || 0), 0);
                  const refund = its.reduce((s, it, i) => s + (it.priceUSD || 0) * (returnQtys[i] || 0), 0);
                  return (
                    <TouchableOpacity
                      disabled={qtySelected <= 0 || returning}
                      onPress={handleConfirmReturn}
                      style={[styles.returnConfirmBtn, { backgroundColor: qtySelected > 0 ? '#8B5CF6' : theme.colors.border, opacity: returning ? 0.7 : 1 }]}
                      activeOpacity={0.9}
                    >
                      {returning ? <ActivityIndicator color="#fff" /> : (
                        <Text allowFontScaling={false} style={styles.returnConfirmText}>
                          {t('admin.orders.confirmRefund', { defaultValue: 'Refund' })} {formatPrice(refund, selectedOrder?.currency, selectedOrder?.exchangeRate)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderMapModal = () => (
    <Modal
      visible={mapModalVisible}
      transparent
      animationType="fade"
      onRequestClose={closeMapModal}
    >
      <View style={styles.mapModalOverlay}>
        <View style={[styles.mapModalContent, { backgroundColor: theme.colors.surface }]}>
          {/* Map Header */}
          <View style={styles.mapModalHeader}>
            <Text allowFontScaling={false} style={[styles.mapModalTitle, { color: theme.colors.text }]}>
              {selectedLocation?.title || t('admin.orders.deliveryLocation')}
            </Text>
            <TouchableOpacity onPress={closeMapModal}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Map View */}
          {selectedLocation && (() => {
            const OrderMarker = getOrdersMarker();
            return (
              <View style={styles.mapContainer}>
                <SafeMapView
                  style={styles.map}
                  initialRegion={{
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  {OrderMarker && (
                    <OrderMarker
                      coordinate={{
                        latitude: selectedLocation.latitude,
                        longitude: selectedLocation.longitude,
                      }}
                      title={selectedLocation.title}
                    />
                  )}
                </SafeMapView>
              </View>
            );
          })()}

          {/* Open in Maps Button */}
          <TouchableOpacity
            style={[styles.openMapsButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleOpenInMaps}
          >
            <Ionicons name="navigate" size={20} color={theme.colors.surface} />
            <Text allowFontScaling={false} style={[styles.openMapsButtonText, { color: theme.colors.surface }]}>
              {t('admin.orders.openInMaps')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Tenant gate (GOLDEN RULE): never render admin order data without a tenantId.
  if (!tenantId) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false}
            style={[styles.loadingText, { color: theme.colors.text }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('admin.orders.loadingTenant', { defaultValue: 'Loading business data...' })}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false}
            style={[styles.loadingText, { color: theme.colors.text }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('admin.orders.loading')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <StatusBar style={isDark ? 'light' : 'dark'} />

          {/* In-Store Sales view: own back button + "New Sale" FAB */}
          {route.params?.source === 'in-store' && (
            <>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ position: 'absolute', top: insets.top + 8, ...(isRTL ? { right: 12 } : { left: 12 }), zIndex: 20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? theme.colors.surface : '#fff', elevation: 4 }}
              >
                <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={theme.colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('AdminCreateOrder')}
                style={{ position: 'absolute', bottom: 24 + insets.bottom, right: 20, zIndex: 20, height: 52, paddingHorizontal: 18, borderRadius: 26, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
              >
                <Ionicons name="add" size={22} color="#fff" />
                <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{t('admin.inStore.newSale', { defaultValue: 'New Sale' })}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Search Bar */}
          <View
            style={[styles.searchSection, { paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44) }]}
          >
            <View style={[styles.searchContainer, {
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0 : 0.06,
              shadowRadius: 8,
              elevation: 2,
            }]}>
              <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
              <TextInput allowFontScaling={false}
                style={[styles.searchInput, { color: theme.colors.text }]}
                placeholder={t('admin.orders.searchPlaceholder')}
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear', { defaultValue: 'Clear' })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Today summary + sort order (hidden in the in-store view) */}
          {route.params?.source !== 'in-store' && (
            <View style={styles.todayStrip}>
              <View style={styles.todayItem}>
                <Text allowFontScaling={false} style={[styles.todayValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{todayStats.count}</Text>
                <Text allowFontScaling={false} style={[styles.todayLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>{t('admin.orders.todayOrders', { defaultValue: 'Today' })}</Text>
              </View>
              <View style={[styles.todayDivider, { backgroundColor: theme.colors.border + '50' }]} />
              <View style={styles.todayItem}>
                <Text allowFontScaling={false} style={[styles.todayValue, { color: '#059669' }]} numberOfLines={1} adjustsFontSizeToFit>{formatPrice(todayStats.sales)}</Text>
                <Text allowFontScaling={false} style={[styles.todayLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>{t('admin.orders.todaySales', { defaultValue: 'Sales' })}</Text>
              </View>
              <View style={[styles.todayDivider, { backgroundColor: theme.colors.border + '50' }]} />
              <View style={styles.todayItem}>
                <Text allowFontScaling={false} style={[styles.todayValue, { color: todayStats.unpaid > 0.01 ? '#DC2626' : theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{formatPrice(todayStats.unpaid)}</Text>
                <Text allowFontScaling={false} style={[styles.todayLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>{t('admin.orders.todayUnpaid', { defaultValue: 'Unpaid' })}</Text>
              </View>
              <TouchableOpacity style={[styles.sortToggle, { borderColor: theme.colors.primary + '40' }]} onPress={() => setSortOldestFirst(s => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="swap-vertical" size={15} color={theme.colors.primary} />
                <Text allowFontScaling={false} style={[styles.sortToggleText, { color: theme.colors.primary }]} numberOfLines={1}>{sortOldestFirst ? t('admin.orders.oldest', { defaultValue: 'Oldest' }) : t('admin.orders.newest', { defaultValue: 'Newest' })}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filter Tabs */}
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContainer}
              keyboardShouldPersistTaps="always"
            >
              {([...ORDER_FILTERS, 'unpaid'] as (OrderStatus | 'all' | 'unpaid')[]).map((filter) => {
                const filterColors: Record<string, string> = {
                  all: theme.colors.primary,
                  unpaid: '#DC2626',
                  pending: '#f59e0b',
                  confirmed: '#3b82f6',
                  processing: '#8b5cf6',
                  shipped: '#06b6d4',
                  delivered: '#10b981',
                  cancelled_by_store: '#ef4444',
                  cancelled_by_user: '#f97316',
                };
                const color = filterColors[filter] || theme.colors.primary;
                const isActive = selectedFilter === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[
                      styles.filterTab,
                      {
                        backgroundColor: isActive ? color : isDark ? theme.colors.surface : color + '15',
                        borderWidth: isActive ? 0 : 1,
                        borderColor: isActive ? 'transparent' : color + '40',
                      }
                    ]}
                    onPress={() => { setSelectedFilter(filter); if (filter === 'unpaid') loadUnpaid(); }}
                  >
                    <Text allowFontScaling={false}
                      adjustsFontSizeToFit={true}
                      numberOfLines={1}
                      minimumFontScale={0.5}
                      style={[
                        styles.filterText,
                        { color: isActive ? '#fff' : color, fontWeight: isActive ? '700' : '500' }
                      ]}
                    >
                      {(filter === 'all' ? t('admin.orders.all') : filter === 'unpaid' ? t('admin.orders.unpaid', { defaultValue: 'Unpaid' }) : t(`orders.status.${filter}`)) + (tabCounts[filter] ? ` (${tabCounts[filter]})` : '')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Orders List */}
          <FlatList
            ref={listRef}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            data={filteredOrders}
            keyExtractor={(item) => `${tenantId}_${item.id}`}
            renderItem={renderOrderItem}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: LAYOUT.TAB_BAR_HEIGHT + insets.bottom + SPACING.md }
            ]}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={{
                  width: 72, height: 72, borderRadius: 20,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  justifyContent: 'center', alignItems: 'center', marginBottom: 16,
                }}>
                  <Ionicons name={searchQuery ? 'search-outline' : 'receipt-outline'} size={32} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'} />
                </View>
                <Text allowFontScaling={false}
                  style={[styles.emptyText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }]}
                  adjustsFontSizeToFit
                  numberOfLines={2}
                >
                  {searchQuery
                    ? t('admin.orders.noSearchResults', { query: searchQuery, defaultValue: `No results for "${searchQuery}"` })
                    : selectedFilter !== 'all'
                      ? t('admin.orders.noStatusOrders', { status: t(`orders.status.${selectedFilter}`), defaultValue: 'No orders in this filter' })
                      : t('admin.orders.noOrders')}
                </Text>
                {searchQuery ? (
                  <View style={{ alignItems: 'center', marginTop: 14 }}>
                    <TouchableOpacity
                      onPress={runServerSearch}
                      disabled={serverSearching}
                      style={[styles.emptyClearBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, minWidth: 190, alignItems: 'center' }]}
                    >
                      {serverSearching ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('admin.orders.searchAllOrders', { defaultValue: 'Search all orders' })}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSelectedFilter('all'); }} style={{ marginTop: 10 }}>
                      <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 }}>{t('admin.orders.clearSearch', { defaultValue: 'Clear search' })}</Text>
                    </TouchableOpacity>
                  </View>
                ) : selectedFilter !== 'all' ? (
                  <TouchableOpacity
                    onPress={() => setSelectedFilter('all')}
                    style={[styles.emptyClearBtn, { borderColor: theme.colors.primary + '50' }]}
                  >
                    <Text allowFontScaling={false} style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13 }}>{t('admin.orders.showAll', { defaultValue: 'Show all orders' })}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            }
          />

          {/* Bulk action bar — appears in multi-select mode (long-press a card to enter) */}
          {selectionMode && (
            <View style={[styles.bulkBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '50', bottom: Math.max(insets.bottom, 12) + 100 }]}>
              <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
              <Text allowFontScaling={false} style={[styles.bulkCount, { color: theme.colors.text }]} numberOfLines={1}>
                {t('admin.orders.selectedCount', { count: selectedIds.size, defaultValue: `${selectedIds.size} selected` })}
              </Text>
              <View style={{ flex: 1 }} />
              {bulkUpdating ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <>
                  <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: '#06b6d4', opacity: selectedIds.size ? 1 : 0.5 }]} disabled={!selectedIds.size} onPress={() => bulkSetStatus('shipped' as OrderStatus)}>
                    <Text allowFontScaling={false} style={styles.bulkBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('orders.status.shipped')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: '#10b981', opacity: selectedIds.size ? 1 : 0.5 }]} disabled={!selectedIds.size} onPress={() => bulkSetStatus('delivered' as OrderStatus)}>
                    <Text allowFontScaling={false} style={styles.bulkBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('orders.status.delivered')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {modalVisible && renderStatusModal()}
          {mapModalVisible && renderMapModal()}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  signalPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  signalText: { fontSize: 11.5, fontWeight: '700' },
  todayStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.md, marginBottom: SPACING.sm, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(127,127,127,0.06)' },
  todayItem: { flex: 1, alignItems: 'center' },
  todayValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  todayLabel: { fontSize: 10.5, marginTop: 1, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  todayDivider: { width: 1, height: 26, marginHorizontal: 4 },
  sortToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, marginLeft: 6 },
  sortToggleText: { fontSize: 12, fontWeight: '700' },
  emptyClearBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  selectCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center', marginEnd: 8 },
  bulkBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, zIndex: 50, elevation: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  bulkCount: { fontSize: 15, fontWeight: '700', marginStart: 10 },
  bulkBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginStart: 8, minWidth: 84, alignItems: 'center' },
  bulkBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  advanceButton: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  advanceButtonText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'capitalize',
  },
  profitPill: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    flexShrink: 1,
    maxWidth: '55%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profitPillText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  // ✨ NEW STUNNING HEADER STYLES
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 20,
    elevation: 3,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    top: 16,
    width: 40,
    zIndex: 10,
  },
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 40,
    paddingHorizontal: SPACING.md,
  },
  orderDetailHeader: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: SPACING.lg,
    marginHorizontal: -SPACING.lg,
    marginTop: -SPACING.lg,
    paddingBottom: 24,
    paddingHorizontal: SPACING.lg,
    paddingTop: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  orderMetaDivider: {
    backgroundColor: '#E5E7EB',
    height: 24,
    marginHorizontal: 16,
    width: 1,
  },
  orderMetaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  orderMetaRow: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  orderMetaText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  orderNumberLarge: {
    color: '#1F2937',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  orderTotalLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginRight: 4,
    flexShrink: 0,
  },
  orderTotalValue: {
    color: '#FF7816',
    fontSize: 18,
    fontWeight: 'bold',
  },
  printInvoiceButton: {
    alignItems: 'center',
    backgroundColor: '#FF7816',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingVertical: 16,
  },
  returnOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  returnSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28 },
  returnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  returnTitle: { fontSize: 18, fontWeight: '800' },
  returnRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  returnStepper: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  returnStepBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  returnConfirmBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  returnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  printInvoiceButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '700',
  },
  statusBadgeLarge: {
    marginTop: 12,
    transform: [{ scale: 1.2 }],
  },
  // ✨ Customer Card Styles
  callBadge: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  callBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  customerAddress: {
    color: '#6B7280',
    flex: 1,
    fontSize: 14,
    marginLeft: 10,
  },
  customerCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    elevation: 4,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  customerAvatarLarge: {
    borderRadius: 40,
    height: 80,
    width: 80,
  },
  customerAvatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#FF7816',
    justifyContent: 'center',
  },
  customerAvatarSection: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  customerAvatarText: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  customerNameLarge: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  customerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  // Item meta row for bold qty/serial
  itemMetaBold: {
    color: '#374151',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 8,
    marginTop: 2,
  },
  itemMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  viewMapButtonLarge: {
    alignItems: 'center',
    backgroundColor: '#4285F4',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 12,
  },
  viewMapButtonLargeText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  customerAvatar: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    marginRight: SPACING.sm,
    width: 32,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '500',
  },
  customerPhone: {
    fontSize: 12,
    marginTop: 2,
  },
  customerSection: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  filterContainer: {
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  filterTab: {
    borderRadius: 20,
    marginRight: 8,
    minWidth: 50, // Ensure minimum width for short text
    paddingHorizontal: SPACING.lg, // Increase from md to lg for Arabic text
    paddingVertical: 8,
    // FIX: Removed shadows
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center', // Center text in tab
  },
  // Product cards container
  productCardsContainer: {
    marginBottom: SPACING.lg,
  },
  // NEW: Card-based item styles with product images
  itemCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF',
    borderRadius: 16,
    elevation: 4,
    flexDirection: 'row',
    marginBottom: SPACING.md,
    minHeight: 100,
    padding: SPACING.sm,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  itemDetails: {
    flex: 1,
    marginHorizontal: SPACING.sm,
  },
  itemImage: {
    borderRadius: 10,
    height: 80,
    width: 65,
  },
  itemImageContainer: {
    borderRadius: 10,
    height: 80,
    overflow: 'hidden',
    width: 70,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    borderRadius: 12,
    height: 90,
    justifyContent: 'center',
    width: 90,
  },
  itemName: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-medium' : undefined,
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 19,
  },
  itemOptionText: {
    fontSize: 11,
  },
  itemOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  itemPartNumber: {
    fontSize: 12,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemPriceContainer: {
    alignItems: 'flex-end',
  },
  itemPriceLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemQuantityBadge: {
    marginTop: 4,
  },
  itemQuantityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // VARIANT SYSTEM: Style for variant info display
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  itemUnitPrice: {
    fontSize: 11,
    marginTop: 2,
  },
  itemsCount: {
    fontSize: 12,
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  locationBadge: {
    alignItems: 'center',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  map: {
    flex: 1,
  },
  mapContainer: {
    borderRadius: 12,
    flex: 1,
    overflow: 'hidden',
  },
  mapModalContent: {
    borderRadius: 20,
    height: '70%',
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
  },
  mapModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  mapModalOverlay: {
    backgroundColor: MODAL_OVERLAY_COLOR,
    flex: 1,
    justifyContent: 'center',
  },
  mapModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '95%',
    padding: SPACING.lg,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    backgroundColor: MODAL_OVERLAY_COLOR,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScroll: {
    marginBottom: SPACING.md,
  },
  modalSection: {
    borderRadius: 16,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalValueSecondary: {
    fontSize: 14,
    marginTop: 2,
  },
  openMapsButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  openMapsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
  orderCard: {
    borderRadius: 16,
    marginBottom: 12,
    padding: SPACING.md,
  },
  orderDate: {
    fontSize: 12,
    marginTop: 2,
  },
  orderFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  orderHeaderContent: {
    flex: 1,
  },
  orderIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: SPACING.md,
    width: 40,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchContainer: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 38,
    includeFontPadding: false,
    marginLeft: SPACING.sm,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  searchSection: {
    padding: SPACING.md,
  },

  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statusOption: {
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
    padding: SPACING.md,
    width: '48%',
  },
  statusOptionText: {
    fontSize: 11,
    fontWeight: '600',
  },

  summaryBlock: {
    borderTopWidth: 1,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalRow: {
    borderTopColor: 'rgba(0,0,0,0.05)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: SPACING.sm,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  viewMapButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  viewMapButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  deleteOrderButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  deleteOrderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // GOLDEN TEMPLATE: Admin order selected options (read-only)
  selectedOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  selectedOptionText: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined,
    fontSize: 14,
    fontWeight: Platform.OS === 'android' ? 'normal' : '500',
    includeFontPadding: true,
    lineHeight: 22,
    paddingVertical: 2,
  },
  trackingInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  saveTrackingButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  saveTrackingButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Shipping Office Info
  shippingOfficeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  shippingOfficeGrid: {
    marginBottom: SPACING.sm,
  },
  shippingOfficeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 6,
  },
  shippingOfficeLabel: {
    fontSize: 13,
    width: 100,
  },
  shippingOfficeValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  copyShippingButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 10,
  },
  copyShippingButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default AdminOrdersScreen;
