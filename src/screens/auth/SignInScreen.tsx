/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  I18nManager,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import {
  signInWithGoogle,
  isGoogleSignInAvailable,
} from '../../services/auth';
import { PhoneAuthService } from '../../services/phoneAuthService';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { CredentialStorage } from '../../services/credentialStorage';
import { useUserRegion } from '../../hooks/useUserRegion';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type LoginMethod = 'phone' | 'email';

const CRIMSON = '#A61920';

/**
 * Clean, premium Sign-In experience for Khamark.
 *
 * Designed with a white-first aesthetic, crisp Khamark Global branding,
 * seamless Phone/Email switching, restrained input focus styling,
 * and reliable authentication flow preservation.
 */
const SignInScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { signInWithApple, isAppleAvailable } = useAuth();
  const { theme, isDark } = useTheme();
  const userRegion = useUserRegion();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const isRequiredAuth = route.params?.requireAuth;

  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  // Input refs for mount-only prefill check
  const phoneRef = useRef(phone);
  const emailRef = useRef(email);
  useEffect(() => { phoneRef.current = phone; }, [phone]);
  useEffect(() => { emailRef.current = email; }, [email]);

  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(userRegion);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Modal States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [formattedPhoneRef, setFormattedPhoneRef] = useState('');

  // Sync selectedCountry when userRegion loads
  useEffect(() => {
    setSelectedCountry(userRegion);
  }, [userRegion]);

  // Load saved credentials on mount
  useEffect(() => {
    let cancelled = false;
    const loadSaved = async () => {
      try {
        const credentials = await CredentialStorage.getCredentials();
        if (cancelled) return;
        if (phoneRef.current || emailRef.current) return;
        if (credentials) {
          if (credentials.email.includes('@')) {
            setLoginMethod('email');
            setEmail(credentials.email);
          } else {
            setLoginMethod('phone');
            let savedPhone = credentials.email;
            if (savedPhone.startsWith('+')) {
              savedPhone = savedPhone.replace(/^\+\d{1,3}/, '');
            }
            setPhone(savedPhone);
          }
          setRememberMe(true);
        }
      } catch (e) {
        // ignore
      }
    };
    loadSaved();
    return () => { cancelled = true; };
  }, []);

  // Secret admin access (5 quick taps on brand logo)
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleTitleTap = () => {
    if (logoTapTimeout.current) clearTimeout(logoTapTimeout.current);
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    logoTapTimeout.current = setTimeout(() => setLogoTapCount(0), 2000);
    if (newCount >= 5) {
      setLogoTapCount(0);
      if (logoTapTimeout.current) clearTimeout(logoTapTimeout.current);
      Alert.alert(
        t('auth.createAccountTitle', { defaultValue: 'Create account' }),
        t('auth.createAccountMsg', { defaultValue: 'Which type of account do you want to create?' }),
        [
          { text: t('auth.createAdmin', { defaultValue: 'Admin — full store' }), onPress: () => navigation.navigate('AdminSignup' as any) },
          { text: t('auth.createPartner', { defaultValue: 'Partner — view only' }), onPress: () => navigation.navigate('PartnerSignup' as any) },
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        ],
      );
    }
  };

  const handleSuccessfulLogin = useCallback(() => {
    const returnReason = route.params?.returnReason;
    if (isRequiredAuth && returnReason) {
      if (returnReason === 'checkout') {
        navigation.reset({
          index: 1,
          routes: [{ name: 'Main' as any }, { name: 'Checkout' as any }],
        });
      } else if (returnReason === 'orders') {
        navigation.reset({
          index: 1,
          routes: [{ name: 'Main' as any, params: { screen: 'Profile' } }],
        });
      } else {
        navigation.goBack();
      }
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
    }
  }, [navigation, isRequiredAuth, route.params?.returnReason]);

  const handleContinue = async () => {
    setErrorMessage('');

    if (loginMethod === 'phone') {
      if (!phone.trim()) {
        setErrorMessage(t('auth.enterPhone', { defaultValue: 'Please enter your phone number' }));
        return;
      }

      try {
        setLoading(true);
        const countryInfo = getCountryInfo(selectedCountry);
        let cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
        const dialDigits = countryInfo.dialCode.replace(/\D/g, '');
        if (cleanPhone.startsWith(dialDigits) && cleanPhone.length > dialDigits.length + 5) {
          cleanPhone = cleanPhone.slice(dialDigits.length);
        }
        const formattedPhone = `${countryInfo.dialCode}${cleanPhone}`;

        const existingUid = await PhoneAuthService.checkPhoneExists(formattedPhone);

        if (existingUid) {
          setFormattedPhoneRef(formattedPhone);
          setShowLoginModal(true);
        } else {
          setFormattedPhoneRef(formattedPhone);
          setShowCreateAccountModal(true);
        }
      } catch (error: any) {
        setErrorMessage(error.message || t('errors.unknown'));
      } finally {
        setLoading(false);
      }
    } else {
      if (!email.trim()) {
        setErrorMessage(t('auth.enterEmail', { defaultValue: 'Please enter your email' }));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage(t('auth.invalidEmail', { defaultValue: 'Please enter a valid email address' }));
        return;
      }

      try {
        setLoading(true);
        navigation.navigate('Password' as any, {
          method: 'email',
          identifier: email.trim(),
          returnReason: route.params?.returnReason,
          requireAuth: isRequiredAuth,
          rememberMe: rememberMe,
        });
      } catch (error: any) {
        setErrorMessage(error.message || t('errors.unknown'));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCreateAccount = () => {
    if (loginMethod === 'phone') {
      navigation.navigate('Register' as any);
    } else {
      navigation.navigate('Register' as any, { method: 'email', email: email.trim() });
    }
  };

  // Re-entry guard for social providers
  const socialSignInRef = useRef(false);

  const handleGoogleSignIn = async () => {
    if (socialSignInRef.current) return;
    socialSignInRef.current = true;
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      handleSuccessfulLogin();
    } catch (error: any) {
      if (error.message !== 'Sign in was cancelled') {
        console.error('Google sign-in error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        Alert.alert(t('auth.error'), error.message ? error.message : t('errors.unknown'));
      }
    } finally {
      setGoogleLoading(false);
      socialSignInRef.current = false;
    }
  };

  const handleAppleSignIn = async () => {
    if (socialSignInRef.current) return;
    socialSignInRef.current = true;
    try {
      setAppleLoading(true);
      await signInWithApple();
      handleSuccessfulLogin();
    } catch (error: any) {
      if (error.message !== 'Sign in was cancelled') {
        Alert.alert(t('auth.error'), error.message || 'Apple sign-in failed');
      }
    } finally {
      setAppleLoading(false);
      socialSignInRef.current = false;
    }
  };

  const handleContinueAsGuest = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
  };

  const anySocialLoading = googleLoading || appleLoading;
  const isDisabled = loading || anySocialLoading;

  const styles = useMemo(
    () => createStyles(colors, isRTL, isDark),
    [colors, isRTL, isDark]
  );

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 16) + 8,
              paddingBottom: Math.max(insets.bottom, 16) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentConstrained}>
            {/* ── Top Bar (Back button if available) ── */}
            <View style={styles.topBar}>
              {navigation.canGoBack() ? (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => navigation.goBack()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isRTL ? 'arrow-forward' : 'arrow-back'}
                    size={22}
                    color={colors.text}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.backPlaceholder} />
              )}
            </View>

            {/* ── Brand Logo Header ── */}
            <View style={styles.headerSection}>
              <TouchableOpacity
                onPress={handleTitleTap}
                activeOpacity={0.9}
                accessible={false}
                style={styles.logoTouchable}
              >
                <Image
                  source={
                    isDark
                      ? require('../../../assets/images/khamark_logo_white.png')
                      : require('../../../assets/images/khamark_logo_crimson.png')
                  }
                  style={styles.brandLogo}
                  contentFit="contain"
                  priority="high"
                />
              </TouchableOpacity>

              <AppText style={styles.mainHeading}>
                {t('auth.welcomeBackHeading', { defaultValue: 'Welcome back' })}
              </AppText>
              <AppText style={styles.subHeading}>
                {t('auth.signInSubtitle', { defaultValue: 'Sign in with your phone or email' })}
              </AppText>
            </View>

            {/* ── Main Form Area ── */}
            <View style={styles.formSection}>
              {/* Segmented Control */}
              <View style={styles.segmentTrack}>
                <TouchableOpacity
                  style={[
                    styles.segmentTab,
                    loginMethod === 'phone' && styles.segmentTabActive,
                  ]}
                  onPress={() => {
                    setLoginMethod('phone');
                    setErrorMessage('');
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: loginMethod === 'phone' }}
                >
                  <Ionicons
                    name="call-outline"
                    size={16}
                    color={loginMethod === 'phone' ? '#FFFFFF' : colors.textSecondary}
                    style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                  />
                  <AppText
                    style={[
                      styles.segmentText,
                      loginMethod === 'phone'
                        ? styles.segmentTextActive
                        : { color: colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {t('auth.phone', { defaultValue: 'Phone Number' })}
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.segmentTab,
                    loginMethod === 'email' && styles.segmentTabActive,
                  ]}
                  onPress={() => {
                    setLoginMethod('email');
                    setErrorMessage('');
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: loginMethod === 'email' }}
                >
                  <Ionicons
                    name="mail-outline"
                    size={16}
                    color={loginMethod === 'email' ? '#FFFFFF' : colors.textSecondary}
                    style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                  />
                  <AppText
                    style={[
                      styles.segmentText,
                      loginMethod === 'email'
                        ? styles.segmentTextActive
                        : { color: colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {t('auth.email', { defaultValue: 'Email Address' })}
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Input Field Area */}
              {loginMethod === 'phone' ? (
                <View style={styles.fieldBlock}>
                  <AppText style={[styles.fieldLabel, { textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('auth.phoneNumber', { defaultValue: 'Phone number' })}
                  </AppText>
                  <View
                    style={[
                      styles.inputContainer,
                      phoneFocused && styles.inputContainerFocused,
                      !!errorMessage && styles.inputContainerError,
                    ]}
                  >
                    <PhoneInput
                      value={phone}
                      onChangeText={(text: string) => {
                        setPhone(text);
                        setErrorMessage('');
                      }}
                      onCountryChange={(country: any) => setSelectedCountry(country.code)}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      defaultCountry={userRegion}
                      style={{ backgroundColor: 'transparent', borderWidth: 0, height: 52 }}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.fieldBlock}>
                  <AppText style={[styles.fieldLabel, { textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('auth.emailAddress', { defaultValue: 'Email address' })}
                  </AppText>
                  <View
                    style={[
                      styles.inputContainer,
                      emailFocused && styles.inputContainerFocused,
                      !!errorMessage && styles.inputContainerError,
                      styles.emailInputRow,
                    ]}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={emailFocused ? CRIMSON : colors.placeholder}
                      style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }}
                    />
                    <TextInput
                      style={[
                        styles.emailTextInput,
                        {
                          color: colors.text,
                          textAlign: isRTL ? 'right' : 'left',
                        },
                      ]}
                      placeholder="name@example.com"
                      placeholderTextColor={colors.placeholder}
                      value={email}
                      onChangeText={(text: string) => {
                        setEmail(text);
                        setErrorMessage('');
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="emailAddress"
                      autoComplete="email"
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      returnKeyType="done"
                      onSubmitEditing={handleContinue}
                      allowFontScaling={true}
                    />
                  </View>
                </View>
              )}

              {/* Validation Error Message */}
              {!!errorMessage && (
                <View style={styles.errorRow}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={colors.error || '#DC2626'}
                    style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                  />
                  <AppText style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>
                    {errorMessage}
                  </AppText>
                </View>
              )}

              {/* Remember Me Option */}
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                accessibilityLabel={t('auth.rememberMe', { defaultValue: 'Remember me' })}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && (
                    <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                  )}
                </View>
                <AppText style={styles.rememberLabel}>
                  {t('auth.rememberMe', { defaultValue: 'Remember me' })}
                </AppText>
              </TouchableOpacity>

              {/* Primary Action Button */}
              <TouchableOpacity
                style={[styles.primaryButton, isDisabled && styles.primaryButtonDisabled]}
                onPress={handleContinue}
                disabled={isDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <AppText style={styles.primaryButtonText}>
                    {t('auth.continue', { defaultValue: 'Continue' })}
                  </AppText>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <AppText style={styles.dividerText}>
                  {t('auth.orContinueWith', { defaultValue: 'Or continue with' })}
                </AppText>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Login Buttons */}
              <View style={styles.socialColumn}>
                {isGoogleSignInAvailable() && (
                  <TouchableOpacity
                    style={styles.socialButton}
                    onPress={handleGoogleSignIn}
                    disabled={isDisabled}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    {googleLoading ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <View style={styles.socialInner}>
                        <Image
                          source={require('../../../assets/icons/google.png')}
                          style={[
                            styles.socialIcon,
                            { marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 },
                          ]}
                          contentFit="contain"
                        />
                        <AppText style={styles.socialButtonText}>
                          {t('auth.signInWithGoogle', { defaultValue: 'Continue with Google' })}
                        </AppText>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {Platform.OS === 'ios' && isAppleAvailable && (
                  <TouchableOpacity
                    style={[styles.socialButton, isDark ? null : styles.appleButtonLight]}
                    onPress={handleAppleSignIn}
                    disabled={isDisabled}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    {appleLoading ? (
                      <ActivityIndicator color={colors.text} size="small" />
                    ) : (
                      <View style={styles.socialInner}>
                        <Ionicons
                          name="logo-apple"
                          size={19}
                          color={isDark ? '#FFFFFF' : '#000000'}
                          style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }}
                        />
                        <AppText
                          style={[
                            styles.socialButtonText,
                            isDark ? null : styles.appleButtonTextLight,
                          ]}
                        >
                          {t('auth.signInWithApple', { defaultValue: 'Continue with Apple' })}
                        </AppText>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Footer: Create Account */}
              <View style={styles.footerRow}>
                <AppText style={styles.footerText}>
                  {t('auth.noAccount', { defaultValue: "Don't have an account?" })}{' '}
                </AppText>
                <TouchableOpacity
                  onPress={handleCreateAccount}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <AppText style={styles.footerLink}>
                    {t('auth.createAccount', { defaultValue: 'Create account' })}
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Guest Checkout / Exploration Link */}
              {!isRequiredAuth && (
                <TouchableOpacity
                  style={styles.guestButton}
                  onPress={handleContinueAsGuest}
                  activeOpacity={0.6}
                >
                  <AppText style={styles.guestText}>
                    {t('auth.continueAsGuest', { defaultValue: 'Continue as Guest' })}
                  </AppText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Login Method Selection Modal (Phone Exists) ── */}
      <Modal
        visible={showLoginModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <BlurView intensity={24} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="lock-closed" size={24} color={CRIMSON} />
              </View>
              <AppText style={styles.modalTitle}>
                {t('auth.loginMethod', { defaultValue: 'Welcome Back' })}
              </AppText>
              <AppText style={styles.modalDescription}>
                {t('auth.loginMethodSubtitle', {
                  defaultValue: 'How would you like to sign in to your account?',
                })}
              </AppText>

              <TouchableOpacity
                style={styles.modalPrimaryAction}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('Password' as any, {
                    method: 'phone',
                    identifier: formattedPhoneRef,
                    returnReason: route.params?.returnReason,
                    requireAuth: isRequiredAuth,
                    rememberMe: rememberMe,
                  });
                }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="key-outline"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <AppText style={styles.modalPrimaryActionText}>
                  {t('auth.withPassword', { defaultValue: 'Continue with Password' })}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSecondaryAction}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('VerifyPhone' as any, {
                    mode: 'fallback',
                    phone: formattedPhoneRef,
                  });
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={colors.text}
                  style={{ marginRight: 8 }}
                />
                <AppText style={styles.modalSecondaryActionText}>
                  {t('auth.withOTP', { defaultValue: 'Send OTP Code' })}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelAction}
                onPress={() => setShowLoginModal(false)}
                activeOpacity={0.7}
              >
                <AppText style={styles.modalCancelActionText}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>

      {/* ── Account Not Found Modal (Phone New) ── */}
      <Modal
        visible={showCreateAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateAccountModal(false)}
      >
        <BlurView intensity={24} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="person-add" size={24} color={CRIMSON} />
              </View>
              <AppText style={styles.modalTitle}>
                {t('auth.accountNotFound', { defaultValue: 'Account Not Found' })}
              </AppText>
              <AppText style={styles.modalDescription}>
                {t('auth.accountNotFoundSubtitle', {
                  defaultValue:
                    'There is no account registered with this phone number. Would you like to create a new account?',
                })}
              </AppText>

              <TouchableOpacity
                style={styles.modalPrimaryAction}
                onPress={() => {
                  setShowCreateAccountModal(false);
                  navigation.navigate('Register' as any, {
                    method: 'phone',
                    phone: formattedPhoneRef,
                  });
                }}
                activeOpacity={0.85}
              >
                <AppText style={styles.modalPrimaryActionText}>
                  {t('auth.createAccount', { defaultValue: 'Create New Account' })}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelAction}
                onPress={() => setShowCreateAccountModal(false)}
                activeOpacity={0.7}
              >
                <AppText style={styles.modalCancelActionText}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 22,
    },
    contentConstrained: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
    },

    // ── Top Navigation Bar ──
    topBar: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 40,
      marginBottom: 8,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    backPlaceholder: {
      width: 40,
      height: 40,
    },

    // ── Header & Logo ──
    headerSection: {
      alignItems: 'center',
      marginBottom: 28,
    },
    logoTouchable: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    brandLogo: {
      width: 176,
      height: 78,
    },
    mainHeading: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    subHeading: {
      fontSize: 14.5,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },

    // ── Form Section ──
    formSection: {
      width: '100%',
    },

    // ── Segmented Control ──
    segmentTrack: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F2F2F4',
      borderRadius: 10,
      padding: 3.5,
      marginBottom: 20,
      height: 44,
    },
    segmentTab: {
      flex: 1,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      paddingHorizontal: 8,
    },
    segmentTabActive: {
      backgroundColor: CRIMSON,
    },
    segmentText: {
      fontSize: 13.5,
      fontWeight: '600',
    },
    segmentTextActive: {
      color: '#FFFFFF',
      fontWeight: '600',
    },

    // ── Fields ──
    fieldBlock: {
      marginBottom: 12,
    },
    fieldLabel: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 7,
    },
    inputContainer: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9F9FA',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E5EA',
      borderRadius: 12,
      minHeight: 52,
      justifyContent: 'center',
    },
    inputContainerFocused: {
      borderColor: CRIMSON,
      borderWidth: 1.5,
    },
    inputContainerError: {
      borderColor: colors.error || '#DC2626',
    },
    emailInputRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      height: 52,
    },
    emailTextInput: {
      flex: 1,
      fontSize: 15.5,
      height: '100%',
      paddingVertical: 0,
    },

    // ── Errors ──
    errorRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      marginTop: 2,
      marginBottom: 10,
    },
    errorText: {
      color: colors.error || '#DC2626',
      fontSize: 13,
      fontWeight: '500',
      flex: 1,
    },

    // ── Remember Me ──
    rememberRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      marginVertical: 12,
      paddingVertical: 4,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.25)' : '#C7C7CC',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: isRTL ? 0 : 10,
      marginLeft: isRTL ? 10 : 0,
    },
    checkboxChecked: {
      backgroundColor: CRIMSON,
      borderColor: CRIMSON,
    },
    rememberLabel: {
      fontSize: 13.5,
      fontWeight: '500',
      color: colors.textSecondary,
    },

    // ── Primary Button ──
    primaryButton: {
      backgroundColor: CRIMSON,
      height: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    primaryButtonDisabled: {
      opacity: 0.55,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },

    // ── Divider ──
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 22,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E5EA',
    },
    dividerText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      paddingHorizontal: 12,
    },

    // ── Social Buttons ──
    socialColumn: {
      gap: 10,
    },
    socialButton: {
      height: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E5EA',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    socialInner: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    socialIcon: {
      width: 19,
      height: 19,
    },
    socialButtonText: {
      fontSize: 14.5,
      fontWeight: '600',
      color: colors.text,
    },
    appleButtonLight: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E5EA',
    },
    appleButtonTextLight: {
      color: '#000000',
    },

    // ── Footer ──
    footerRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 18,
      paddingVertical: 4,
    },
    footerText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    footerLink: {
      fontSize: 14,
      fontWeight: '700',
      color: CRIMSON,
    },
    guestButton: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
      paddingVertical: 8,
    },
    guestText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },

    // ── Modals ──
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.card || (isDark ? '#1C1C1E' : '#FFFFFF'),
      borderRadius: 18,
      padding: 24,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
    },
    modalIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? 'rgba(166,25,32,0.18)' : 'rgba(166,25,32,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    modalDescription: {
      fontSize: 14.5,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 20,
      textAlign: 'center',
    },
    modalPrimaryAction: {
      width: '100%',
      height: 48,
      backgroundColor: CRIMSON,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    modalPrimaryActionText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    modalSecondaryAction: {
      width: '100%',
      height: 48,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F2F2F4',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E5EA',
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    modalSecondaryActionText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    modalCancelAction: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    modalCancelActionText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
  });

export default SignInScreen;
