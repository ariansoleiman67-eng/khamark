import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import { BRAND, brandContact, contactBlockOr, CONTACT_FALLBACK } from '../constants/config';

// Constant for floating tab bar clearance
const TAB_BAR_BOTTOM_CLEARANCE = 100;

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
  const [notificationSettings, setNotificationSettings] = useState({ orderUpdates: false, promotions: false });
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const [resendingVerification, setResendingVerification] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const hasAnimated = useRef(false);

  // Luxury theme surfaces
  const pageBg = isDark ? theme.colors.background : '#F5F5F7';
  const cardBg = isDark ? theme.colors.surface : '#FFFFFF';
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.42)';
  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  const isAuthed = !!contextUser;
  const displayUser = user ?? contextUser;

  const reqIdRef = useRef(0);

  // Check device-level guest notification preferences without prompting on entry
  const checkGuestNotificationPreferences = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        setNotificationSettings({ orderUpdates: false, promotions: false });
        return;
      }
      const savedPref = await AsyncStorage.getItem('guest_promotions_pref');
      setNotificationSettings({ orderUpdates: false, promotions: savedPref === 'true' });
    } catch {
      setNotificationSettings({ orderUpdates: false, promotions: false });
    }
  }, []);

  // Sync with AuthContext
  useFocusEffect(
    useCallback(() => {
      reqIdRef.current++;
      if (contextUser?.uid) {
        loadUserData(contextUser.uid);
      } else {
        setUser(null);
        setOrderStats({ totalOrders: 0, totalSpent: 0, pendingOrders: 0 });
        checkGuestNotificationPreferences();
        setLoading(false);
      }
    }, [contextUser?.uid, checkGuestNotificationPreferences])
  );

  useEffect(() => {
    if (!contextUser) {
      reqIdRef.current++;
      setUser(null);
      setOrderStats({ totalOrders: 0, totalSpent: 0, pendingOrders: 0 });
      checkGuestNotificationPreferences();
    }
  }, [contextUser, checkGuestNotificationPreferences]);

  const loadUserData = async (uid: string) => {
    const req = ++reqIdRef.current;
    const isStale = () => req !== reqIdRef.current;
    try {
      setLoading(true);
      const [userData, stats, settings] = await Promise.all([
        AuthService.getCurrentUserFresh(),
        OrderService.getOrderStatistics(),
        NotificationService.getNotificationSettings(),
      ]);
      if (isStale() || (userData && userData.uid !== uid)) return;
      if (userData) {
        setUser(userData);
        setOrderStats(stats);
        setNotificationSettings(settings);
      }
    } catch (error) {
      if (isStale()) return;
      console.warn('ProfileScreen: failed to refresh user data', error);
    } finally {
      if (!isStale()) setLoading(false);
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

  // Safe notification handlers respecting guest vs authenticated state
  const handleToggleOrderUpdates = async (value: boolean) => {
    if (!isAuthed) {
      Alert.alert(
        t('profile.notifications.signInRequiredTitle', { defaultValue: 'Sign In Required' }),
        t('profile.notifications.orderUpdatesGuestMsg', { defaultValue: 'Please sign in to receive real-time order status and tracking updates.' }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { text: t('auth.signIn', { defaultValue: 'Sign In' }), onPress: () => (navigation as any).navigate('SignIn') },
        ]
      );
      return;
    }

    if (value) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        if (req.status !== 'granted') {
          Alert.alert(
            t('profile.notifications.permissionRequiredTitle', { defaultValue: 'Notifications Disabled' }),
            t('profile.notifications.permissionRequiredMsg', { defaultValue: 'Please enable notifications in your device settings to receive updates.' })
          );
          return;
        }
      }
    }

    try {
      setNotificationSettings(prev => ({ ...prev, orderUpdates: value }));
      await NotificationService.updateNotificationSettings({
        ...notificationSettings,
        orderUpdates: value,
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
      setNotificationSettings(prev => ({ ...prev, orderUpdates: !value }));
    }
  };

  const handleTogglePromotions = async (value: boolean) => {
    if (value) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        if (req.status !== 'granted') {
          Alert.alert(
            t('profile.notifications.permissionRequiredTitle', { defaultValue: 'Notifications Disabled' }),
            t('profile.notifications.permissionRequiredMsg', { defaultValue: 'Please enable notifications in your device settings to receive updates.' })
          );
          return;
        }
      }
    }

    try {
      setNotificationSettings(prev => ({ ...prev, promotions: value }));
      await AsyncStorage.setItem('guest_promotions_pref', String(value));
      await NotificationService.setDevicePushEnabled(value);
      if (isAuthed) {
        await NotificationService.updateNotificationSettings({
          ...notificationSettings,
          promotions: value,
        });
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
      setNotificationSettings(prev => ({ ...prev, promotions: !value }));
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
      const emailToVerify = user?.email;
      if (!emailToVerify || isSyntheticEmail(emailToVerify)) {
        throw new Error(t('profile.emailVerification.noEmail', { defaultValue: 'No email address found. Please add your email in Edit Profile first.' }));
      }
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
              t('profile.deleteAccount.finalWarning', { defaultValue: 'Your profile, cart, devices, and messages will be permanently deleted. Past order records will be unlinked and fully anonymized for tax compliance.' }),
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0 : 0.02,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden' as const,
  };

  // Mark animations as done after first render
  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  const enterAnim = (delay: number, duration: number = 400) =>
    hasAnimated.current ? undefined : FadeInDown.delay(delay).duration(duration);

  // ---- Loading Skeleton ----
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
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* Screen Header */}
        <View style={{
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
        }}>
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 18,
              fontWeight: '600',
              color: theme.colors.text,
              letterSpacing: -0.2,
            }}
          >
            {t('profile.title', 'My Profile')}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 10,
            paddingBottom: TAB_BAR_BOTTOM_CLEARANCE + insets.bottom,
          }}
        >
          {/* =============== AUTHENTICATED HERO BANNER =============== */}
          {isAuthed && (
            <Animated.View entering={enterAnim(80, 450)}
              style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 16 }}>
              <ImageBackground
                source={displayUser?.coverUrl ? { uri: displayUser.coverUrl } : undefined}
                style={{
                  borderRadius: 18,
                  overflow: 'hidden',
                  minHeight: 200,
                  backgroundColor: theme.colors.primary,
                }}
                imageStyle={{ borderRadius: 18 }}
                resizeMode="cover"
              >
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
                  colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.72)']}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    minHeight: 200,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                    <View style={{
                      width: 64, height: 64, borderRadius: 32,
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      justifyContent: 'center', alignItems: 'center',
                      overflow: 'hidden',
                      borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
                      marginRight: isRTL ? 0 : 14,
                      marginLeft: isRTL ? 14 : 0,
                    }}>
                      {displayUser?.profileImageUrl ? (
                        <Image source={{ uri: displayUser.profileImageUrl }}
                          style={{ width: 64, height: 64, borderRadius: 32 }}
                          contentFit="cover" transition={0} cachePolicy="memory-disk" priority="high" />
                      ) : (
                        <Text allowFontScaling={false} style={{ fontSize: 24, fontWeight: '700', color: 'white' }}>
                          {getMonogram(displayUser?.fullName || '')}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: '700', color: 'white', letterSpacing: -0.3 }}
                          adjustsFontSizeToFit numberOfLines={1}>
                          {displayUser?.fullName || t('profile.yourName', { defaultValue: 'Your Name' })}
                        </Text>
                        <TouchableOpacity onPress={() => (navigation as any).navigate('EditProfile')}
                          style={{ marginHorizontal: 8, padding: 4 }} activeOpacity={0.7}>
                          <Ionicons name="pencil" size={15} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>

                        {isVip && (
                          <View style={{
                            backgroundColor: '#FFD700',
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}>
                            <Ionicons name="diamond" size={12} color="#000" style={{ marginRight: 3 }} />
                            <Text style={{ color: '#000', fontWeight: '800', fontStyle: 'italic', fontSize: 10 }} allowFontScaling={false}>VIP</Text>
                          </View>
                        )}
                      </View>

                      {displayUser?.email && !isSyntheticEmail(displayUser.email) && (
                        <Text allowFontScaling={false} style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}
                          numberOfLines={1}>
                          {displayUser.email}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Stats row */}
                  <View style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row', width: '100%', marginTop: 14, paddingTop: 12,
                    borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.2)',
                  }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: '700', color: 'white' }}>
                        {orderStats.totalOrders}
                      </Text>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                        {t('profile.stats.orders')}
                      </Text>
                    </View>
                    <View style={{ width: 0.5, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 }} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: '700', color: 'white' }}>
                        {orderStats.pendingOrders}
                      </Text>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                        {t('profile.stats.pending')}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </ImageBackground>
            </Animated.View>
          )}

          {/* =============== GUEST WELCOME CARD =============== */}
          {!isAuthed && (
            <Animated.View entering={enterAnim(80, 450)} style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 12 }}>
              <View
                style={{
                  backgroundColor: cardBg,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  padding: 16,
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                }}
              >
                {/* Clean, Single-Ring Khamark Logo Badge */}
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(166,25,32,0.06)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(166,25,32,0.12)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Image
                    source={isDark
                      ? require('../../assets/images/khamark_logo_white.png')
                      : require('../../assets/images/khamark_logo_crimson.png')}
                    style={{ width: 32, height: 16 }}
                    contentFit="contain"
                    priority="high"
                  />
                </View>

                {/* Welcome Message */}
                <View style={{
                  flex: 1,
                  marginLeft: isRTL ? 0 : 12,
                  marginRight: isRTL ? 12 : 0,
                }}>
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.colors.text,
                      letterSpacing: -0.2,
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                    numberOfLines={1}
                  >
                    {t('profile.guest.welcome', { defaultValue: 'Welcome to Khamark' })}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: 13,
                      fontWeight: '400',
                      color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
                      marginTop: 2,
                      lineHeight: 18,
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                  >
                    {t('profile.guest.subtitle', { defaultValue: 'Sign in to access your account and orders' })}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* =============== GUEST AUTH ACTIONS =============== */}
          {!isAuthed && (
            <Animated.View entering={enterAnim(140)} style={{ marginHorizontal: 16, marginBottom: 18, gap: 10 }}>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('SignIn')}
                activeOpacity={0.85}
                style={{
                  minHeight: 48,
                  backgroundColor: '#A61920',
                  borderRadius: 12,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF', letterSpacing: 0.1 }}>
                  {t('auth.signIn', { defaultValue: 'Sign In' })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => (navigation as any).navigate('Register')}
                activeOpacity={0.8}
                style={{
                  minHeight: 48,
                  backgroundColor: 'transparent',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                  {t('auth.createAccount', { defaultValue: 'Create Account' })}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* =============== CONTENT CARDS =============== */}
          <View style={{ paddingHorizontal: 16 }}>

            {/* Email Verification Banner */}
            {needsEmailVerification && (
              <Animated.View entering={enterAnim(200)} style={{ marginBottom: 16 }}>
                <View style={{
                  ...cardStyle,
                  backgroundColor: isDark ? 'rgba(251,191,36,0.1)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(251,191,36,0.2)' : '#FDE68A',
                  padding: 14, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center',
                }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : '#FEF3C7',
                    justifyContent: 'center', alignItems: 'center',
                    marginRight: isRTL ? 0 : 12,
                    marginLeft: isRTL ? 12 : 0,
                  }}>
                    <Ionicons name="mail-unread-outline" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FBBF24' : '#92400E', textAlign: isRTL ? 'right' : 'left' }}>
                      {t('profile.emailVerification.title', { defaultValue: 'Verify your email' })}
                    </Text>
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: isDark ? 'rgba(251,191,36,0.7)' : '#B45309', marginTop: 2, textAlign: isRTL ? 'right' : 'left' }}>
                      {t('profile.emailVerification.subtitle', { defaultValue: 'Check your inbox for verification link' })}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleResendVerification} disabled={resendingVerification}
                    style={{
                      backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: 8, opacity: resendingVerification ? 0.6 : 1,
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

            {/* ---- Account Section (Authenticated only) ---- */}
            {isAuthed && (
              <Animated.View entering={enterAnim(220)} style={{ marginBottom: 18 }}>
                <SectionTitle title={t('profile.sections.account')} labelColor={labelColor} />
                <View style={cardStyle}>
                  <LuxuryMenuItem icon="person-outline" title={t('profile.menu.profile', { defaultValue: 'Profile' })}
                    subtitle={t('profile.menu.profileSubtitle', { defaultValue: 'Name, email, phone & password' })}
                    onPress={() => (navigation as any).navigate('AccountSecurity')}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="location-outline" title={t('profile.menu.addresses')}
                    onPress={() => (navigation as any).navigate('MyAddress')}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="phone-portrait-outline" title={t('tradeIn.title')}
                    onPress={() => {
                      if (!contextUser?.uid) {
                        (navigation as any).navigate('SignIn');
                        return;
                      }
                      (navigation as any).navigate('TradeInRequest');
                    }}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="list-outline" title={t('tradeIn.myRequests')}
                    onPress={() => {
                      if (!contextUser?.uid) {
                        (navigation as any).navigate('SignIn');
                        return;
                      }
                      (navigation as any).navigate('MyTradeIns');
                    }}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="cube-outline" title={t('shippingInfo.title')}
                    subtitle={t('shippingInfo.subtitle')}
                    onPress={() => (navigation as any).navigate('ShippingInfo')}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="card-outline" title={t('profile.menu.paymentMethods')}
                    onPress={() => (navigation as any).navigate('PaymentMethods')}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="trash-outline"
                    title={t('profile.deleteAccount.title', { defaultValue: 'Delete Account' })}
                    subtitle={t('profile.deleteAccount.subtitle', { defaultValue: 'Permanently delete your account and data' })}
                    onPress={handleDeleteAccount}
                    destructive
                    theme={theme} isDark={isDark} />
                </View>
              </Animated.View>
            )}

            {/* ---- Settings Section ---- */}
            <Animated.View entering={enterAnim(260)} style={{ marginBottom: 18 }}>
              <SectionTitle title={t('profile.sections.settings')} labelColor={labelColor} />
              <View style={cardStyle}>
                <LuxuryMenuItem icon={isDark ? 'moon-outline' : 'sunny-outline'} title={t('profile.menu.darkMode', { defaultValue: 'Dark Mode' })}
                  hasSwitch switchValue={isDark}
                  onSwitchChange={(v) => setThemeMode(v ? 'dark' : 'light')}
                  theme={theme} isDark={isDark} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="language-outline" title={t('profile.menu.language')}
                  trailingValue={t(`profile.language.current.${i18n.language}`)}
                  onPress={() => setLanguagePickerVisible(true)}
                  theme={theme} isDark={isDark} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="cash-outline" title={t('profile.menu.currency', { defaultValue: 'Currency' })}
                  trailingValue={currency === 'USD' ? 'USD ($)' : 'IQD'}
                  onPress={() => setCurrencyPickerVisible(true)}
                  theme={theme} isDark={isDark} />
              </View>
            </Animated.View>

            {/* ---- Notifications Section ---- */}
            <Animated.View entering={enterAnim(300)} style={{ marginBottom: 18 }}>
              <SectionTitle title={t('profile.sections.notifications')} labelColor={labelColor} />
              <View style={cardStyle}>
                <LuxuryMenuItem icon="receipt-outline" title={t('profile.notifications.orderUpdates')}
                  hasSwitch switchValue={notificationSettings.orderUpdates}
                  onSwitchChange={handleToggleOrderUpdates}
                  theme={theme} isDark={isDark} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="megaphone-outline" title={t('profile.notifications.promotions')}
                  hasSwitch switchValue={notificationSettings.promotions}
                  onSwitchChange={handleTogglePromotions}
                  theme={theme} isDark={isDark} />
              </View>
            </Animated.View>

            {/* ---- Demo Tools (offline mock mode only, excluded in release builds) ---- */}
            {__DEV__ && USE_MOCK_DATA && (
              <Animated.View entering={enterAnim(340)} style={{ marginBottom: 18 }}>
                <SectionTitle title={t('profile.sections.demoTools', { defaultValue: 'Demo Tools' })} labelColor={labelColor} />
                <View style={cardStyle}>
                  <LuxuryMenuItem icon="diamond-outline"
                    title={t('profile.menu.previewVip', { defaultValue: 'Preview as VIP' })}
                    subtitle={t('profile.menu.previewVipSub', { defaultValue: 'See VIP-only prices' })}
                    hasSwitch switchValue={demoVip}
                    onSwitchChange={(v) => setDemoVip(v)}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="pricetags-outline"
                    title={t('profile.menu.brandManager', { defaultValue: 'Brand Manager' })}
                    subtitle={t('profile.menu.brandManagerSub', { defaultValue: 'Add brands & upload logos' })}
                    onPress={() => (navigation as any).navigate('AdminBrandManagement')}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="grid-outline"
                    title={t('profile.menu.categoryManager', { defaultValue: 'Category Manager' })}
                    subtitle={t('profile.menu.categoryManagerSub', { defaultValue: 'Add categories & upload logos' })}
                    onPress={() => (navigation as any).navigate('AdminCategoryManagement')}
                    theme={theme} isDark={isDark} />
                  <Divider isDark={isDark} />
                  <LuxuryMenuItem icon="ticket-outline"
                    title={t('profile.menu.promoManager', { defaultValue: 'Promo Codes' })}
                    subtitle={t('profile.menu.promoManagerSub', { defaultValue: 'Create discount codes customers type at checkout' })}
                    onPress={() => (navigation as any).navigate('AdminPromoManagement')}
                    theme={theme} isDark={isDark} />
                </View>
              </Animated.View>
            )}

            {/* ---- Support Section ---- */}
            <Animated.View entering={enterAnim(380)} style={{ marginBottom: 18 }}>
              <SectionTitle title={t('profile.sections.support')} labelColor={labelColor} />
              <View style={cardStyle}>
                <LuxuryMenuItem icon="help-circle-outline" title={t('profile.menu.help')}
                  onPress={() => (navigation as any).navigate('HelpSupport')}
                  theme={theme} isDark={isDark} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="chatbubble-outline" title={t('profile.menu.contactUs')}
                  onPress={() => Alert.alert(
                    t('profile.contactUs.title', { name: BRAND.name, defaultValue: 'Contact {{name}}' }),
                    [
                      contactBlockOr(
                        CONTACT_FALLBACK,
                        [t('profile.contactUs.email', { defaultValue: 'Email:' }).replace(/:$/, ''), BRAND.contactEmail],
                        [t('profile.contactUs.whatsapp', { defaultValue: 'WhatsApp:' }).replace(/:$/, ''), BRAND.contactPhone],
                      ),
                      brandContact(BRAND.address)
                        ? `${t('profile.contactUs.storeLocation', { defaultValue: 'Store Location:' })}\n${brandContact(BRAND.address)}`
                        : null,
                      `${t('profile.contactUs.businessHours', { defaultValue: 'Business Hours:' })}\n${t('profile.contactUs.hoursSatThu', { defaultValue: 'Sat-Thu: 8:00 AM - 6:00 PM' })}\n${t('profile.contactUs.fridayClosed', { defaultValue: 'Friday: Closed' })}`,
                    ].filter(Boolean).join('\n\n')
                  )}
                  theme={theme} isDark={isDark} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="document-text-outline" title={t('profile.menu.termsAndConditions')}
                  onPress={() => (navigation as any).navigate('TermsAndConditions')}
                  theme={theme} isDark={isDark} />
                <Divider isDark={isDark} />
                <LuxuryMenuItem icon="shield-checkmark-outline" title={t('profile.menu.privacyPolicy')}
                  onPress={() => (navigation as any).navigate('PrivacyPolicy')}
                  theme={theme} isDark={isDark} />
              </View>
            </Animated.View>

            {/* ---- Logout / Sign In Bottom Action ---- */}
            <Animated.View entering={enterAnim(420)} style={{ marginBottom: 20 }}>
              {isAuthed ? (
                <TouchableOpacity onPress={handleLogout} activeOpacity={0.75}
                  style={{
                    ...cardStyle, padding: 14,
                    flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <Ionicons name="log-out-outline" size={18} color={theme.colors.error} />
                  <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: '600', color: theme.colors.error }}>
                    {t('profile.logout.button')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('SignIn')}
                  activeOpacity={0.75}
                  style={{
                    ...cardStyle, padding: 14,
                    flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <Ionicons name="log-in-outline" size={18} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: '600', color: theme.colors.primary }}>
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
  <Text
    allowFontScaling={false}
    style={{
      fontSize: 12,
      fontWeight: '600',
      color: labelColor,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 4,
    }}
  >
    {title}
  </Text>
);

const Divider: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const { i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  return (
    <View
      style={{
        height: 0.5,
        marginLeft: isRTL ? 0 : 60,
        marginRight: isRTL ? 60 : 0,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }}
    />
  );
};

const LuxuryMenuItem: React.FC<{
  icon: string;
  title: string;
  subtitle?: string;
  trailingValue?: string;
  onPress?: () => void;
  hasSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  destructive?: boolean;
  theme: any;
  isDark: boolean;
}> = ({
  icon,
  title,
  subtitle,
  trailingValue,
  onPress,
  hasSwitch,
  switchValue,
  onSwitchChange,
  destructive,
  theme,
  isDark,
}) => {
  const { i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const iconColor = destructive
    ? theme.colors.error
    : (isDark ? 'rgba(255,255,255,0.85)' : '#3C3C43');

  const iconBg = destructive
    ? (isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)')
    : (isDark ? 'rgba(255,255,255,0.06)' : '#F2F2F7');

  return (
    <TouchableOpacity
      onPress={hasSwitch ? () => onSwitchChange?.(!switchValue) : onPress}
      activeOpacity={hasSwitch ? 0.8 : 0.65}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        paddingVertical: 11,
        paddingHorizontal: 16,
        minHeight: 50,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: iconBg,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: isRTL ? 0 : 12,
          marginLeft: isRTL ? 12 : 0,
        }}
      >
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          allowFontScaling={false}
          style={{
            fontSize: 15,
            fontWeight: '500',
            color: destructive ? theme.colors.error : theme.colors.text,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 12,
              color: isDark ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.45)',
              marginTop: 1,
              textAlign: isRTL ? 'right' : 'left',
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {hasSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: isDark ? '#3A3A3C' : '#E5E5EA', true: '#A61920' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={isDark ? '#3A3A3C' : '#E5E5EA'}
        />
      ) : (
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
          {trailingValue && (
            <Text
              allowFontScaling={false}
              style={{
                fontSize: 14,
                color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
                marginRight: isRTL ? 0 : 6,
                marginLeft: isRTL ? 6 : 0,
              }}
            >
              {trailingValue}
            </Text>
          )}
          <Ionicons
            name={isRTL ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)'}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

export default ProfileScreen;
