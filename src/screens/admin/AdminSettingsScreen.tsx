import React, { useState, useEffect, useRef } from 'react';
import { isSyntheticEmail } from '../../utils/hashUtils';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  ImageBackground,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import Logo from '../../components/Logo';
import LanguagePicker from '../../components/LanguagePicker';
import { TenantAdminService } from '../../services/tenantAdminService';
import adminService from '../../services/adminService';
import { ImageService } from '../../services/imageService';
import { storeProfileService, StoreProfile } from '../../services/storeProfileService';
import { supabase } from '../../services/supabase';
import { PasswordPromptModal } from '../../components/PasswordPromptModal';

// Tab bar height constant
const ADMIN_TAB_HEIGHT = 120;

// ---- Helpers ----
const getMonogram = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name[0].toUpperCase();
};

// The name the admin chose for their store, in the current language.
const getLocalizedStoreName = (profile: StoreProfile | null, lang: string): string => {
  if (!profile) return '';
  if (lang === 'ar' && profile.storeNameAr) return profile.storeNameAr;
  if (lang === 'ku' && profile.storeNameKu) return profile.storeNameKu;
  return profile.storeName || '';
};

// ========================
// SUB-COMPONENTS
// ========================

const SectionTitle: React.FC<{ title: string; labelColor: string }> = ({ title, labelColor }) => (
  <Text allowFontScaling={false} style={{
    fontSize: 13, fontWeight: '600', color: labelColor,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 10, marginLeft: 4,
  }}>
    {title}
  </Text>
);

const Divider: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const { i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  return (
    <View style={{
      height: 0.5,
      marginLeft: isRTL ? 0 : 68,
      marginRight: isRTL ? 68 : 0,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    }} />
  );
};

const LuxuryMenuItem: React.FC<{
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  hasSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  destructive?: boolean;
  theme: any;
  isDark: boolean;
  tintBg: string;
  color?: string;
}> = ({ icon, title, subtitle, onPress, hasSwitch, switchValue, onSwitchChange, destructive, theme, isDark, tintBg, color }) => {
  const { i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const iconColor = destructive ? theme.colors.error : (color || theme.colors.primary);
  const iconBg = destructive
    ? (isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)')
    : color ? color + '14' : tintBg;

  return (
    <TouchableOpacity
      onPress={hasSwitch ? undefined : onPress}
      disabled={hasSwitch}
      activeOpacity={0.6}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', padding: 16,
      }}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: iconBg,
        justifyContent: 'center', alignItems: 'center',
        marginRight: isRTL ? 0 : 14, marginLeft: isRTL ? 14 : 0,
      }}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text allowFontScaling={false} style={{
          fontSize: 16, fontWeight: '500',
          color: destructive ? theme.colors.error : theme.colors.text,
          textAlign: isRTL ? 'right' : 'left',
        }}>
          {title}
        </Text>
        {subtitle && (
          <Text allowFontScaling={false} style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', marginTop: 2, textAlign: isRTL ? 'right' : 'left' }}
            numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {subtitle}
          </Text>
        )}
      </View>
      {hasSwitch ? (
        <Switch value={switchValue} onValueChange={onSwitchChange}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary + '50' }}
          thumbColor={switchValue ? theme.colors.primary : theme.colors.textSecondary} />
      ) : (
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} />
      )}
    </TouchableOpacity>
  );
};

// ========================
// MAIN ADMIN SETTINGS SCREEN
// ========================
const AdminSettingsScreen: React.FC = () => {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, isOwner, signOut: logout, deleteAccount } = useAuth();
  const { tenantId, upgradeToAdmin, isLoading: tenantLoading } = useTenant();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const insets = useSafeAreaInsets();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Show the BUSINESS name (set in Admin → Business Info); fall back to the store
  // name, then the personal name, then "Admin".
  const chosenName = businessName || getLocalizedStoreName(storeProfile, i18n.language) || (user as any)?.displayName || '';
  const headerName = chosenName || 'Admin';
  const [showCustomerPasswordGate, setShowCustomerPasswordGate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hasAnimated = useRef(false);

  // Luxury colors
  const pageBg = isDark ? theme.colors.background : '#F5F5F7';
  const cardBg = isDark ? theme.colors.surface : '#FFFFFF';
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';
  const tintBg = theme.colors.primary + '12';

  // Shared card style
  const cardStyle = {
    backgroundColor: cardBg,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: 8,
    elevation: 2,
  };

  // Clear ALL state when tenantId changes
  useEffect(() => {
    // Guard against out-of-order responses on rapid tenant switches (A→B): the
    // cleanup flips `cancelled` so a slower tenant-A fetch can never overwrite
    // tenant-B's header/logo/cover (tenant-isolation rule).
    let cancelled = false;

    setNotificationsEnabled(true);
    setShowLanguagePicker(false);
    setSyncing(false);
    setShowSetupModal(false);
    setStoreName('');
    setStoreProfile(null);
    setBusinessName('');

    if (tenantId) {
      storeProfileService.getStoreProfile(tenantId)
        .then(profile => { if (!cancelled) setStoreProfile(profile); })
        .catch(err => console.error('Failed to load store profile for header:', err));

      // Business name (set in Admin → Business Info), shown in the header.
      (async () => {
        try {
          const { data } = await supabase.from('tenants').select('business_info').eq('id', tenantId).single();
          const info = (data?.business_info || {}) as any;
          if (!cancelled) setBusinessName(info.name || info.businessName || info.displayName || '');
        } catch {
          // ignore — header falls back to store name
        }
      })();
    }

    return () => { cancelled = true; };
  }, [tenantId]);

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  const handleSetupStore = () => {
    setShowSetupModal(true);
  };

  const handleConfirmSetup = async () => {
    if (!storeName.trim()) {
      Alert.alert('Error', 'Please enter a store name');
      return;
    }
    setUpgrading(true);
    try {
      await upgradeToAdmin(storeName.trim());
      setShowSetupModal(false);
      setStoreName('');
      Alert.alert(
        t('common.success', { defaultValue: 'Success!' }),
        t('admin.settings.setupSuccess', { defaultValue: 'Your store has been set up. You can now add products, manage discounts, and more!' })
      );
    } catch (error: any) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message || t('admin.settings.setupFailed', { defaultValue: 'Failed to setup store' }));
    } finally {
      setUpgrading(false);
    }
  };

  const handleCoverUpload = async () => {
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;
      setUploadingCover(true);
      const result = await ImageService.uploadImage(uri);
      if (result.success && result.url) {
        await storeProfileService.updateStoreProfile(tenantId!, { coverUrl: result.url });
        setStoreProfile(prev => prev ? ({ ...prev, coverUrl: result.url }) : ({ coverUrl: result.url } as any));
      } else {
        Alert.alert(t('common.error'), 'Failed to upload cover');
      }
    } catch (e) {
      Alert.alert(t('common.error'), 'Failed to update cover');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleLogoUpload = async () => {
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;
      setUploadingLogo(true);
      const result = await ImageService.uploadImage(uri);
      if (result.success && result.url) {
        await storeProfileService.updateStoreProfile(tenantId!, { logoUrl: result.url });
        setStoreProfile(prev => prev ? ({ ...prev, logoUrl: result.url }) : ({ logoUrl: result.url } as any));
      } else {
        Alert.alert(t('common.error'), 'Failed to upload logo');
      }
    } catch (e) {
      Alert.alert(t('common.error'), 'Failed to update logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSyncProducts = async () => {
    if (!user?.uid) {
      Alert.alert(t('common.error'), 'User not authenticated');
      return;
    }
    setSyncing(true);
    try {
      const tenantService = new TenantAdminService(user.uid);
      const count = await tenantService.syncAllProductsToGlobal();
      Alert.alert(
        t('common.success'),
        t('admin.settings.syncSuccess', { count }) || `Synced ${count} products successfully!`
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Failed to sync products');
    } finally {
      setSyncing(false);
    }
  };

  const handleExportData = async () => {
    try {
      setExporting(true);
      // Fetch all data
      const products = await adminService.fetchAllProducts();
      const orders = await adminService.fetchAllOrders(10000); // Large limit to get all
      const customers = await adminService.fetchAllCustomers();
      
      const exportData = {
        timestamp: new Date().toISOString(),
        products,
        orders,
        customers
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Save to temp file
      const fileUri = FileSystem.documentDirectory + 'asankary_export.json';
      await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
      
      // Share file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Export Store Data' });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
      
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'An error occurred while exporting data.');
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      t('profile.logout.title'),
      t('profile.logout.confirmation'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.logout.confirm'),
          style: 'destructive',
          onPress: async () => {
            try { await logout(); } catch (error) { /* handled by auth context */ }
          },
        },
      ]
    );
  };

  const navigateToSendNotification = () => {
    navigation.navigate('AdminSendNotification');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('admin.settings.deleteAccountTitle', { defaultValue: 'Delete Account' }),
      t('admin.settings.deleteAccountWarning', { defaultValue: 'This will permanently delete your store, all products, orders, and data. This action CANNOT be undone.\n\nAre you sure?' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('admin.settings.deleteAccountConfirm', { defaultValue: 'Yes, Delete Everything' }),
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              t('admin.settings.deleteAccountFinalTitle', { defaultValue: 'Final Confirmation' }),
              t('admin.settings.deleteAccountFinalWarning', { defaultValue: 'This is your LAST CHANCE. All your store data will be permanently deleted.' }),
              [
                { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                {
                  text: t('admin.settings.delete', { defaultValue: 'DELETE' }),
                  style: 'destructive',
                  onPress: () => executeDelete(),
                },
              ]
            );
          },
        },
      ]
    );
  };

  const executeDelete = async () => {
    try {
      setDeleting(true);
      // Delete via Supabase (delete_user RPC): removes the store's orders/products, then
      // the tenant row (its FK is NO ACTION, so it must go before the user), then the
      // profile + auth identity, and signs out. The old Firebase `deleteAdminAccount`
      // function only knew about Firestore admins, so it failed for Supabase-created ones.
      await deleteAccount();
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.message || 'Failed to delete account'
      );
      setDeleting(false);
    }
  };

  // ---- TENANT GATE ----
  // Mark animations as done after first render
  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  // Helper: only animate on first mount
  const enterAnim = (delay: number, duration: number = 400) =>
    hasAnimated.current ? undefined : FadeInDown.delay(delay).duration(duration);

  // ---- TENANT GATE ----
  if (tenantLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: pageBg }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text allowFontScaling={false} style={{ fontSize: 16, marginTop: 12, color: theme.colors.text }}
              adjustsFontSizeToFit numberOfLines={1}>
              {t('admin.settings.loading', { defaultValue: 'Loading settings...' })}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ======================== RENDER ========================
  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44),
            paddingBottom: ADMIN_TAB_HEIGHT + insets.bottom,
          }}
        >
          {/* =============== BANNER HERO =============== */}
          <Animated.View entering={enterAnim(80, 450)}
            style={{ marginHorizontal: 20, marginTop: Platform.OS === 'android' ? 26 : 12, marginBottom: 8 }}>
            <ImageBackground
              source={storeProfile?.coverUrl ? { uri: storeProfile.coverUrl } : require('../../../assets/hero-truck.jpg')}
              style={{ borderRadius: 20, overflow: 'hidden', minHeight: 260 }}
              imageStyle={{ borderRadius: 20 }}
              resizeMode="cover"
            >
              {/* Camera badge for cover */}
              <TouchableOpacity
                onPress={handleCoverUpload}
                disabled={uploadingCover}
                activeOpacity={0.7}
                style={{
                  position: 'absolute', top: 14, right: 14,
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  justifyContent: 'center', alignItems: 'center', zIndex: 10,
                }}
              >
                {uploadingCover ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="camera-outline" size={18} color="white" />
                )}
              </TouchableOpacity>

              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
                style={{ padding: 28, alignItems: 'center', minHeight: 260, justifyContent: 'center' }}
              >
                {/* Avatar */}
                <TouchableOpacity
                  onPress={handleLogoUpload}
                  disabled={uploadingLogo}
                  activeOpacity={0.8}
                  style={{
                    width: 88, height: 88, borderRadius: 44,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    justifyContent: 'center', alignItems: 'center',
                    marginBottom: 14, overflow: 'hidden',
                    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.3)',
                  }}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : storeProfile?.logoUrl ? (
                    <ImageBackground
                      source={{ uri: storeProfile.logoUrl }}
                      style={{ width: 88, height: 88 }}
                      imageStyle={{ borderRadius: 44 }}
                    />
                  ) : chosenName ? (
                    <Text allowFontScaling={false} style={{ fontSize: 32, fontWeight: '700', color: 'white' }}>
                      {getMonogram(chosenName)}
                    </Text>
                  ) : (
                    <Logo size={45} variant="white" />
                  )}
                  {/* Edit Avatar Icon */}
                  <View style={{
                    position: 'absolute', bottom: 2, right: 2,
                    backgroundColor: theme.colors.primary, borderRadius: 12,
                    padding: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
                  }}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                </TouchableOpacity>

                {/* Name + Email */}
                <Text allowFontScaling={false} style={{ fontSize: 24, fontWeight: '700', color: 'white', textAlign: 'center', letterSpacing: -0.3 }}
                  adjustsFontSizeToFit numberOfLines={1}>
                  {headerName}
                </Text>
                {user?.email && !isSyntheticEmail(user.email) && (
                  <Text allowFontScaling={false} style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' }}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {user.email}
                  </Text>
                )}

                {/* Admin badge */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', marginTop: 14,
                  backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 6,
                }}>
                  <Ionicons name="shield-checkmark" size={14} color="#fff" />
                  <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                    {t('admin.settings.administrator', { defaultValue: 'Administrator' })}
                  </Text>
                </View>
              </LinearGradient>
            </ImageBackground>
          </Animated.View>

          {/* =============== STORE SETUP BANNER =============== */}
          {!tenantId && !tenantLoading && (
            <Animated.View entering={enterAnim(160, 400)} style={{ marginHorizontal: 20, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={handleSetupStore}
                disabled={upgrading}
                activeOpacity={0.8}
                style={{
                  ...cardStyle,
                  backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                  padding: 16, flexDirection: 'row', alignItems: 'center',
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2',
                  justifyContent: 'center', alignItems: 'center', marginRight: 12,
                }}>
                  <Ionicons name="warning" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FCA5A5' : '#991B1B' }}>
                    {t('admin.settings.storeSetupRequired', { defaultValue: 'Store Setup Required' })}
                  </Text>
                  <Text allowFontScaling={false} style={{ fontSize: 12, color: isDark ? 'rgba(252,165,165,0.7)' : '#B91C1C', marginTop: 2 }}>
                    {t('admin.settings.storeSetupRequiredSubtitle', { defaultValue: 'Tap to complete your store setup' })}
                  </Text>
                </View>
                {upgrading ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} />
                )}
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* =============== CONTENT CARDS =============== */}
          <View style={{ paddingHorizontal: 20 }}>

            {/* ---- Business Settings Section ---- */}
            <Animated.View entering={enterAnim(200)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('admin.settings.businessSettings')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                {isOwner ? (
                  <LuxuryMenuItem icon="people-circle" title={t('admin.settings.partnerManagement', { defaultValue: 'Partner Management' })}
                    subtitle={t('admin.settings.partnerManagementSubtitle', { defaultValue: 'Add partners, share products & create orders' })}
                    onPress={() => navigation.navigate('AdminPartnerManagement')}
                    color="#8B5CF6"
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                ) : (
                  <LuxuryMenuItem icon="briefcase" title={t('admin.settings.partnerDashboard', { defaultValue: 'Partner Dashboard' })}
                    subtitle={t('admin.settings.partnerDashboardSubtitle', { defaultValue: 'View your assigned products' })}
                    onPress={() => navigation.navigate('AdminPartnerDashboard')}
                    color="#8B5CF6"
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                )}
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="people" title={t('admin.settings.customers', { defaultValue: 'Customer Management' })}
                  subtitle={t('admin.settings.customersSubtitle', { defaultValue: 'View users, set VIP roles, and manage access' })}
                  onPress={() => setShowCustomerPasswordGate(true)}
                  color="#FF9800"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="business" title={t('admin.settings.businessInfo')}
                  subtitle={t('admin.settings.businessInfoSubtitle')}
                  onPress={() => navigation.navigate('AdminBusinessInfo')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="storefront" title={t('admin.settings.storeProfile', { defaultValue: 'Store Profile' })}
                  subtitle={t('admin.settings.storeProfileSubtitle', { defaultValue: 'Public store info for products' })}
                  onPress={() => navigation.navigate('AdminStoreProfile')}
                  color="#009688"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="pricetags" title={t('admin.categories.title', { defaultValue: 'Categories' })}
                  subtitle={t('admin.categories.subtitle', { defaultValue: 'Manage categories & logos' })}
                  onPress={() => navigation.navigate('AdminCategoryManagement')}
                  color="#7C4DFF"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="ribbon" title={t('admin.brands.title', { defaultValue: 'Brands' })}
                  subtitle={t('admin.brands.subtitle', { defaultValue: 'Manage brands & logos' })}
                  onPress={() => navigation.navigate('AdminBrandManagement')}
                  color="#F5A00A"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="receipt" title={t('admin.settings.invoiceSettings', { defaultValue: 'Invoice Settings' })}
                  subtitle={t('admin.settings.invoiceSettingsSubtitle', { defaultValue: 'Logo & business details for invoices' })}
                  onPress={() => navigation.navigate('AdminInvoiceSettings')}
                  color="#E91E63"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="images" title={t('admin.settings.bannerManagement', { defaultValue: 'Banner Management' })}
                  subtitle={t('admin.settings.bannerManagementSubtitle', { defaultValue: 'Add, edit & reorder home banners' })}
                  onPress={() => navigation.navigate('AdminBannerManagement')}
                  color="#FF6F00"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="location" title={t('admin.settings.storeLocations')}
                  subtitle={t('admin.settings.storeLocationsSubtitle')}
                  onPress={() => navigation.navigate('AdminStoreLocations')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="cash-outline" title={t('admin.settings.currencySettings')}
                  subtitle={t('admin.settings.currencySettingsSubtitle')}
                  onPress={() => navigation.navigate('AdminCurrencySettings')}
                  color="#FF9800"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
              </View>
            </Animated.View>

            {/* ---- Notifications Section ---- */}
            <Animated.View entering={enterAnim(280)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('admin.settings.notifications')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                <LuxuryMenuItem icon="send" title={t('admin.settings.sendNotification')}
                  subtitle={t('admin.settings.sendNotificationSubtitle')}
                  onPress={navigateToSendNotification}
                  color="#9C27B0"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="notifications" title={t('admin.settings.pushNotifications', { defaultValue: 'Push Notifications' })}
                  subtitle={isDark
                    ? t('admin.settings.pushNotificationsSubtitle', { defaultValue: 'Receive order alerts' })
                    : t('admin.settings.pushNotificationsSubtitle', { defaultValue: 'Receive order alerts' })
                  }
                  hasSwitch switchValue={notificationsEnabled}
                  onSwitchChange={setNotificationsEnabled}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
              </View>
            </Animated.View>

            {/* ---- Data & Reports Section ---- */}
            <Animated.View entering={enterAnim(360)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('admin.settings.reports')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                <LuxuryMenuItem icon="clipboard" title={t('admin.settings.stockReport', { defaultValue: 'Stock Report' })}
                  subtitle={t('admin.settings.stockReportSubtitle', { defaultValue: 'Generate reorder invoices' })}
                  onPress={() => navigation.navigate('AdminStockReport')}
                  color="#4CAF50"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="bar-chart" title={t('admin.settings.analyticsReports')}
                  subtitle={t('admin.settings.analyticsReportsSubtitle')}
                  onPress={() => navigation.navigate('AdminAnalytics')}
                  color="#2196F3"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                {exporting ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#10B981" />
                    <Text allowFontScaling={false} style={{ marginTop: 8, color: theme.colors.text }}>{t('admin.settings.exportingData', { defaultValue: 'Exporting data...' })}</Text>
                  </View>
                ) : (
                  <LuxuryMenuItem icon="download" title={t('admin.settings.exportData', { defaultValue: 'Export All Data' })}
                    subtitle={t('admin.settings.exportDataSubtitle', { defaultValue: 'Export products, orders, and customers to JSON' })}
                    onPress={handleExportData}
                    color="#10B981"
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                )}
              </View>
            </Animated.View>

            {/* ---- Account Section ---- */}
            <Animated.View entering={enterAnim(440)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('admin.settings.account')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                <LuxuryMenuItem icon={isDark ? 'moon' : 'sunny-outline'} title={t('profile.menu.darkMode', { defaultValue: 'Dark Mode' })}
                  subtitle={isDark ? t('admin.settings.darkModeOn', { defaultValue: 'Dark theme active' }) : t('admin.settings.darkModeOff', { defaultValue: 'Light theme active' })}
                  hasSwitch switchValue={isDark}
                  onSwitchChange={(v) => setThemeMode(v ? 'dark' : 'light')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="language" title={t('admin.settings.language')}
                  subtitle={t('admin.settings.languageSubtitle')}
                  onPress={() => setShowLanguagePicker(true)}
                  color="#9C27B0"
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="shield-checkmark" title={t('admin.settings.accountSecurity', { defaultValue: 'Account & Security' })}
                  subtitle={t('admin.settings.accountSecuritySubtitle', { defaultValue: 'Email, phone, password & sign-in methods' })}
                  onPress={() => navigation.navigate('AdminAccountSecurity' as any)}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
              </View>
            </Animated.View>

            {/* ---- Logout ---- */}
            <Animated.View entering={enterAnim(520)} style={{ marginBottom: 20 }}>
              <TouchableOpacity onPress={handleLogout} activeOpacity={0.7}
                style={{
                  ...cardStyle, padding: 16,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
                <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '600', color: theme.colors.error }}>
                  {t('profile.logout.button')}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* ---- Delete Account ---- */}
            <Animated.View entering={enterAnim(600)} style={{ marginBottom: 20 }}>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.7}
                style={{
                  ...cardStyle, padding: 16,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)',
                }}>
                {deleting ? (
                  <ActivityIndicator size="small" color={theme.colors.error} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                    <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '600', color: theme.colors.error }}>
                      {t('admin.settings.deleteAccount', { defaultValue: 'Delete Account' })}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text allowFontScaling={false} style={{
                fontSize: 12, textAlign: 'center', marginTop: 8,
                color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
              }}>
                {t('admin.settings.deleteAccountSubtitle', { defaultValue: 'Permanently delete your store and all data' })}
              </Text>
            </Animated.View>

            {/* Version */}
            <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
              <Text allowFontScaling={false} style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }}
                adjustsFontSizeToFit numberOfLines={1}>
                Asankary Admin v1.0.0
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Language Picker Modal */}
        <LanguagePicker
          visible={showLanguagePicker}
          onClose={() => setShowLanguagePicker(false)}
          onSelectLanguage={handleLanguageChange}
          currentLanguage={i18n.language}
        />

        {/* Store Setup Modal */}
        <Modal
          visible={showSetupModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSetupModal(false)}
        >
          <View style={{
            flex: 1, justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)', padding: 24,
          }}>
            <View style={{
              ...cardStyle, width: '100%', padding: 24,
            }}>
              <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}
                adjustsFontSizeToFit numberOfLines={1}>
                {t('admin.settings.setupYourStore', { defaultValue: 'Setup Your Store' })}
              </Text>
              <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 }}
                adjustsFontSizeToFit numberOfLines={2}>
                {t('admin.settings.setupYourStoreSubtitle', { defaultValue: 'Enter your store name to complete setup:' })}
              </Text>
              <TextInput allowFontScaling={false}
                style={{
                  backgroundColor: isDark ? theme.colors.background : '#F5F5F7',
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  borderRadius: 12, borderWidth: 1,
                  fontSize: 16, minHeight: 48,
                  paddingHorizontal: 16, paddingVertical: 10,
                  marginBottom: 20,
                }}
                placeholder={t('admin.settings.storeNamePlaceholder', { defaultValue: 'e.g., Asankary' })}
                placeholderTextColor={theme.colors.textSecondary}
                value={storeName}
                onChangeText={setStoreName}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1, alignItems: 'center', justifyContent: 'center',
                    minHeight: 48, borderRadius: 12, borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  onPress={() => { setShowSetupModal(false); setStoreName(''); }}
                  disabled={upgrading}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text }}
                    adjustsFontSizeToFit numberOfLines={1}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1, alignItems: 'center', justifyContent: 'center',
                    minHeight: 48, borderRadius: 12,
                    backgroundColor: theme.colors.primary,
                  }}
                  onPress={handleConfirmSetup}
                  disabled={upgrading}
                  activeOpacity={0.8}
                >
                  {upgrading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}
                      adjustsFontSizeToFit numberOfLines={1}>
                      {t('admin.settings.setupStore', { defaultValue: 'Setup Store' })}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Password Gate for Customer Management */}
        <PasswordPromptModal
          visible={showCustomerPasswordGate}
          action="unlock_wholesale_settings"
          onClose={() => setShowCustomerPasswordGate(false)}
          onSuccess={(_msg, verifiedPassword) => {
            // Dismiss the modal first
            setShowCustomerPasswordGate(false);
            
            // Wait for the iOS UIViewController dismiss animation to complete (approx 300ms)
            // before pushing a new screen via react-navigation. Doing this instantly 
            // causes a fatal crash on iOS native UI layer.
            setTimeout(() => {
              navigation.navigate('AdminCustomers', { gatedPassword: verifiedPassword });
            }, 400);
          }}
        />
      </SafeAreaView>
    </View>
  );
};

export default AdminSettingsScreen;
