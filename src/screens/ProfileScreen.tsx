import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { isSyntheticEmail } from '../utils/hashUtils';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, ActivityIndicator, ImageBackground, I18nManager } from 'react-native';
import { Image } from 'expo-image';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../components/ThemeProvider';
import LanguagePicker from '../components/LanguagePicker';
import CurrencyPicker from '../components/CurrencyPicker';
import { useCurrency } from '../contexts/CurrencyContext';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { AuthService } from '../services/authService';
import { NotificationService } from '../services/NotificationService';
import { OrderService } from '../services/OrderService';
import { ImageService } from '../services/imageService';
import { USE_MOCK_DATA } from '../services/mockData';

import Logo from '../components/Logo';
import { changeLanguage, getDirection } from '../locales';
import { BRAND } from '../constants/config';

// Tab bar height constant
const TAB_BAR_HEIGHT = 60;

// ---- Helpers ----
const getMonogram = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name[0].toUpperCase();
};

// ========================
// MAIN PROFILE SCREEN
// ========================
export const ProfileScreen: React.FC = () => {
  const { theme, isDark, setThemeMode } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { signOut: logout, user: contextUser, deleteAccount, isVip, demoVip, setDemoVip } = useAuth();

  // State
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [orderStats, setOrderStats] = useState({ totalOrders: 0, totalSpent: 0, pendingOrders: 0 });
  const [notificationSettings, setNotificationSettings] = useState({ orderUpdates: true, promotions: true });
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const [resendingVerification, setResendingVerification] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const hasAnimated = useRef(false);

  // Luxury colors
  const pageBg = isDark ? theme.colors.background : '#F5F5F7';
  const cardBg = isDark ? theme.colors.surface : '#FFFFFF';
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';
  const tintBg = theme.colors.primary + '12';
  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  // Auth identity comes from AuthContext (contextUser); `user` holds the richer
  // fetched profile. Gate the guest-vs-authenticated UI on the session, not on the
  // profile fetch, so a transient/offline getCurrentUserFresh() miss can't demote a
  // logged-in user to the guest experience. Fall back to contextUser for display.
  const isAuthed = !!contextUser;
  const displayUser = user ?? contextUser;

  // Sync with AuthContext
  useFocusEffect(
    React.useCallback(() => {
      if (contextUser) {
        loadUserData();
      } else {
        setUser(null);
        setOrderStats({ totalOrders: 0, totalSpent: 0, pendingOrders: 0 });
        setLoading(false);
      }
    }, [contextUser])
  );

  useEffect(() => {
    if (!contextUser) {
      setUser(null);
      setOrderStats({ totalOrders: 0, totalSpent: 0, pendingOrders: 0 });
    }
  }, [contextUser]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const [userData, stats, settings] = await Promise.all([
        AuthService.getCurrentUserFresh(),
        OrderService.getOrderStatistics(),
        NotificationService.getNotificationSettings()
      ]);
      if (userData) {
        setUser(userData);
        setOrderStats(stats);
        setNotificationSettings(settings);
      }
      // If userData is falsy we intentionally keep the previously loaded profile
      // and stats: loadUserData only runs for an authenticated session, so a null
      // result is a transient cache miss / offline read, not a logout. Clearing
      // here would wrongly flip the screen to the guest UI. Logout is handled by
      // the contextUser effects below.
    } catch (error) {
      // Keep any previously loaded profile on failure. The guest/authed gate reads
      // contextUser (isAuthed), so a failed refresh no longer shows the guest UI.
      console.warn('ProfileScreen: failed to refresh user data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCoverUpload = async () => {
    if (!user) return;
    try {
      const imageUri = await ImageService.showImagePicker();
      if (!imageUri) return;
      setUploadingCover(true);
      const result = await ImageService.uploadImage(imageUri);
      if (result.success && result.url) {
        await AuthService.updateUserProfile(user.uid, { coverUrl: result.url });
        setUser(prev => prev ? { ...prev, coverUrl: result.url } : null);
      } else {
        Alert.alert(t('common.error'), result.error || 'Failed to upload');
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleLanguageSelect = (code: string) => { changeLanguage(code); };

  const handleCurrencySelect = async (code: 'USD' | 'IQD') => {
    try {
      await setCurrency(code);
      if (user) {
        await AuthService.updateUserProfile(user.uid, { preferredCurrency: code });
        setUser(prev => prev ? { ...prev, preferredCurrency: code } : null);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), 'Failed to save currency preference: ' + e.message);
    }
  };

  const handleNotificationSettingChange = async (setting: keyof typeof notificationSettings, value: boolean) => {
    const updated = { ...notificationSettings, [setting]: value };
    try {
      // Functional updater so a concurrent toggle of the other switch isn't lost.
      setNotificationSettings(prev => ({ ...prev, [setting]: value }));
      await NotificationService.updateNotificationSettings(updated);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
      // Revert only this setting (functional) instead of restoring a stale snapshot.
      setNotificationSettings(prev => ({ ...prev, [setting]: !value }));
    }
  };

  const handleLogout = () => {
    Alert.alert(t('profile.logout.title'), t('profile.logout.confirmation'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout.confirm'), style: 'destructive', onPress: async () => {
          try { await logout(); } catch (e: any) { Alert.alert(t('common.error'), e.message); }
        }
      },
    ]);
  };

  const handleResendVerification = async () => {
    try {
      setResendingVerification(true);
      // Get the user's email — prefer Firestore email (may differ from Auth for phone users)
      const emailToVerify = user?.email;
      if (!emailToVerify || isSyntheticEmail(emailToVerify)) {
        throw new Error(t('profile.emailVerification.noEmail', { defaultValue: 'No email address found. Please add your email in Edit Profile first.' }));
      }
      // Supabase: set this email on the auth account (phone users have a synthetic
      // @asankaryapp.internal auth email) and send its confirmation link.
      const { error } = await supabase.auth.updateUser({ email: emailToVerify });
      if (error) throw error;
      Alert.alert(t('auth.success'), t('profile.emailVerification.sent', { defaultValue: 'Verification email sent!' }));
    } catch (e: any) {
      Alert.alert(t('auth.error'), e.message);
    } finally {
      setResendingVerification(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount.title', { defaultValue: 'Delete Account' }),
      t('profile.deleteAccount.warning', { defaultValue: 'This will permanently delete your account and all associated data. This action cannot be undone.' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAccount.confirm', { defaultValue: 'Delete My Account' }), style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile.deleteAccount.finalTitle', { defaultValue: 'Are you absolutely sure?' }),
              t('profile.deleteAccount.finalWarning', { defaultValue: 'All your orders, messages, and profile data will be permanently deleted.' }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('profile.deleteAccount.finalConfirm', { defaultValue: 'Yes, Delete Everything' }), style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeletingAccount(true);
                      await deleteAccount();
                      Alert.alert(t('common.success'), t('profile.deleteAccount.success', { defaultValue: 'Your account has been deleted.' }));
                    } catch (error: any) {
                      if (error.message === 'REQUIRES_RECENT_LOGIN') {
                        Alert.alert(
                          t('profile.deleteAccount.reAuthTitle', { defaultValue: 'Re-authentication Required' }),
                          t('profile.deleteAccount.reAuthMessage', { defaultValue: 'Please log out and log back in, then try again.' })
                        );
                      } else {
                        Alert.alert(t('common.error'), error.message || 'Failed to delete account');
                      }
                    } finally { setDeletingAccount(false); }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const needsEmailVerification = user &&
    user.email && !user.emailVerified &&
    !isSyntheticEmail(user.email);

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

  // Mark animations as done after first render
  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  // Helper: only animate on first mount
  const enterAnim = (delay: number, duration: number = 400) =>
    hasAnimated.current ? undefined : FadeInDown.delay(delay).duration(duration);

  // ---- Skeleton ----
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: pageBg }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
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
          contentContainerStyle={{ paddingTop: insets.top + 44, paddingBottom: TAB_BAR_HEIGHT + insets.bottom }}
        >
          {/* =============== BANNER HERO =============== */}
          <Animated.View entering={enterAnim(80, 450)}
            style={{ marginHorizontal: 20, marginTop: 12, marginBottom: 8 }}>
            <ImageBackground
              source={displayUser?.coverUrl ? { uri: displayUser.coverUrl } : require('../../assets/hero-truck.jpg')}
              style={{ borderRadius: 20, overflow: 'hidden', minHeight: 240 }}
              imageStyle={{ borderRadius: 20 }}
              resizeMode="cover"
            >
              {/* Camera badge for cover */}
              {user && (
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
              )}

              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
                style={{ paddingHorizontal: 5, paddingTop: 5, paddingBottom: 10, minHeight: 240, justifyContent: 'flex-start' }}
              >
                {/* Top row: Avatar + Name/VIP — anchored top-left */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  {/* Avatar */}
                  <View style={{
                    width: 72, height: 72, borderRadius: 36,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    justifyContent: 'center', alignItems: 'center',
                    overflow: 'hidden',
                    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.3)',
                    marginRight: 14,
                  }}>
                    {displayUser?.profileImageUrl ? (
                      <Image source={{ uri: displayUser.profileImageUrl }}
                        style={{ width: 72, height: 72, borderRadius: 36 }}
                        contentFit="cover" transition={0} cachePolicy="memory-disk" priority="high" />
                    ) : isAuthed ? (
                      <Text allowFontScaling={false} style={{ fontSize: 28, fontWeight: '700', color: 'white' }}>
                        {getMonogram(displayUser?.fullName || '')}
                      </Text>
                    ) : (
                      <Logo size={38} variant="white" />
                    )}
                  </View>

                  {/* Name + VIP */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text allowFontScaling={false} style={{ fontSize: 22, fontWeight: '700', color: 'white', letterSpacing: -0.3 }}
                        adjustsFontSizeToFit numberOfLines={1}>
                        {isAuthed ? (displayUser?.fullName || t('profile.yourName', { defaultValue: 'Your Name' })) : t('profile.guest.welcome', { defaultValue: 'Welcome, Guest!' })}
                      </Text>
                      {isAuthed && (
                        <TouchableOpacity onPress={() => (navigation as any).navigate('EditProfile')} style={{ marginLeft: 8, padding: 4 }} activeOpacity={0.7}>
                          <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>
                      )}

                      {isAuthed && isVip && (
                        <View style={{
                          backgroundColor: '#FFD700',
                          marginLeft: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
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
                          <Ionicons name="diamond" size={14} color="#000" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#000', fontWeight: '800', fontStyle: 'italic', fontSize: 11 }} allowFontScaling={false}>VIP</Text>
                        </View>
                      )}
                    </View>
                    {!isAuthed && (
                      <Text allowFontScaling={false} style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                        {t('profile.guest.subtitle', { defaultValue: 'Sign in to access your profile and orders' })}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Stats row (logged in only) */}
                {isAuthed && (
                  <View style={{
                    flexDirection: 'row', width: '100%', marginTop: 12, paddingTop: 16,
                    borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.2)',
                  }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text allowFontScaling={false} style={{ fontSize: 22, fontWeight: '700', color: 'white' }}
                        adjustsFontSizeToFit numberOfLines={1}>
                        {orderStats.totalOrders}
                      </Text>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3, letterSpacing: 0.3 }}
                        adjustsFontSizeToFit numberOfLines={1}>
                        {t('profile.stats.orders')}
                      </Text>
                    </View>
                    <View style={{ width: 0.5, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 }} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text allowFontScaling={false} style={{ fontSize: 22, fontWeight: '700', color: 'white' }}
                        adjustsFontSizeToFit numberOfLines={1}>
                        {orderStats.pendingOrders}
                      </Text>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3, letterSpacing: 0.3 }}
                        adjustsFontSizeToFit numberOfLines={1}>
                        {t('profile.stats.pending')}
                      </Text>
                    </View>
                  </View>
                )}
                {/* Email — below the stats */}
                {displayUser?.email && !isSyntheticEmail(displayUser.email) && (
                  <Text allowFontScaling={false} style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 50, textAlign: isRTL ? 'right' : 'left' }}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {displayUser?.email}
                  </Text>
                )}
              </LinearGradient>
            </ImageBackground>
          </Animated.View>



          {/* =============== GUEST BUTTONS =============== */}
          {!isAuthed && (
            <Animated.View entering={enterAnim(160)}
              style={{ paddingHorizontal: 20, marginTop: 8, marginBottom: 20, gap: 10 }}>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('SignIn')}
                activeOpacity={0.8}
                style={{
                  backgroundColor: theme.colors.primary, borderRadius: 16, height: 52,
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: 'white' }}>
                  {t('auth.signIn', { defaultValue: 'Sign In' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('Register')}
                activeOpacity={0.8}
                style={{
                  backgroundColor: 'transparent', borderRadius: 16, height: 52,
                  justifyContent: 'center', alignItems: 'center',
                  borderWidth: 1.5, borderColor: theme.colors.primary,
                }}
              >
                <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: theme.colors.primary }}>
                  {t('auth.signUp', { defaultValue: 'Create Account' })}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* =============== CONTENT CARDS =============== */}
          <View style={{ paddingHorizontal: 20 }}>

            {/* Email Verification Banner */}
            {needsEmailVerification && (
              <Animated.View entering={enterAnim(200)} style={{ marginBottom: 12 }}>
                <View style={{
                  ...cardStyle,
                  backgroundColor: isDark ? 'rgba(251,191,36,0.1)' : '#FFFBEB',
                  padding: 16, flexDirection: 'row', alignItems: 'center',
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : '#FEF3C7',
                    justifyContent: 'center', alignItems: 'center', marginRight: 12,
                  }}>
                    <Ionicons name="mail-unread-outline" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FBBF24' : '#92400E' }}>
                      {t('profile.emailVerification.title', { defaultValue: 'Verify your email' })}
                    </Text>
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: isDark ? 'rgba(251,191,36,0.7)' : '#B45309', marginTop: 2 }}>
                      {t('profile.emailVerification.subtitle', { defaultValue: 'Check your inbox for verification link' })}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleResendVerification} disabled={resendingVerification}
                    style={{
                      backgroundColor: '#D97706', paddingHorizontal: 14, paddingVertical: 8,
                      borderRadius: 10, opacity: resendingVerification ? 0.6 : 1,
                    }}>
                    {resendingVerification ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                        {t('profile.emailVerification.resend', { defaultValue: 'Resend' })}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* ---- Account Section ---- */}
            {isAuthed && (
              <Animated.View entering={enterAnim(240)} style={{ marginBottom: 20 }}>
                <SectionTitle title={t('profile.sections.account')} labelColor={labelColor} />
                <View style={{ ...cardStyle, overflow: 'hidden' }}>
                  <LuxuryMenuItem icon="person-outline" title={t('profile.menu.profile', { defaultValue: 'Profile' })}
                    subtitle={t('profile.menu.profileSubtitle', { defaultValue: 'Name, email, phone & password' })}
                    onPress={() => (navigation as any).navigate('AccountSecurity')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="location-outline" title={t('profile.menu.addresses')}
                    onPress={() => (navigation as any).navigate('MyAddress')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="cube-outline" title={t('shippingInfo.title')}
                    subtitle={t('shippingInfo.subtitle')}
                    onPress={() => (navigation as any).navigate('ShippingInfo')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="card-outline" title={t('profile.menu.paymentMethods')}
                    onPress={() => (navigation as any).navigate('PaymentMethods')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="trash-outline"
                    title={t('profile.deleteAccount.title', { defaultValue: 'Delete Account' })}
                    subtitle={t('profile.deleteAccount.subtitle', { defaultValue: 'Permanently delete your account and data' })}
                    onPress={handleDeleteAccount}
                    destructive
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                </View>
              </Animated.View>
            )}

            {/* ---- Settings Section ---- */}
            <Animated.View entering={enterAnim(320)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('profile.sections.settings')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                <LuxuryMenuItem icon={isDark ? 'moon' : 'sunny-outline'} title={t('profile.menu.darkMode', { defaultValue: 'Dark Mode' })}
                  hasSwitch switchValue={isDark}
                  onSwitchChange={(v) => setThemeMode(v ? 'dark' : 'light')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="language-outline" title={t('profile.menu.language')}
                  subtitle={t(`profile.language.current.${i18n.language}`)}
                  onPress={() => setLanguagePickerVisible(true)}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="cash-outline" title={t('profile.menu.currency', { defaultValue: 'Currency' })}
                  subtitle={currency === 'USD' ? t('profile.currencyUsd', { defaultValue: 'US Dollar ($)' }) : t('profile.currencyIqd', { defaultValue: 'Iraqi Dinar (IQD)' })}
                  onPress={() => setCurrencyPickerVisible(true)}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
              </View>
            </Animated.View>

            {/* ---- Demo Tools (offline mock mode only) ---- */}
            {USE_MOCK_DATA && (
              <Animated.View entering={enterAnim(360)} style={{ marginBottom: 20 }}>
                <SectionTitle title={t('profile.sections.demoTools', { defaultValue: 'Demo Tools' })} labelColor={labelColor} />
                <View style={{ ...cardStyle, overflow: 'hidden' }}>
                  <LuxuryMenuItem icon="diamond-outline"
                    title={t('profile.menu.previewVip', { defaultValue: 'Preview as VIP' })}
                    subtitle={t('profile.menu.previewVipSub', { defaultValue: 'See VIP-only prices (demo)' })}
                    hasSwitch switchValue={demoVip}
                    onSwitchChange={(v) => setDemoVip(v)}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="pricetags-outline"
                    title={t('profile.menu.brandManager', { defaultValue: 'Brand Manager' })}
                    subtitle={t('profile.menu.brandManagerSub', { defaultValue: 'Add brands & upload logos (demo)' })}
                    onPress={() => (navigation as any).navigate('AdminBrandManagement')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="grid-outline"
                    title={t('profile.menu.categoryManager', { defaultValue: 'Category Manager' })}
                    subtitle={t('profile.menu.categoryManagerSub', { defaultValue: 'Add categories & upload logos (demo)' })}
                    onPress={() => (navigation as any).navigate('AdminCategoryManagement')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="ticket-outline"
                    title={t('profile.menu.promoManager', { defaultValue: 'Promo Codes' })}
                    subtitle={t('profile.menu.promoManagerSub', { defaultValue: 'Create discount codes (demo)' })}
                    onPress={() => (navigation as any).navigate('AdminPromoManagement')}
                    theme={theme} isDark={isDark} tintBg={tintBg} />
                </View>
              </Animated.View>
            )}

            {/* ---- Notifications Section ---- */}
            <Animated.View entering={enterAnim(400)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('profile.sections.notifications')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                <LuxuryMenuItem icon="receipt-outline" title={t('profile.notifications.orderUpdates')}
                  hasSwitch switchValue={notificationSettings.orderUpdates}
                  onSwitchChange={(v) => handleNotificationSettingChange('orderUpdates', v)}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="megaphone-outline" title={t('profile.notifications.promotions')}
                  hasSwitch switchValue={notificationSettings.promotions}
                  onSwitchChange={(v) => handleNotificationSettingChange('promotions', v)}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
              </View>
            </Animated.View>

            {/* ---- Support Section ---- */}
            <Animated.View entering={enterAnim(480)} style={{ marginBottom: 20 }}>
              <SectionTitle title={t('profile.sections.support')} labelColor={labelColor} />
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                <LuxuryMenuItem icon="help-circle-outline" title={t('profile.menu.help')}
                  onPress={() => (navigation as any).navigate('HelpSupport')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="chatbubble-outline" title={t('profile.menu.contactUs')}
                  onPress={() => Alert.alert(
                    t('profile.contactUs.title', { name: BRAND.name, defaultValue: 'Contact {{name}}' }),
                    `${t('profile.contactUs.email', { defaultValue: 'Email:' })} ${BRAND.contactEmail}\n${t('profile.contactUs.whatsapp', { defaultValue: 'WhatsApp:' })} ${BRAND.contactPhone}\n\n${t('profile.contactUs.storeLocation', { defaultValue: 'Store Location:' })}\n${BRAND.address}\n\n${t('profile.contactUs.businessHours', { defaultValue: 'Business Hours:' })}\n${t('profile.contactUs.hoursSatThu', { defaultValue: 'Sat-Thu: 8:00 AM - 6:00 PM' })}\n${t('profile.contactUs.fridayClosed', { defaultValue: 'Friday: Closed' })}`
                  )}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="document-text-outline" title={t('profile.menu.termsAndConditions')}
                  onPress={() => (navigation as any).navigate('TermsAndConditions')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="shield-checkmark-outline" title={t('profile.menu.privacyPolicy')}
                  onPress={() => (navigation as any).navigate('PrivacyPolicy')}
                  theme={theme} isDark={isDark} tintBg={tintBg} />
              </View>
            </Animated.View>

            {/* ---- Logout / Sign In ---- */}
            <Animated.View entering={enterAnim(560)}
              style={{ marginBottom: 20 }}>
              {isAuthed ? (
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
              ) : (
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('SignIn')}
                  activeOpacity={0.7}
                  style={{
                    ...cardStyle, padding: 16,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <Ionicons name="log-in-outline" size={20} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '600', color: theme.colors.primary }}>
                    {t('profile.guest.signInButton', { defaultValue: 'Sign In to Your Account' })}
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </ScrollView>

        {/* Language Picker Modal */}
        <LanguagePicker
          visible={languagePickerVisible}
          onClose={() => setLanguagePickerVisible(false)}
          onSelectLanguage={handleLanguageSelect}
          currentLanguage={i18n.language}
        />

        {/* Currency Picker Modal */}
        <CurrencyPicker
          visible={currencyPickerVisible}
          onClose={() => setCurrencyPickerVisible(false)}
          onSelectCurrency={handleCurrencySelect}
          currentCurrency={currency}
        />
      </SafeAreaView>
    </View>
  );
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
}> = ({ icon, title, subtitle, onPress, hasSwitch, switchValue, onSwitchChange, destructive, theme, isDark, tintBg }) => {
  const { i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const iconColor = destructive ? theme.colors.error : theme.colors.primary;
  const iconBg = destructive
    ? (isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)')
    : tintBg;

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

export default ProfileScreen;
