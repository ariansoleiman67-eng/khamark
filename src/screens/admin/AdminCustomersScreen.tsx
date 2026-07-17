import React, { useState, useEffect, useCallback } from 'react';
import { isSyntheticEmail, isPhoneAuthEmail } from '../../utils/hashUtils';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Linking,
  Platform,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext';
import { safeCallFunction } from '../../services/safeCallFunction';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService } from '../../services/tenantAdminService';
import { addressService } from '../../services/addressService';
import { useTranslation } from 'react-i18next';
import { User, Address } from '../../types';
import { useRoute, useNavigation } from '@react-navigation/native';
import ErrorBoundary from '../../components/ErrorBoundary';

// =====================================================================
// ALL NATIVE MODULES ARE LAZY-LOADED to prevent iOS production crashes.
// On iOS, importing native modules at the top level of a screen that is
// navigated to from a modal can cause fatal UIViewController crashes.
// =====================================================================

// Lazy-load SafeMapView to prevent crash if native maps module isn't ready
let _SafeMapView: any = null;
function getSafeMapView() {
  if (!_SafeMapView) {
    try {
      _SafeMapView = require('../../components/SafeMapView').default;
    } catch {
      _SafeMapView = null;
    }
  }
  return _SafeMapView;
}

// Lazy-load Marker to prevent crash if native maps module isn't ready
let _Marker: any = null;
function getMarker() {
  if (!_Marker) {
    try {
      const maps = require('react-native-maps');
      _Marker = maps.Marker || maps.default?.Marker;
    } catch {
      _Marker = null;
    }
  }
  return _Marker;
}


// When a customer has no name, fall back to a real email/phone so the list shows who
// they are instead of a wall of "Unknown" (e.g. email signups migrated without a name).
// Phone-auth users carry a synthetic <digits>@…internal email, which we never surface.
const contactLabel = (c: { email?: string | null; phone?: string | null }): string => {
  if (c?.email && !isSyntheticEmail(c.email) && !isPhoneAuthEmail(c.email)) return c.email;
  if (c?.phone) return c.phone;
  return '';
};

const AdminCustomersScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const gatedPassword = route.params?.gatedPassword || '';
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Customer details modal state
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  const [selectedCustomerAddresses, setSelectedCustomerAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Map modal state
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
    title: string;
  } | null>(null);

  // VIP role update
  const [updatingRole, setUpdatingRole] = useState(false);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!tenantId) {
      if (!tenantLoading) {
        setLoading(false);
      }
      return;
    }

    try {
      const service = createTenantAdminService(tenantId);
      const customersData = await service.getAllCustomers();

      // Map to User type expected by component
      const mappedCustomers = customersData.map(c => ({
        uid: c.uid,
        id: c.id || c.uid,
        email: c.email,
        fullName: c.displayName,
        name: c.displayName,
        phone: c.phone,
        role: c.isSystemAdmin ? 'admin' : (c.role || 'customer'),
        isBlocked: c.isBlocked,
        isSystemAdmin: c.isSystemAdmin,
      })) as any[] as User[];

      setCustomers(mappedCustomers);
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.customers.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, tenantLoading]);

  useEffect(() => {
    if (!tenantLoading) {
      loadCustomers();
    }
  }, [loadCustomers, tenantLoading]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery) return true;

    // Helper to normalize text (remove special chars)
    const normalize = (text: string | null | undefined) => {
      if (!text) return '';
      return text.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.length > 0);
    const normalizedTerms = searchTerms.map(t => normalize(t));

    // Helper to check if a term exists in any customer field
    const matchesTerm = (term: string, index: number) => {
      const normalizedTerm = normalizedTerms[index];
      const hasNormalizedTerm = normalizedTerm.length > 0;

      // 1. Name & Email (Direct text match)
      if (
        (customer.fullName && customer.fullName.toLowerCase().includes(term)) ||
        (customer.name && customer.name.toLowerCase().includes(term)) ||
        (customer.email && customer.email.toLowerCase().includes(term))
      ) {
        return true;
      }

      // 2. Phone (Flexible match)
      if (customer.phone) {
        const rawPhone = customer.phone.toLowerCase();
        const normPhone = normalize(customer.phone);
        // Check if raw phone contains term OR normalized phone contains normalized term
        if (
          rawPhone.includes(term) ||
          (hasNormalizedTerm && normPhone.includes(normalizedTerm))
        ) {
          return true;
        }
      }

      return false;
    };

    // AND LOGIC: Every typed term must match *somewhere*
    return searchTerms.every((term, index) => matchesTerm(term, index));
  });

  const handleCustomerPress = async (customer: User) => {
    setSelectedCustomer(customer);
    setDetailsModalVisible(true);
    setLoadingAddresses(true);
    setSelectedCustomerAddresses([]);

    try {
      const addresses = await addressService.getUserAddresses(customer.uid);
      setSelectedCustomerAddresses(addresses);
    } catch (error) {
      // Error handled silently - addresses may not exist
    } finally {
      setLoadingAddresses(false);
    }
  };

  const handleViewMap = (address: Address) => {
    if (address.coordinates) {
      // Close details modal first to avoid nested modal freeze
      setDetailsModalVisible(false);

      // Small delay to allow first modal to close before opening second
      setTimeout(() => {
        setSelectedLocation({
          latitude: address.coordinates!.latitude,
          longitude: address.coordinates!.longitude,
          title: address.title || t('admin.customers.location'),
        });
        setMapModalVisible(true);
      }, 300);
    }
  };

  const handleOpenInMaps = () => {
    if (!selectedLocation) return;
    const { latitude, longitude, title } = selectedLocation;
    const label = encodeURIComponent(title || '');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
    });
    if (url) {
      Linking.openURL(url).catch(() =>
        Alert.alert(t('admin.common.error'), t('admin.customers.mapUnavailable', { defaultValue: 'Map unavailable' }))
      );
    }
  };

  const closeDetailsModal = () => {
    setDetailsModalVisible(false);
    setSelectedCustomer(null);
    setSelectedCustomerAddresses([]);
  };

  const closeMapModal = () => {
    setMapModalVisible(false);
    setSelectedLocation(null);
  };

  const renderCustomerItem = ({ item, index }: { item: User; index: number }) => (
    <View>
      <TouchableOpacity
        style={[styles.customerCard, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        activeOpacity={0.7}
        onPress={() => handleCustomerPress(item)}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '20' }, isRTL ? { marginRight: 0, marginLeft: SPACING.sm } : null]}>
          <Text allowFontScaling={false} style={[styles.avatarText, { color: theme.colors.primary }]}>
            {(item.fullName || item.name || contactLabel(item))?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text allowFontScaling={false} style={[styles.customerName, { color: theme.colors.text, marginBottom: 0, textAlign: isRTL ? 'right' : 'left' }]}>
              {item.fullName || item.name || contactLabel(item) || t('admin.customers.unknown')}
            </Text>
            {item.role === 'vip' && (
              <View style={{
                backgroundColor: '#FFD700',
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                shadowColor: '#FFD700',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
                elevation: 5,
                borderWidth: 1,
                borderColor: '#FFF8DC',
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="diamond" size={12} color="#000" style={{ marginRight: 4 }} />
                <Text allowFontScaling={false} style={{ color: '#000', fontWeight: '800', fontStyle: 'italic', fontSize: 10 }}>{t('admin.customers.vip', { defaultValue: 'VIP' })}</Text>
              </View>
            )}
            {(item as any).isSystemAdmin && (
              <View style={{
                backgroundColor: theme.colors.error + '20',
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="shield-checkmark" size={12} color={theme.colors.error} style={{ marginRight: 4 }} />
                <Text allowFontScaling={false} style={{ color: theme.colors.error, fontWeight: '800', fontSize: 10 }}>{t('admin.customers.adminBadge', { defaultValue: 'ADMIN' })}</Text>
              </View>
            )}
            {!(item as any).isSystemAdmin && item.role !== 'vip' && (
              <View style={{
                backgroundColor: theme.colors.primary + '15',
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="person" size={12} color={theme.colors.primary} style={{ marginRight: 4 }} />
                <Text allowFontScaling={false} style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 10 }}>{t('admin.customers.userBadge', { defaultValue: 'USER' })}</Text>
              </View>
            )}
            {item.isBlocked && (
              <View style={{
                backgroundColor: theme.colors.textSecondary + '20',
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="ban" size={12} color={theme.colors.textSecondary} style={{ marginRight: 4 }} />
                <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontWeight: '800', fontSize: 10 }}>{t('admin.customers.blockedBadge', { defaultValue: 'BLOCKED' })}</Text>
              </View>
            )}
          </View>
          {item.email && !isSyntheticEmail(item.email) && !isPhoneAuthEmail(item.email) && (
            <View style={styles.customerDetail}>
              <Ionicons name="mail-outline" size={14} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.customerEmail, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {item.email}
              </Text>
            </View>
          )}
          {item.phone && (
            <View style={styles.customerDetail}>
              <Ionicons name="call-outline" size={14} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.customerPhone, { color: theme.colors.textSecondary }]}>
                {item.phone}
              </Text>
            </View>
          )}
        </View>

        {/* Chevron */}
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const renderAddressItem = (address: Address, index: number) => (
    <View
      key={address.id || index}
      style={[styles.addressCard, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.addressHeader}>
        <View style={[styles.addressIcon, { backgroundColor: theme.colors.primary + '20' }]}>
          <Ionicons
            name={address.title?.toLowerCase().includes('home') ? 'home' : 'location'}
            size={18}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.addressTitleContainer}>
          <Text allowFontScaling={false} style={[styles.addressTitle, { color: theme.colors.text }]}>
            {address.title || t('admin.customers.address')}
          </Text>
          {address.isDefault && (
            <View style={[styles.defaultBadge, { backgroundColor: theme.colors.success + '20' }]}>
              <Text allowFontScaling={false} style={[styles.defaultBadgeText, { color: theme.colors.success }]} numberOfLines={1}>{t('admin.customers.default')}</Text>
            </View>
          )}
        </View>
      </View>

      <Text allowFontScaling={false} style={[styles.addressText, { color: theme.colors.textSecondary }]}>
        {address.fullName}
      </Text>
      <Text allowFontScaling={false} style={[styles.addressText, { color: theme.colors.textSecondary }]}>
        {address.address}
      </Text>
      <Text allowFontScaling={false} style={[styles.addressText, { color: theme.colors.textSecondary }]}>
        {address.city}, {address.region}
      </Text>
      {address.phone && (
        <Text allowFontScaling={false} style={[styles.addressText, { color: theme.colors.textSecondary }]}>
          📞 {address.phone}
        </Text>
      )}

      {address.coordinates && (
        <TouchableOpacity
          style={[styles.viewMapButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => handleViewMap(address)}
        >
          <Ionicons name="map" size={16} color={theme.colors.surface} />
          <Text allowFontScaling={false} style={[styles.viewMapButtonText, { color: theme.colors.surface }]}>
            {t('admin.customers.viewOnMap')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.text }]}>{t('admin.customers.loading')}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Search Bar */}
      <View
        style={[styles.searchSection, { paddingTop: insets.top + SPACING.md, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}
      >
        <TouchableOpacity
          style={[{ padding: 4 }, isRTL ? { marginLeft: SPACING.md } : { marginRight: SPACING.md }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface, flex: 1 }]}>
          <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput allowFontScaling={false}
            style={[
              styles.searchInput,
              {
                color: theme.colors.text,
                includeFontPadding: false,
                textAlignVertical: 'center'
              }
            ]}
            placeholder={t('admin.customers.searchPlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Stats */}
      <View
        style={styles.statsSection}
      >
        <View style={[styles.statsCard, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.statsIconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
            <Ionicons name="people" size={24} color={theme.colors.primary} />
          </View>
          <View style={styles.statsContent}>
            <Text allowFontScaling={false} style={[styles.statsValue, { color: theme.colors.text }]}>
              {customers.length}
            </Text>
            <Text allowFontScaling={false} style={[styles.statsLabel, { color: theme.colors.textSecondary }]}>
              {t('admin.customers.totalCustomers')}
            </Text>
          </View>
        </View>
      </View>

      {/* Customers List */}
      <FlatList
        data={filteredCustomers}
        keyExtractor={(item, index) => item.uid || `customer-${index}`}
        renderItem={renderCustomerItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {t('admin.customers.noCustomers')}
            </Text>
          </View>
        }
      />

      {/* Customer Details Modal */}
      <Modal
        visible={detailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDetailsModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.colors.text }]}>
                {t('admin.customers.customerDetails')}
              </Text>
              <TouchableOpacity onPress={closeDetailsModal}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedCustomer && (
                <>
                  {/* Customer Info Section */}
                  <View style={[styles.infoSection, { backgroundColor: theme.colors.background }]}>
                    <View style={[styles.largeAvatar, { backgroundColor: theme.colors.primary + '20' }]}>
                      <Text allowFontScaling={false} style={[styles.largeAvatarText, { color: theme.colors.primary }]}>
                        {(selectedCustomer.fullName || selectedCustomer.name || contactLabel(selectedCustomer))?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <Text allowFontScaling={false}
                      style={[styles.customerNameLarge, { color: theme.colors.text, textAlign: 'center' }]}
                      numberOfLines={1}
                    >
                      {selectedCustomer.fullName || selectedCustomer.name || contactLabel(selectedCustomer) || t('admin.customers.unknown')}
                    </Text>

                    {/* VIP Role Assignment Actions */}
                    <View style={styles.roleActionsContainer}>
                      <Text allowFontScaling={false} style={[styles.infoText, { color: theme.colors.textSecondary, marginBottom: 8 }]} numberOfLines={1}>
                        {t('admin.customers.currentRole')}{' '}
                        <Text allowFontScaling={false} style={{ fontWeight: '800', color: selectedCustomer.role === 'vip' ? '#B8860B' : theme.colors.text }}>
                          {selectedCustomer.role === 'vip'
                            ? t('admin.customers.vip', { defaultValue: 'VIP' })
                            : t('admin.customers.customer', { defaultValue: 'Customer' })}
                        </Text>
                      </Text>
                      {selectedCustomer.role === 'vip' ? (
                        <TouchableOpacity
                          style={[styles.roleButton, { backgroundColor: theme.colors.textSecondary }]}
                          disabled={updatingRole}
                          onPress={async () => {
                            setUpdatingRole(true);
                            try {
                              await safeCallFunction('verifyAdminActionPassword', { password: gatedPassword, action: 'assign_vip_role', targetUserId: selectedCustomer.uid, newRole: 'customer', tenantId });
                              const updated = { ...selectedCustomer, role: 'customer' } as User;
                              setSelectedCustomer(updated);
                              setCustomers(prev => prev.map(c => c.uid === selectedCustomer.uid ? updated : c));
                              Alert.alert(t('admin.common.success'), t('admin.customers.roleUpdatedCustomer'));
                            } catch (e: any) {
                              Alert.alert(t('admin.common.error'), e.message || t('admin.customers.failedUpdateRole'));
                            } finally {
                              setUpdatingRole(false);
                            }
                          }}
                        >
                          {updatingRole ? <ActivityIndicator size="small" color="#fff" /> : <Text allowFontScaling={false} style={styles.roleButtonText}>{t('admin.customers.demoteToCustomer')}</Text>}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.roleButton, { backgroundColor: '#FFD700' }]}
                          disabled={updatingRole}
                          onPress={async () => {
                            setUpdatingRole(true);
                            try {
                              await safeCallFunction('verifyAdminActionPassword', { password: gatedPassword, action: 'assign_vip_role', targetUserId: selectedCustomer.uid, newRole: 'vip', tenantId });
                              const updated = { ...selectedCustomer, role: 'vip' } as User;
                              setSelectedCustomer(updated);
                              setCustomers(prev => prev.map(c => c.uid === selectedCustomer.uid ? updated : c));
                              Alert.alert(t('admin.common.success'), t('admin.customers.roleUpdatedVip'));
                            } catch (e: any) {
                              Alert.alert(t('admin.common.error'), e.message || t('admin.customers.failedUpdateRole'));
                            } finally {
                              setUpdatingRole(false);
                            }
                          }}
                        >
                          <Ionicons name="star" size={16} color="#000" style={{ marginRight: 4 }} />
                          {updatingRole ? <ActivityIndicator size="small" color="#000" /> : <Text allowFontScaling={false} style={[styles.roleButtonText, { color: '#000' }]}>{t('admin.customers.makeVip')}</Text>}
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Block/Unblock Actions */}
                    <View style={[styles.roleActionsContainer, { marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }]}>
                      <Text allowFontScaling={false} style={[styles.infoText, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
                        {t('admin.customers.accountStatus', { defaultValue: 'Account Status: ' })} {selectedCustomer.isBlocked ? t('admin.customers.blocked', { defaultValue: 'Blocked' }) : t('admin.customers.active', { defaultValue: 'Active' })}
                      </Text>
                      {selectedCustomer.isBlocked ? (
                        <TouchableOpacity
                          style={[styles.roleButton, { backgroundColor: theme.colors.success }]}
                          disabled={isTogglingBlock}
                          onPress={async () => {
                            setIsTogglingBlock(true);
                            try {
                              await safeCallFunction('verifyAdminActionPassword', { password: gatedPassword, action: 'toggle_user_block', targetUserId: selectedCustomer.uid, isBlocked: false, tenantId });
                              const updated = { ...selectedCustomer, isBlocked: false } as User;
                              setSelectedCustomer(updated);
                              setCustomers(prev => prev.map(c => c.uid === selectedCustomer.uid ? updated : c));
                              Alert.alert(t('admin.common.success'), t('admin.customers.unblockSuccess', { defaultValue: 'Account unblocked successfully' }));
                            } catch (e: any) {
                              Alert.alert(t('admin.common.error'), e.message || t('admin.customers.failedUnblock', { defaultValue: 'Failed to unblock' }));
                            } finally {
                              setIsTogglingBlock(false);
                            }
                          }}
                        >
                          {isTogglingBlock ? <ActivityIndicator size="small" color="#fff" /> : <Text allowFontScaling={false} style={styles.roleButtonText}>{t('admin.customers.unblockAccount', { defaultValue: 'Unblock Account' })}</Text>}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.roleButton, { backgroundColor: theme.colors.error }]}
                          disabled={isTogglingBlock}
                          onPress={async () => {
                            setIsTogglingBlock(true);
                            try {
                              await safeCallFunction('verifyAdminActionPassword', { password: gatedPassword, action: 'toggle_user_block', targetUserId: selectedCustomer.uid, isBlocked: true, tenantId });
                              const updated = { ...selectedCustomer, isBlocked: true } as User;
                              setSelectedCustomer(updated);
                              setCustomers(prev => prev.map(c => c.uid === selectedCustomer.uid ? updated : c));
                              Alert.alert(t('admin.common.success'), t('admin.customers.blockSuccess', { defaultValue: 'Account blocked successfully' }));
                            } catch (e: any) {
                              Alert.alert(t('admin.common.error'), e.message || t('admin.customers.failedBlock', { defaultValue: 'Failed to block' }));
                            } finally {
                              setIsTogglingBlock(false);
                            }
                          }}
                        >
                          <Ionicons name="ban" size={16} color="#fff" style={{ marginRight: 4 }} />
                          {isTogglingBlock ? <ActivityIndicator size="small" color="#fff" /> : <Text allowFontScaling={false} style={styles.roleButtonText}>{t('admin.customers.blockAccount', { defaultValue: 'Block Account' })}</Text>}
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Co-Admin Assignment Action */}
                    {(selectedCustomer.role === 'admin' || (selectedCustomer as any).isSystemAdmin) && (
                      <View style={[styles.roleActionsContainer, { marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }]}>
                        <Text allowFontScaling={false} style={[styles.infoText, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
                          {t('admin.customers.partnerProducts', { defaultValue: 'Partner Products' })}
                        </Text>
                        <TouchableOpacity
                          style={[styles.roleButton, { backgroundColor: theme.colors.primary }]}
                          onPress={() => {
                            closeDetailsModal();
                            navigation.navigate('AdminPartnerAssignment', {
                              userId: selectedCustomer.uid,
                              userName: selectedCustomer.fullName || selectedCustomer.name || 'Admin',
                              userEmail: selectedCustomer.email
                            });
                          }}
                        >
                          <Ionicons name="pricetags" size={16} color="#fff" style={{ marginRight: 4 }} />
                          <Text allowFontScaling={false} style={styles.roleButtonText}>{t('admin.customers.assignProducts', { defaultValue: 'Assign Products' })}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {selectedCustomer.email && !isSyntheticEmail(selectedCustomer.email) && !isPhoneAuthEmail(selectedCustomer.email) && (
                      <View style={styles.infoRow}>
                        <Ionicons name="mail" size={18} color={theme.colors.primary} />
                        <Text allowFontScaling={false}
                          style={[styles.infoText, { color: theme.colors.textSecondary, flexShrink: 1 }]}
                          numberOfLines={1}
                        >
                          {selectedCustomer.email}
                        </Text>
                      </View>
                    )}

                    {selectedCustomer.phone && (
                      <View style={styles.infoRow}>
                        <Ionicons name="call" size={18} color={theme.colors.primary} />
                        <Text allowFontScaling={false}
                          style={[styles.infoText, { color: theme.colors.textSecondary, flexShrink: 1 }]}
                          numberOfLines={1}
                        >
                          {selectedCustomer.phone}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Addresses Section */}
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
                    {t('admin.customers.savedAddresses')}
                  </Text>

                  {loadingAddresses ? (
                    <View style={styles.addressLoadingContainer}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.addressLoadingText, { color: theme.colors.textSecondary }]}>
                        {t('admin.customers.loadingAddresses')}
                      </Text>
                    </View>
                  ) : selectedCustomerAddresses.length > 0 ? (
                    selectedCustomerAddresses.map((address, index) =>
                      renderAddressItem(address, index)
                    )
                  ) : (
                    <View style={styles.noAddressesContainer}>
                      <Ionicons name="location-outline" size={40} color={theme.colors.textSecondary} />
                      <Text allowFontScaling={false} style={[styles.noAddressesText, { color: theme.colors.textSecondary }]}>
                        {t('admin.customers.noAddresses')}
                      </Text>
                    </View>
                  )}
                </>
              )}
              <View style={styles.modalBottomSpacing} />
            </ScrollView>
          </View>

        </View>
      </Modal>

      {/* Map Modal */}
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
                {selectedLocation?.title || t('admin.customers.location')}
              </Text>
              <TouchableOpacity onPress={closeMapModal}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {/* Map View */}
            {selectedLocation && (() => {
              try {
                const MapMarker = getMarker();
                const LazyMapView = getSafeMapView();
                if (!LazyMapView) {
                  return (
                    <View style={[styles.mapContainer, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="map-outline" size={40} color={theme.colors.textSecondary} />
                      <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginTop: 8 }}>{t('admin.customers.mapUnavailable', { defaultValue: 'Map unavailable' })}</Text>
                    </View>
                  );
                }
                return (
                  <View style={styles.mapContainer}>
                    <LazyMapView
                      style={styles.map}
                      initialRegion={{
                        latitude: selectedLocation.latitude,
                        longitude: selectedLocation.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                      scrollEnabled={true}
                      zoomEnabled={true}
                    >
                      {MapMarker && (
                        <MapMarker
                          coordinate={{
                            latitude: selectedLocation.latitude,
                            longitude: selectedLocation.longitude,
                          }}
                          title={selectedLocation.title}
                        />
                      )}
                    </LazyMapView>
                  </View>
                );
              } catch {
                return (
                  <View style={[styles.mapContainer, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="map-outline" size={40} color={theme.colors.textSecondary} />
                    <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginTop: 8 }}>{t('admin.customers.mapFailedToLoad', { defaultValue: 'Map failed to load' })}</Text>
                  </View>
                );
              }
            })()}

            {/* Open in Maps Button */}
            <TouchableOpacity
              style={[styles.openMapsButton, { backgroundColor: theme.colors.primary }]}
              onPress={handleOpenInMaps}
            >
              <Ionicons name="navigate" size={20} color={theme.colors.surface} />
              <Text allowFontScaling={false} style={[styles.openMapsButtonText, { color: theme.colors.surface }]}>
                {t('admin.customers.openInMaps')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const MODAL_OVERLAY_COLOR = 'rgba(0,0,0,0.5)';

const styles = StyleSheet.create({
  addressCard: {
    borderRadius: 10,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  addressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  addressIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: SPACING.sm,
    width: 36,
  },
  addressLoadingContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  addressLoadingText: {
    fontSize: 14,
    marginLeft: SPACING.sm,
  },
  addressText: {
    fontSize: 14,
    marginBottom: 2,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  addressTitleContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    marginRight: SPACING.sm,
    width: 46,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
  },
  customerCard: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    ...SHADOW_STYLES.small,
  },
  customerDetail: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 2,
  },
  customerEmail: {
    fontSize: 13,
    marginLeft: 6,
    flex: 1,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    flexShrink: 1,
  },
  customerNameLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
    maxWidth: '100%',
  },
  customerPhone: {
    fontSize: 13,
    marginLeft: 6,
    flex: 1,
  },
  defaultBadge: {
    borderRadius: 4,
    marginLeft: SPACING.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
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
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.xs,
    maxWidth: '100%',
  },
  roleActionsContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
    width: '100%',
  },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  roleButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  infoSection: {
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  infoText: {
    fontSize: 14,
    marginLeft: SPACING.sm,
  },
  largeAvatar: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  largeAvatarText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: 100,
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
  map: {
    flex: 1,
  },
  mapContainer: {
    borderRadius: 12,
    flex: 1,
    overflow: 'hidden',
  },
  mapModalContent: {
    borderRadius: 16,
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
  modalBottomSpacing: {
    height: 40,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: SPACING.lg,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalOverlay: {
    backgroundColor: MODAL_OVERLAY_COLOR,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  noAddressesContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  noAddressesText: {
    fontSize: 14,
    marginTop: SPACING.sm,
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
  searchContainer: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    ...SHADOW_STYLES.small,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: SPACING.sm,
    height: 38,
    paddingVertical: 0,
  },
  searchSection: {
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  statsCard: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  statsContent: {
    flex: 1,
  },
  statsIconContainer: {
    alignItems: 'center',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    marginRight: SPACING.md,
    width: 50,
  },
  statsLabel: {
    fontSize: 14,
  },
  statsSection: {
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  statsValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  viewMapButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  viewMapButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});

// Wrap in ErrorBoundary to prevent native iOS crashes from killing the app
const AdminCustomersScreenWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <AdminCustomersScreen />
  </ErrorBoundary>
);

export default AdminCustomersScreenWithBoundary;
