/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Dimensions,
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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
  SlideInLeft,
  interpolateColor,
} from 'react-native-reanimated';
import {
  signInWithGoogle,
  isGoogleSignInAvailable,
  signInWithFacebook,
  isFacebookSignInAvailable,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Static Design Tokens (theme colours come from useTheme) ─────────────
const LUX = {
  gold: 'rgba(255,255,255,0.55)',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 16, button: 16, segment: 14, segmentPill: 11, card: 26, social: 14, coin: 30 };

// ─── Floating Particle Component ─────────────────────────
const FloatingParticle = ({
  delay,
  x,
  size,
  duration,
  color = LUX.gold,
}: { delay: number; x: number; size: number; duration: number; color?: string }) => {
  const translateY = useSharedValue(SCREEN_HEIGHT + 20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-50, { duration, easing: Easing.linear }),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: duration * 0.3 }),
          withTiming(0.6, { duration: duration * 0.4 }),
          withTiming(0, { duration: duration * 0.3 })
        ),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

// ─── Animated Input Wrapper (premium focus glow, theme-aware) ─────────
const AnimatedInputWrapper = ({
  children,
  isFocused,
  colors,
  fill,
}: { children: React.ReactNode; isFocused: boolean; colors: any; fill: string }) => {
  const focusProgress = useSharedValue(0);
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    focusProgress.value = withSpring(isFocused ? 1 : 0, { damping: 15, stiffness: 120 });
    glowScale.value = withSpring(isFocused ? 1.02 : 1, { damping: 12, stiffness: 100 });
    glowOpacity.value = withTiming(isFocused ? 1 : 0, { duration: 300 });
  }, [isFocused]);

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));

  const glowBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focusProgress.value, [0, 1], [colors.border, colors.primary]),
    borderWidth: 1.5,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: focusProgress.value * 0.35,
    shadowRadius: focusProgress.value * 12,
  }));

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View style={wrapperStyle}>
      <Animated.View style={[{ borderRadius: RADIUS.input, overflow: 'hidden', backgroundColor: fill }, glowBorderStyle]}>
        {/* Amber glow bar at top */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: '15%',
              right: '15%',
              height: 2,
              backgroundColor: colors.primary,
              borderRadius: 1,
              zIndex: 10,
            },
            topGlowStyle,
          ]}
        />
        {children}
      </Animated.View>
    </Animated.View>
  );
};

// ─── Email Input with Focus Animation ────────────────────
const EmailInput = ({ email, setEmail, setErrorMessage, t, colors, isRTL, inputBg }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <AppText
        style={{
          color: colors.textSecondary,
          fontSize: 12.5,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginBottom: SPACING.xs,
          textAlign: isRTL ? 'right' : 'left',
          textTransform: 'uppercase',
        }}
      >
        {t('auth.emailAddress', { defaultValue: 'Email Address' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused} colors={colors} fill={inputBg}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: isRTL ? 'row-reverse' : 'row',
            height: 58,
            paddingHorizontal: SPACING.md,
          }}
        >
          <Ionicons
            name="mail-outline"
            size={20}
            color={isFocused ? colors.primary : colors.placeholder}
            style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }}
          />
          <TextInput
            allowFontScaling={false}
            style={{
              color: colors.text,
              flex: 1,
              fontSize: 16,
              height: 40,
              includeFontPadding: false,
              paddingVertical: 0,
              textAlign: isRTL ? 'right' : 'left',
              textAlignVertical: 'center',
            }}
            placeholder="example@gmail.com"
            placeholderTextColor={colors.placeholder}
            value={email}
            onChangeText={(text: string) => { setEmail(text); setErrorMessage(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        </View>
      </AnimatedInputWrapper>
    </View>
  );
};

// ─── Phone Input with Focus Animation ────────────────────
const PhoneInputAnimated = ({ phone, setPhone, setErrorMessage, setSelectedCountry, defaultCountry, t, colors, isRTL, inputBg }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <AppText
        style={{
          color: colors.textSecondary,
          fontSize: 12.5,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginBottom: SPACING.xs,
          textAlign: isRTL ? 'right' : 'left',
          textTransform: 'uppercase' as const,
        }}
      >
        {t('auth.phoneNumber', { defaultValue: 'Phone Number' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused} colors={colors} fill={inputBg}>
        <PhoneInput
          value={phone}
          onChangeText={(text: string) => { setPhone(text); setErrorMessage(''); }}
          onCountryChange={(country: any) => setSelectedCountry(country.code)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          defaultCountry={defaultCountry}
          style={{ backgroundColor: 'transparent', borderWidth: 0, height: 58 }}
        />
      </AnimatedInputWrapper>
    </View>
  );
};

/**
 * Sign In Screen — Premium Amber Retail
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
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F4';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

  const isRequiredAuth = route.params?.requireAuth;

  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(userRegion);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Modal States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [formattedPhoneRef, setFormattedPhoneRef] = useState('');

  // Sync selectedCountry when userRegion loads from AsyncStorage
  useEffect(() => {
    setSelectedCountry(userRegion);
  }, [userRegion]);

  // Load saved Remember Me preference on mount
  React.useEffect(() => {
    const loadSaved = async () => {
      try {
        const credentials = await CredentialStorage.getCredentials();
        if (credentials) {
          if (credentials.email.includes('@')) {
            setLoginMethod('email');
            setEmail(credentials.email);
          } else {
            setLoginMethod('phone');

            // Fix: remove country code from the saved phone if it starts with one,
            // otherwise the input will duplicate it when logging in next time.
            let savedPhone = credentials.email;
            if (savedPhone.startsWith('+')) {
              // try to strip dial codes (e.g. +964 or +1)
              // this is a generic fix, you might want to use a phone library if needed
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
  }, []);

  // Secret admin access
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleSuccessfulLogin = () => {
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
        navigation.goBack();
      }
    } else {
      navigation.goBack();
    }
  };

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
        // Safety: if the phone input somehow contains the dial code again, strip it
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
        setErrorMessage(error.message || 'Something went wrong');
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
        setErrorMessage(error.message || 'Something went wrong');
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

    // One ref shared by every social provider. The buttons gate on state that
  // commits a render late, so two taps both run; the native SDK rejects the
  // second with IN_PROGRESS, whose message is surfaced as an alert over the
  // account picker — and the loser's finally clears the loading flag while the
  // first attempt is still open, re-enabling every button mid-flight.
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
        const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        Alert.alert(t('auth.error'), error.message ? error.message : `Raw Error: ${errorDetails}`);
      }
    } finally {
      setGoogleLoading(false);
      socialSignInRef.current = false;
    }
  };

  const handleFacebookSignIn = async () => {
    if (socialSignInRef.current) return;
    socialSignInRef.current = true;
    try {
      setFacebookLoading(true);
      await signInWithFacebook();
      handleSuccessfulLogin();
    } catch (error: any) {
      if (error.message !== 'User cancelled the login process') {
        Alert.alert(t('auth.error'), error.message || 'Facebook sign-in failed');
      }
    } finally {
      setFacebookLoading(false);
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

  const handleTitleTap = () => {
    if (logoTapTimeout.current) clearTimeout(logoTapTimeout.current);
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    logoTapTimeout.current = setTimeout(() => setLogoTapCount(0), 2000);
    if (newCount >= 5) {
      setLogoTapCount(0);
      if (logoTapTimeout.current) clearTimeout(logoTapTimeout.current);
      // 5 taps → choose which kind of account to create.
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

  const handleContinueAsGuest = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
  };

  const anySocialLoading = googleLoading || facebookLoading || appleLoading;
  const isDisabled = loading || anySocialLoading;

  // Particle data
  const particles = [
    { delay: 0, x: SCREEN_WIDTH * 0.1, size: 3, duration: 8000 },
    { delay: 1500, x: SCREEN_WIDTH * 0.25, size: 2, duration: 10000 },
    { delay: 3000, x: SCREEN_WIDTH * 0.45, size: 4, duration: 7000 },
    { delay: 500, x: SCREEN_WIDTH * 0.6, size: 2, duration: 9000 },
    { delay: 2000, x: SCREEN_WIDTH * 0.78, size: 3, duration: 11000 },
    { delay: 4000, x: SCREEN_WIDTH * 0.9, size: 2, duration: 8500 },
    { delay: 1000, x: SCREEN_WIDTH * 0.35, size: 2, duration: 12000 },
    { delay: 3500, x: SCREEN_WIDTH * 0.55, size: 3, duration: 9500 },
  ];

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Amber Hero Band ── */}
          <LinearGradient
            colors={[colors.primaryVariant, colors.primary, colors.primaryDark]}
            style={[styles.hero, { paddingTop: insets.top + SPACING.lg }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Floating sparkles (clipped to hero) */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {particles.map((p, i) => (
                <FloatingParticle key={i} {...p} color="rgba(255,255,255,0.55)" />
              ))}
            </View>

            {/* Logo coin */}
            <Animated.View
              entering={ZoomIn.duration(800).springify().damping(12)}
              style={styles.logoArea}
            >
              <TouchableOpacity
                onPress={handleTitleTap}
                activeOpacity={1}
                accessible={false}
                style={styles.logoTouchable}
              >
                <View style={styles.logoCircle}>
                  <Image
                    source={require('../../../assets/images/asankarylogo.png')}
                    style={styles.logoImage}
                    contentFit="contain"
                  />
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Title */}
            <Animated.Text
              allowFontScaling={false}
              entering={SlideInLeft.duration(600).delay(300)}
              style={styles.title}
            >
              {t('auth.signIn', { defaultValue: 'Sign in' })}
            </Animated.Text>
            <Animated.Text
              allowFontScaling={false}
              entering={FadeIn.duration(600).delay(500)}
              style={styles.subtitle}
            >
              {t('auth.signInSubtitle', { defaultValue: 'Continue with your phone or email.' })}
            </Animated.Text>
          </LinearGradient>

          {/* ── Form Card (overlaps hero) ── */}
          <Animated.View
            entering={FadeInUp.duration(700).delay(400).springify().damping(14)}
            style={styles.glassCard}
          >
            {/* Segmented Control */}
            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[styles.segmentButton, loginMethod === 'phone' && styles.segmentButtonActive]}
                onPress={() => { setLoginMethod('phone'); setErrorMessage(''); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="call-outline"
                  size={16}
                  color={loginMethod === 'phone' ? colors.textOnPrimary : colors.textSecondary}
                  style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                />
                <AppText style={[styles.segmentText, loginMethod === 'phone' && styles.segmentTextActive]}>
                  {t('auth.phone', { defaultValue: 'Phone Number' })}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, loginMethod === 'email' && styles.segmentButtonActive]}
                onPress={() => { setLoginMethod('email'); setErrorMessage(''); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={loginMethod === 'email' ? colors.textOnPrimary : colors.textSecondary}
                  style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                />
                <AppText style={[styles.segmentText, loginMethod === 'email' && styles.segmentTextActive]}>
                  {t('auth.email', { defaultValue: 'Email Address' })}
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Input with focus animations */}
            {loginMethod === 'phone' ? (
              <PhoneInputAnimated
                phone={phone}
                setPhone={setPhone}
                setErrorMessage={setErrorMessage}
                setSelectedCountry={setSelectedCountry}
                defaultCountry={userRegion}
                t={t}
                colors={colors}
                isRTL={isRTL}
                inputBg={inputBg}
              />
            ) : (
              <EmailInput
                email={email}
                setEmail={setEmail}
                setErrorMessage={setErrorMessage}
                t={t}
                colors={colors}
                isRTL={isRTL}
                inputBg={inputBg}
              />
            )}

            {/* Error */}
            {!!errorMessage && (
              <AppText style={styles.errorText}>{errorMessage}</AppText>
            )}

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && (
                  <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
                )}
              </View>
              <AppText style={styles.rememberText}>
                {t('auth.rememberMe', { defaultValue: 'Remember me' })}
              </AppText>
            </TouchableOpacity>

            {/* Continue Button */}
            <TouchableOpacity
              style={[styles.primaryButton, isDisabled && styles.primaryButtonDisabled]}
              onPress={handleContinue}
              disabled={isDisabled}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.primaryButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <AppText style={styles.primaryButtonText}>
                    {t('auth.continue', { defaultValue: 'Continue' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Create Account Link ── */}
          <Animated.View entering={FadeIn.duration(500).delay(800)}>
            <TouchableOpacity
              onPress={handleCreateAccount}
              style={styles.quietLinkRow}
              activeOpacity={0.6}
            >
              <AppText style={styles.quietText}>
                {t('auth.noAccount', { defaultValue: "Don't have an account?" })}{' '}
              </AppText>
              <AppText style={styles.quietLink}>
                {t('auth.createAccount', { defaultValue: 'Create account' })}
              </AppText>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Divider ── */}
          <Animated.View entering={FadeIn.duration(400).delay(900)} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <AppText style={styles.dividerText}>
              {t('common.or', { defaultValue: 'or' })}
            </AppText>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* ── Social Login ── */}
          <Animated.View entering={FadeInDown.duration(600).delay(1000)} style={styles.socialColumn}>
            {isGoogleSignInAvailable() && (
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleGoogleSignIn}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {googleLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <View style={styles.socialInner}>
                    <Ionicons name="logo-google" size={20} color="#EA4335" style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }} />
                    <AppText style={styles.socialButtonText}>
                      {t('auth.signInWithGoogle', { defaultValue: 'Continue with Google' })}
                    </AppText>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {false && isFacebookSignInAvailable() && (
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleFacebookSignIn}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {facebookLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <View style={styles.socialInner}>
                    <Ionicons name="logo-facebook" size={20} color="#1877F2" style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }} />
                    <AppText style={styles.socialButtonText}>
                      {t('auth.signInWithFacebook', { defaultValue: 'Continue with Facebook' })}
                    </AppText>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {Platform.OS === 'ios' && isAppleAvailable && (
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleAppleSignIn}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {appleLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <View style={styles.socialInner}>
                    <Ionicons name="logo-apple" size={20} color={colors.text} style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }} />
                    <AppText style={styles.socialButtonText}>
                      {t('auth.signInWithApple', { defaultValue: 'Continue with Apple' })}
                    </AppText>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* ── Continue as Guest ── */}
          {!isRequiredAuth && (
            <Animated.View entering={FadeIn.duration(400).delay(1200)}>
              <TouchableOpacity
                style={styles.guestButton}
                onPress={handleContinueAsGuest}
                activeOpacity={0.6}
              >
                <AppText style={styles.guestText}>
                  {t('auth.continueAsGuest', { defaultValue: 'Continue as Guest' })}
                </AppText>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Login Method Modal ── */}
      <Modal
        visible={showLoginModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
          <View style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInDown.duration(400).springify().damping(15)}
              style={styles.modalContent}
            >
              <AppText style={styles.modalTitle}>
                {t('auth.loginMethod', { defaultValue: 'Welcome Back' })}
              </AppText>
              <AppText style={styles.modalDescription}>
                {t('auth.loginMethodSubtitle', { defaultValue: 'How would you like to sign in to your account?' })}
              </AppText>

              <TouchableOpacity
                style={styles.modalButtonPrimary}
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
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.modalButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textOnPrimary} style={{ marginRight: 8 }} />
                  <AppText style={styles.modalButtonText}>
                    {t('auth.withPassword', { defaultValue: 'Continue with Password' })}
                  </AppText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('VerifyPhone' as any, {
                    mode: 'fallback',
                    phone: formattedPhoneRef,
                  });
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} style={{ marginRight: 8 }} />
                <AppText style={styles.modalButtonSecondaryText}>
                  {t('auth.withOTP', { defaultValue: 'Send OTP Code' })}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowLoginModal(false)}
                activeOpacity={0.7}
              >
                <AppText style={styles.modalButtonCancelText}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </AppText>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </BlurView>
      </Modal>

      {/* ── Account Not Found Modal ── */}
      <Modal
        visible={showCreateAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateAccountModal(false)}
      >
        <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
          <View style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInDown.duration(400).springify().damping(15)}
              style={styles.modalContent}
            >
              <View style={styles.modalIconCircle}>
                <Ionicons name="person-add-outline" size={28} color={colors.primary} />
              </View>
              <AppText style={styles.modalTitle}>
                {t('auth.accountNotFound', { defaultValue: 'Account Not Found' })}
              </AppText>
              <AppText style={styles.modalDescription}>
                {t('auth.accountNotFoundSubtitle', { defaultValue: 'There is no account registered with this phone number. Would you like to create a new account?' })}
              </AppText>

              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={() => {
                  setShowCreateAccountModal(false);
                  navigation.navigate('Register' as any, { method: 'phone', phone: formattedPhoneRef });
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.modalButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <AppText style={styles.modalButtonText}>
                    {t('auth.createAccount', { defaultValue: 'Create New Account' })}
                  </AppText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowCreateAccountModal(false)}
                activeOpacity={0.7}
              >
                <AppText style={styles.modalButtonCancelText}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </AppText>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </BlurView>
      </Modal>

    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
    paddingBottom: SPACING.xl + SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },

  // ── Logo ──
  logoArea: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  logoTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.coin + 18,
    elevation: 8,
    height: 96,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 96,
  },
  logoImage: {
    height: 56,
    width: 56,
  },

  // ── Typography ──
  title: {
    color: colors.textOnPrimary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textOnPrimary,
    fontSize: 14.5,
    lineHeight: 21,
    opacity: 0.85,
    textAlign: 'center',
  },

  // ── Form Card (overlaps hero) ──
  glassCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 10,
    marginHorizontal: SPACING.lg,
    marginTop: -SPACING.xl,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 20,
  },

  // ── Segmented Control ──
  segmentContainer: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)',
    borderRadius: RADIUS.segment,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    marginBottom: SPACING.lg,
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: RADIUS.segmentPill,
    flex: 1,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.textOnPrimary,
  },

  // ── Error ──
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.sm,
    textAlign: isRTL ? 'right' : 'left',
  },

  // ── Remember Me ──
  rememberRow: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    marginBottom: SPACING.md,
    paddingVertical: 4,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginLeft: isRTL ? 10 : 0,
    marginRight: isRTL ? 0 : 10,
    width: 24,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rememberText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Primary Button ──
  primaryButton: {
    borderRadius: RADIUS.button,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonGradient: {
    alignItems: 'center',
    borderRadius: RADIUS.button,
    height: 56,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Links ──
  quietLinkRow: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  quietText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  quietLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Divider ──
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginHorizontal: SPACING.md,
    // Horizontal padding so Android doesn't clip the last Arabic glyph (أو -> أ).
    paddingHorizontal: 6,
    textAlign: 'center',
  },

  // ── Social ──
  socialColumn: {
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
  },
  socialButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: RADIUS.social,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
  },
  socialInner: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'center',
  },
  socialButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Guest ──
  guestButton: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  guestText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Modals ──
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.lg,
    width: '100%',
  },
  modalIconCircle: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: isDark ? 'rgba(255,176,32,0.16)' : 'rgba(245,160,10,0.12)',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    width: 60,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  modalDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  modalButtonPrimary: {
    borderRadius: RADIUS.button,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 54,
    justifyContent: 'center',
  },
  modalButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  modalButtonSecondary: {
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F4',
    borderColor: colors.border,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    flexDirection: 'row',
    height: 54,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  modalButtonSecondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonCancel: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
  },
  modalButtonCancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
});

export default SignInScreen;
