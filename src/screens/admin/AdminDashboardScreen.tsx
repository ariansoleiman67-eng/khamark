import { storeProfileService } from '../../services/storeProfileService';
import { supabase } from '../../services/supabase';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { isSyntheticEmail } from '../../utils/hashUtils';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Image,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext';
import Logo from '../../components/Logo';
import { SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { 
  DashboardStats,
  RecentOrder 
} from '../../services/adminService';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService } from '../../services/tenantAdminService';
import appConfigService from '../../services/appConfigService';
import { ImageService } from '../../services/imageService';

// Store profile type for dashboard
interface DashboardStoreProfile {
  logoUrl?: string;
  coverUrl?: string;
  coverUrls?: string[];
  storeName?: string;
  storeNameAr?: string;
  storeNameKu?: string;
}

// The name the admin chose for their store, in the current language.
const getLocalizedStoreName = (profile: DashboardStoreProfile | null, lang: string): string => {
  if (!profile) return '';
  if (lang === 'ar' && profile.storeNameAr) return profile.storeNameAr;
  if (lang === 'ku' && profile.storeNameKu) return profile.storeNameKu;
  return profile.storeName || '';
};

// GOLDEN TEMPLATE: Tab bar height for bottom padding
const ADMIN_TAB_HEIGHT = 120;

// Color constants
const ADMIN_COLORS = {
  white: '#fff',
  whiteAlpha90: 'rgba(255,255,255,0.9)',
  whiteAlpha30: 'rgba(255,255,255,0.3)',
  whiteAlpha20: 'rgba(255,255,255,0.2)',
  blackAlpha05: 'rgba(0,0,0,0.05)',
  black: '#000',
} as const;

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    pending: '#FF9800',
    confirmed: '#2196F3',
    processing: '#9C27B0',
    shipped: '#00BCD4',
    delivered: '#4CAF50',
    cancelled: '#F44336',
  };
  return colors[status] || '#999';
};

/**
 * ADMIN DASHBOARD SCREEN - GOLDEN TEMPLATE
 * 
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── TENANT GATE (blocking loader if !tenantId)
 *      └── FlatList (SINGLE vertical scroll owner)
 *           ├── ListHeaderComponent (header, stats, menu, revenue)
 *           ├── Recent Orders (data items)
 *           └── ListFooterComponent (logout)
 * 
 * Rules enforced:
 * - ONE vertical scroll owner
 * - NO layout-affecting animations
 * - NO shadows on scrollable content
 * - tenantId in all keys
 * - UI blocked until tenantId resolved
 */
const AdminDashboardScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { user, signOut: logout } = useAuth();
  const { tenantId } = useTenant();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [storeProfile, setStoreProfile] = useState<DashboardStoreProfile | null>(null);
  const [businessName, setBusinessName] = useState('');

  // Tracks the currently-selected tenant so late/in-flight loadData responses
  // from a previous tenant can be discarded instead of overwriting current state.
  const activeTenantRef = useRef(tenantId);
  // activeTenantRef tracks tenant identity but never mount state, and on logout the
  // whole admin tree unmounts (AuthContext setUser(null)) before TenantContext's
  // setTenantId(null) lands in a later commit — so the [tenantId] effect never runs
  // with null and activeTenantRef stays pinned to the old tenant. The tenant guards
  // below then all read as "still current" and a failed in-flight request fires
  // Alert.alert, a native global modal with no lifecycle binding, on top of the
  // login screen seconds after the admin logged out.
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Handle logo upload directly from dashboard
  const handleLogoUpload = async () => {
    if (!tenantId) return;
    try {
      const imageUri = await ImageService.showImagePicker();
      if (!imageUri) return;
      
      setUploading(true);
      const result = await ImageService.uploadImage(imageUri);
      if (result.success && result.url) {
        await storeProfileService.updateStoreProfile(tenantId, { logoUrl: result.url });
        // Update local state
        setStoreProfile(prev => ({ ...prev, logoUrl: result.url }));
        Alert.alert(t('common.success'), t('admin.dashboard.logoUploaded', { defaultValue: 'Logo updated successfully!' }));
      } else {
        Alert.alert(t('common.error'), result.error || 'Failed to upload logo');
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  // Handle banner upload directly from dashboard
  const handleBannerUpload = async () => {
    if (!tenantId) return;
    try {
      const imageUri = await ImageService.showImagePicker();
      if (!imageUri) return;
      
      setUploading(true);
      const result = await ImageService.uploadImage(imageUri);
      if (result.success && result.url) {
        // set as first/only cover image
        const newCoverUrls = [result.url];
        await storeProfileService.updateStoreProfile(tenantId, { coverUrl: result.url, coverUrls: newCoverUrls });
        // Update local state
        setStoreProfile(prev => ({ ...prev, coverUrl: result.url, coverUrls: newCoverUrls }));
        Alert.alert(t('common.success'), t('admin.dashboard.bannerUploaded', { defaultValue: 'Banner updated successfully!' }));
      } else {
        Alert.alert(t('common.error'), result.error || 'Failed to upload banner');
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Failed to upload banner');
    } finally {
      setUploading(false);
    }
  };

  // Auto-sync version to Firestore
  useEffect(() => {
    appConfigService.syncVersionToFirestore().catch(() => {});
  }, []);

  // GOLDEN TEMPLATE: Clear data when tenantId changes
  useEffect(() => {
    activeTenantRef.current = tenantId;
    setRecentOrders([]);
    setStats(null);
    setLoading(true);
  }, [tenantId]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;

    // Snapshot the tenant this request is for; if the admin switches tenants
    // while this is in flight, discard the stale response instead of writing it.
    const reqTenant = tenantId;

    try {
      const service = createTenantAdminService(tenantId);
      const [statsData, ordersData, profile] = await Promise.all([
        service.getDashboardStats(),
        service.getAllOrders(5),
        storeProfileService.getStoreProfile(tenantId),
      ]);

      // Bail if the selected tenant changed while this request was in flight.
      if (reqTenant !== activeTenantRef.current) return;

      setStats(statsData);

      // Set store profile for logo/banner
      if (profile) {
        setStoreProfile({
          logoUrl: profile.logoUrl,
          coverUrl: profile.coverUrl,
          coverUrls: profile.coverUrls,
          storeName: profile.storeName,
          storeNameAr: profile.storeNameAr,
          storeNameKu: profile.storeNameKu,
        });
      }

      // Business name (Admin → Business Info) — banner shows this first, like Settings.
      try {
        const { data: tRow } = await supabase.from('tenants').select('business_info').eq('id', tenantId).single();
        if (reqTenant !== activeTenantRef.current) return;
        const info = (tRow?.business_info || {}) as any;
        setBusinessName(info.name || info.businessName || info.displayName || '');
      } catch { /* fall back to store name */ }

      // Map tenant orders to RecentOrder format
      const mappedOrders = ordersData.map((order: any) => ({
        id: order.id!,
        orderNumber: order.orderNumber,
        customerName: order.shippingAddress?.fullName || 'Guest',
        total: order.totalUSD ?? 0,
        status: order.status || 'pending',
        createdAt: order.createdAt?.toDate?.() || new Date(),
      }));

      if (reqTenant !== activeTenantRef.current) return;
      setRecentOrders(mappedOrders);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (isMountedRef.current && reqTenant === activeTenantRef.current) {
        Alert.alert(t('admin.common.error'), t('admin.dashboard.loadFailed'));
      }
    } finally {
      // Only clear the spinner for the tenant currently on screen; a stale
      // response must not flip the loading state for a newer tenant's load.
      if (isMountedRef.current && reqTenant === activeTenantRef.current) {
        setLoading(false);
      }
    }
  }, [tenantId, t]);

  useEffect(() => {
    if (tenantId) {
      loadData();
    }
  }, [loadData, tenantId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleLogout = async () => {
    Alert.alert(
      t('admin.dashboard.logout'),
      t('admin.dashboard.logoutConfirm'),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        { 
          text: t('admin.dashboard.logout'), 
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              // Error handled by auth context
            }
          }
        },
      ]
    );
  };

  const navigateToOrders = () => navigation.navigate('AdminOrders');
  const navigateToProducts = () => navigation.navigate('AdminProducts');

  // GOLDEN TEMPLATE: TENANT GATE - Block UI until tenantId is resolved
  if (!tenantId) {
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}
        edges={['left', 'right']}
      >
        <View style={styles.tenantGate}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false} 
            style={[styles.tenantGateText, { color: theme.colors.text }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('admin.dashboard.loadingTenant', { defaultValue: 'Loading business data...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Render order item
  const renderOrderItem = ({ item: order }: { item: RecentOrder }) => (
    <TouchableOpacity 
      style={[
        styles.orderItem,
        {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          borderBottomColor: theme.colors.border + '30',
        }
      ]}
      onPress={navigateToOrders}
    >
      {/* Icon - GOLDEN TEMPLATE: aspectRatio */}
      <View style={[
        styles.orderIcon, 
        { backgroundColor: getStatusColor(order.status) + '20' }
      ]}>
        <Ionicons name="receipt" size={18} color={getStatusColor(order.status)} />
      </View>
      
      <View style={styles.orderContent}>
        <Text allowFontScaling={false} 
          style={[styles.orderNumber, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {order.orderNumber?.replace?.(/^#?ORD-?/i, '').replace(/-/g, '') || order.id}
        </Text>
        <Text allowFontScaling={false} 
          style={[styles.orderCustomer, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {order.customerName}
        </Text>
      </View>
      
      <View style={styles.orderRight}>
        <Text allowFontScaling={false} 
          style={[styles.orderTotal, { color: theme.colors.primary }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          ${(order.total ?? 0).toFixed(2)}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
          <Text allowFontScaling={false}
            style={[styles.statusText, { color: getStatusColor(order.status) }]}
            numberOfLines={1}
          >
            {t(`admin.orders.status.${(order.status || 'pending').toLowerCase()}`, { defaultValue: order.status || 'pending' })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // List Header Component
  const ListHeader = () => {
    // Get banner image - use first coverUrl from array, or legacy coverUrl, or fallback to static
    const bannerSource = storeProfile?.coverUrls?.[0] || storeProfile?.coverUrl
      ? { uri: storeProfile?.coverUrls?.[0] || storeProfile?.coverUrl }
      : require('../../../assets/hero-truck.jpg');
    
    return (
    <View>
      {/* Admin Profile Header */}
      <View style={styles.headerContainer}>
        <ImageBackground
          source={bannerSource}
          style={styles.headerImageBackground}
          imageStyle={styles.headerImage}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', theme.colors.primary + 'E0']}
            style={styles.headerGradient}
          >
            {/* Edit Banner Button */}
            <TouchableOpacity 
              style={styles.editProfileButton}
              onPress={handleBannerUpload}
              disabled={uploading}
            >
              <Ionicons name="camera-outline" size={18} color={ADMIN_COLORS.white} />
            </TouchableOpacity>
            
            {/* Avatar - Tap to change logo */}
            <TouchableOpacity 
              style={styles.avatarContainer}
              onPress={handleLogoUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={ADMIN_COLORS.white} />
              ) : storeProfile?.logoUrl ? (
                <Image 
                  source={{ uri: storeProfile.logoUrl }} 
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Logo size={50} variant="white" />
              )}
            </TouchableOpacity>

            <Text allowFontScaling={false} 
              style={styles.adminName}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {businessName || getLocalizedStoreName(storeProfile, i18n.language) || (user as any)?.displayName || 'Admin'}
            </Text>
            {user?.email && !isSyntheticEmail(user.email) && (
              <Text allowFontScaling={false} 
                style={styles.adminEmail}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {user.email}
              </Text>
            )}
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
              <Text allowFontScaling={false} 
                style={styles.adminBadgeText}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.administrator')}
              </Text>
            </View>

            {/* Quick Stats Row */}
            <View style={styles.headerStatsRow}>
              <View style={styles.headerStatItem}>
                <Text allowFontScaling={false} 
                  style={styles.headerStatValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {stats?.totalOrders || 0}
                </Text>
                <Text allowFontScaling={false} 
                  style={styles.headerStatLabel}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.dashboard.orders')}
                </Text>
              </View>
              <View style={styles.headerStatDivider} />
              <View style={styles.headerStatItem}>
                <Text allowFontScaling={false} 
                  style={styles.headerStatValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {stats?.totalProducts || 0}
                </Text>
                <Text allowFontScaling={false} 
                  style={styles.headerStatLabel}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.dashboard.products')}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>
      </View>

      {/* Quick Actions Menu */}
      <View style={styles.menuSection}>
        <Text allowFontScaling={false} 
          style={[styles.sectionTitle, { color: theme.colors.text }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {t('admin.dashboard.quickActions')}
        </Text>
        <View style={[styles.menuCard, {
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.06,
          shadowRadius: 8,
          elevation: 2,
        }]}>
          <TouchableOpacity 
            style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={navigateToOrders}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name="receipt-outline" size={20} color={theme.colors.primary} />
            </View>
            <View style={[styles.menuContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text allowFontScaling={false}
                style={[styles.menuTitle, { color: theme.colors.text }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.manageOrders')}
              </Text>
              <Text allowFontScaling={false} 
                style={[styles.menuSubtitle, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.pendingOrders', { count: stats?.pendingOrders || 0 })}
              </Text>
            </View>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => navigation.navigate('AdminInStoreOrders')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#FF6A00' + '20' }]}>
              <Ionicons name="storefront-outline" size={20} color="#FF6A00" />
            </View>
            <View style={[styles.menuContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text allowFontScaling={false} style={[styles.menuTitle, { color: theme.colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                {t('admin.inStore.title', { defaultValue: 'In-Store Sales' })}
              </Text>
              <Text allowFontScaling={false} style={[styles.menuSubtitle, { color: theme.colors.textSecondary }]} adjustsFontSizeToFit numberOfLines={1}>
                {t('admin.inStore.subtitle', { defaultValue: 'Create a walk-in order & print invoice' })}
              </Text>
            </View>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={navigateToProducts}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#4CAF50' + '20' }]}>
              <Ionicons name="cube-outline" size={20} color="#4CAF50" />
            </View>
            <View style={[styles.menuContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text allowFontScaling={false}
                style={[styles.menuTitle, { color: theme.colors.text }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.manageProducts')}
              </Text>
              <Text allowFontScaling={false} 
                style={[styles.menuSubtitle, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.lowStock', { count: stats?.lowStockProducts || 0 })}
              </Text>
            </View>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.menuItem, styles.menuItemLast, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => navigation.navigate('AdminSendNotification')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#9C27B0' + '20' }]}>
              <Ionicons name="notifications-outline" size={20} color="#9C27B0" />
            </View>
            <View style={[styles.menuContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text allowFontScaling={false}
                style={[styles.menuTitle, { color: theme.colors.text }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.sendNotification')}
              </Text>
              <Text allowFontScaling={false} 
                style={[styles.menuSubtitle, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.notifyAll')}
              </Text>
            </View>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Revenue Section */}
      <View style={styles.menuSection}>
        <Text allowFontScaling={false} 
          style={[styles.sectionTitle, { color: theme.colors.text }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {t('admin.dashboard.revenueOverview')}
        </Text>
        <View style={styles.revenueContainer}>
          {/* Today */}
          <View style={[styles.miniStatCard, {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.06,
            shadowRadius: 8,
            elevation: 2,
          }]}>
            <View style={styles.miniStatTopRow}>
              <Ionicons name="today-outline" size={16} color="#4CAF50" />
              <Text allowFontScaling={false} 
                style={[styles.miniStatLabel, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.today')}
              </Text>
            </View>
            <Text allowFontScaling={false} 
              style={[styles.miniStatValue, { color: theme.colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              ${(stats?.todayRevenue || 0).toFixed(2)}
            </Text>
          </View>

          {/* This Week */}
          <View style={[styles.miniStatCard, {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.06,
            shadowRadius: 8,
            elevation: 2,
          }]}>
            <View style={styles.miniStatTopRow}>
              <Ionicons name="calendar-outline" size={16} color="#2196F3" />
              <Text allowFontScaling={false} 
                style={[styles.miniStatLabel, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.thisWeek')}
              </Text>
            </View>
            <Text allowFontScaling={false} 
              style={[styles.miniStatValue, { color: theme.colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              ${(stats?.weekRevenue || 0).toFixed(2)}
            </Text>
          </View>

          {/* This Month */}
          <View style={[styles.miniStatCard, {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.06,
            shadowRadius: 8,
            elevation: 2,
          }]}>
            <View style={styles.miniStatTopRow}>
              <Ionicons name="stats-chart-outline" size={16} color="#9C27B0" />
              <Text allowFontScaling={false} 
                style={[styles.miniStatLabel, { color: theme.colors.textSecondary }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {t('admin.dashboard.thisMonth')}
              </Text>
            </View>
            <Text allowFontScaling={false} 
              style={[styles.miniStatValue, { color: theme.colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              ${(stats?.monthRevenue || 0).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Recent Orders Section Header */}
      <View style={styles.menuSection}>
        <View style={styles.sectionHeader}>
          <Text allowFontScaling={false} 
            style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 0 }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('admin.dashboard.recentOrders')}
          </Text>
          <TouchableOpacity onPress={navigateToOrders}>
            <Text allowFontScaling={false} 
              style={[styles.seeAllText, { color: theme.colors.primary }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {t('admin.dashboard.seeAll')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading or Empty State for Orders */}
      {loading && (
        <View style={[styles.loadingCard, { backgroundColor: theme.colors.surface }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
      
      {!loading && recentOrders.length === 0 && (
        <View style={[styles.emptyCard, {
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.06,
          shadowRadius: 8,
          elevation: 2,
        }]}>
          <View style={{
            width: 72, height: 72, borderRadius: 20,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            justifyContent: 'center', alignItems: 'center', marginBottom: 16,
          }}>
            <Ionicons name="receipt-outline" size={32} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'} />
          </View>
          <Text allowFontScaling={false} 
            style={[styles.emptyText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }]}
            adjustsFontSizeToFit
            numberOfLines={2}
          >
            {t('admin.dashboard.noOrders')}
          </Text>
        </View>
      )}
    </View>
  );
  };

  // List Footer Component
  const ListFooter = () => (
    <View style={styles.logoutSection}>
      <TouchableOpacity 
        style={[styles.logoutButton, { borderColor: theme.colors.error }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
        <Text allowFontScaling={false} 
          style={[styles.logoutText, { color: theme.colors.error }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {t('admin.dashboard.logout')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    // GOLDEN TEMPLATE: SafeAreaView with edges (NO bottom)
    <SafeAreaView 
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}
      edges={['left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* GOLDEN TEMPLATE: FlatList as SINGLE vertical scroll owner */}
      <FlatList
        data={loading ? [] : recentOrders}
        renderItem={renderOrderItem}
        // GOLDEN TEMPLATE: tenantId in keyExtractor for isolation
        keyExtractor={(item) => `${tenantId}-${item.id}`}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{
          // GOLDEN TEMPLATE: Padding for admin tab bar + glass header
          paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44),
          paddingBottom: ADMIN_TAB_HEIGHT + insets.bottom,
        }}
        // Ensure list takes remaining space
        style={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  adminBadge: {
    alignItems: 'center',
    backgroundColor: ADMIN_COLORS.whiteAlpha20,
    borderRadius: 20,
    flexDirection: 'row',
    marginTop: SPACING.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adminBadgeText: {
    color: ADMIN_COLORS.white,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  adminEmail: {
    color: ADMIN_COLORS.whiteAlpha90,
    fontSize: 14,
    marginTop: 4,
  },
  adminName: {
    color: ADMIN_COLORS.white,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // GOLDEN TEMPLATE: aspectRatio for avatar
  avatarContainer: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: ADMIN_COLORS.whiteAlpha20,
    borderRadius: 999,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    maxWidth: 80,
    overflow: 'hidden',
    width: '20%',
  },
  avatarImage: {
    borderRadius: 999,
    height: '100%',
    width: '100%',
  },
  container: {
    flex: 1,
  },
  editProfileButton: {
    alignItems: 'center',
    backgroundColor: ADMIN_COLORS.whiteAlpha30,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: SPACING.md,
    top: SPACING.md,
    width: 36,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    marginHorizontal: SPACING.md,
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  headerContainer: {
    margin: SPACING.md,
  },
  headerGradient: {
    alignItems: 'center',
    borderRadius: 20,
    padding: SPACING.xl,
  },
  headerImage: {
    borderRadius: 20,
  },
  headerImageBackground: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerStatDivider: {
    backgroundColor: ADMIN_COLORS.whiteAlpha30,
    minHeight: 40,
    width: 1,
  },
  headerStatItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6, // ✅ room for bold arabic
  },
  headerStatLabel: {
    color: ADMIN_COLORS.whiteAlpha90,
    fontSize: 13,
    fontWeight: '600',
    includeFontPadding: true, // ✅ IMPORTANT
    lineHeight: 22,
    marginTop: 2,
  },
  headerStatValue: {
    color: ADMIN_COLORS.white,
    fontSize: 26,
    fontWeight: '700',
    includeFontPadding: true, // ✅ IMPORTANT
    lineHeight: 42,
  },
  headerStatsRow: {
    borderTopColor: ADMIN_COLORS.whiteAlpha30,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
    width: '100%',
  },
  list: {
    flex: 1,
  },
  loadingCard: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    marginHorizontal: SPACING.md,
    padding: 40,
  },
  logoutButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  logoutSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  menuCard: {
    borderRadius: 16,
  },
  menuContent: {
    flex: 1,
  },
  // GOLDEN TEMPLATE: minHeight + aspectRatio for icons
  menuIconContainer: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    marginRight: SPACING.md,
    minHeight: 40,
    minWidth: 40,
  },
  menuItem: {
    alignItems: 'center',
    borderBottomColor: ADMIN_COLORS.blackAlpha05,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: SPACING.md,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuSection: {
    marginBottom: SPACING.lg,
    marginHorizontal: SPACING.md,
  },
  menuSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  orderContent: {
    flex: 1,
  },
  orderCustomer: {
    fontSize: 13,
    marginTop: 2,
  },
  // GOLDEN TEMPLATE: aspectRatio for order icon
  orderIcon: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 18,
    justifyContent: 'center',
    marginRight: SPACING.md,
    minHeight: 36,
    minWidth: 36,
  },
  orderItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  orderRight: {
    alignItems: 'flex-end',
  },
  orderTotal: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  // SAMSUNG FIX: Separate cards for revenue
  revenueContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  miniStatCard: {
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  miniStatTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  miniStatLabel: {
    flex: 1, // Take all available space after icon
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: true,
    lineHeight: 20, // ✅
  },
  miniStatValue: {
    fontSize: 16,
    fontWeight: '700',
    includeFontPadding: true,
    lineHeight: 26, // ✅
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 10,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tenantGate: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  tenantGateText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
});

export default AdminDashboardScreen;
