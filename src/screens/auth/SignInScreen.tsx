/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect } from 'react';
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
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { CredentialStorage } from '../../services/credentialStorage';
import { useUserRegion } from '../../hooks/useUserRegion';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type LoginMethod = 'phone' | 'email';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Luxury Dark Design Tokens ──────────────────────────
const LUX = {
  // Gradient backgrounds
  gradientStart: '#0A0E27',
  gradientMid: '#10143A',
  gradientEnd: '#1A0B3E',

  // Surfaces
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.12)',
  inputBg: 'rgba(255,255,255,0.08)',
  inputBorder: 'rgba(255,255,255,0.12)',
  inputFocus: 'rgba(255,118,34,0.3)',

  // Brand
  accent: '#FF7622',
  accentGlow: 'rgba(255,118,34,0.25)',
  gold: '#D4AF37',
  goldSoft: 'rgba(212,175,55,0.15)',

  // Text
  heading: '#FFFFFF',
  body: 'rgba(255,255,255,0.9)',
  muted: 'rgba(255,255,255,0.5)',
  placeholder: 'rgba(255,255,255,0.3)',

  // Feedback
  error: '#FF6B6B',

  // Socials
  google: '#EA4335',
  facebook: '#1877F2',
  apple: '#FFFFFF',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 14, button: 16, segment: 14, segmentPill: 12, card: 24, social: 28 };

// ─── Floating Particle Component ─────────────────────────
const FloatingParticle = ({ delay, x, size, duration }: { delay: number; x: number; size: number; duration: number }) => {
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
          backgroundColor: LUX.gold,
        },
        animatedStyle,
      ]}
    />
  );
};

// ─── Animated Input Wrapper (luxury focus effects) ─────────
const AnimatedInputWrapper = ({ children, isFocused }: { children: React.ReactNode; isFocused: boolean }) => {
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
    borderColor: interpolateColor(focusProgress.value, [0, 1], ['rgba(255,255,255,0.12)', 'rgba(255,118,34,0.6)']),
    borderWidth: 1.5,
    shadowColor: '#FF7622',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: focusProgress.value * 0.4,
    shadowRadius: focusProgress.value * 12,
  }));

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View style={wrapperStyle}>
      <Animated.View style={[{ borderRadius: 16, overflow: 'hidden' }, glowBorderStyle]}>
        {/* Orange glow bar at top */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: '15%',
              right: '15%',
              height: 2,
              backgroundColor: LUX.accent,
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
const EmailInput = ({ email, setEmail, setErrorMessage, t }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={emailInputStyles.group}>
      <AppText style={emailInputStyles.label}>
        {t('auth.emailAddress', { defaultValue: 'Email Address' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused}>
        <View style={emailInputStyles.wrapper}>
          <Ionicons name="mail-outline" size={18} color={isFocused ? LUX.accent : LUX.placeholder} style={{ marginRight: 12 }} />
          <TextInput
            allowFontScaling={false}
            style={emailInputStyles.input}
            placeholder="example@gmail.com"
            placeholderTextColor={LUX.placeholder}
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

const emailInputStyles = StyleSheet.create({
  group: { marginBottom: SPACING.md },
  label: {
    color: LUX.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
  },
  wrapper: {
    alignItems: 'center',
    backgroundColor: LUX.inputBg,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: SPACING.md,
  },
  input: {
    color: LUX.body,
    flex: 1,
    fontSize: 16,
    height: 40,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
});

// ─── Phone Input with Focus Animation ────────────────────
const PhoneInputAnimated = ({ phone, setPhone, setErrorMessage, setSelectedCountry, defaultCountry, t }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <AppText style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' as const }}>
        {t('auth.phoneNumber', { defaultValue: 'Phone Number' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused}>
        <PhoneInput
          value={phone}
          onChangeText={(text: string) => { setPhone(text); setErrorMessage(''); }}
          onCountryChange={(country: any) => setSelectedCountry(country.code)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          defaultCountry={defaultCountry}
        />
      </AnimatedInputWrapper>
    </View>
  );
};

/**
 * Sign In Screen — Luxury Dark Theme
 */
const SignInScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { signInWithApple, isAppleAvailable } = useAuth();
  const userRegion = useUserRegion();

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

  const handleGoogleSignIn = async () => {
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
    }
  };

  const handleFacebookSignIn = async () => {
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
    }
  };

  const handleAppleSignIn = async () => {
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
      <LinearGradient
        colors={[LUX.gradientStart, LUX.gradientMid, LUX.gradientEnd]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Floating particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p, i) => (
          <FloatingParticle key={i} {...p} />
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo ── */}
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
                  source={require('../../../assets/images/asankary-signin-logo.png')}
                  style={styles.logoImage}
                  contentFit="contain"
                />
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Title ── */}
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

          {/* ── Glassmorphism Card ── */}
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
                  color={loginMethod === 'phone' ? '#fff' : LUX.muted}
                  style={{ marginRight: 6 }}
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
                  color={loginMethod === 'email' ? '#fff' : LUX.muted}
                  style={{ marginRight: 6 }}
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
              />
            ) : (
              <EmailInput
                email={email}
                setEmail={setEmail}
                setErrorMessage={setErrorMessage}
                t={t}
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
                  <Ionicons name="checkmark" size={14} color="#fff" />
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
                colors={['#FF8C3A', '#FF7622', '#FF5C00']}
                style={styles.primaryButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
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
          <Animated.View entering={FadeInDown.duration(600).delay(1000)} style={styles.socialRow}>
            {isGoogleSignInAvailable() && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: LUX.google }]}
                onPress={handleGoogleSignIn}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <AppText style={styles.socialIcon}>G</AppText>
                )}
              </TouchableOpacity>
            )}

            {false && isFacebookSignInAvailable() && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: LUX.facebook }]}
                onPress={handleFacebookSignIn}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {facebookLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="logo-facebook" size={22} color="#fff" />
                )}
              </TouchableOpacity>
            )}

            {Platform.OS === 'ios' && isAppleAvailable && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: LUX.apple }]}
                onPress={handleAppleSignIn}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {appleLoading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Ionicons name="logo-apple" size={22} color="#000" />
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
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
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
                  colors={[LUX.accent, '#FF5C00']}
                  style={styles.modalButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="lock-closed-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
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
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={LUX.body} style={{ marginRight: 8 }} />
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
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
          <View style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInDown.duration(400).springify().damping(15)}
              style={styles.modalContent}
            >
              <View style={styles.modalIconCircle}>
                <Ionicons name="person-add-outline" size={28} color={LUX.accent} />
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
                  colors={[LUX.accent, '#FF5C00']}
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUX.gradientStart,
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: SPACING.lg,
  },

  // ── Logo ──
  logoArea: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    alignItems: 'center',
    height: 110,
    justifyContent: 'center',
    width: 110,
  },
  logoImage: {
    height: 110,
    width: 110,
  },

  // ── Typography ──
  title: {
    color: LUX.heading,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },

  // ── Glass Card ──
  glassCard: {
    backgroundColor: LUX.glass,
    borderColor: LUX.glassBorder,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
  },

  // ── Segmented Control ──
  segmentContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.segment,
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: RADIUS.segmentPill,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  segmentButtonActive: {
    backgroundColor: LUX.accent,
  },
  segmentText: {
    color: LUX.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },

  // ── Input ──
  inputGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    color: LUX.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: LUX.inputBg,
    borderColor: LUX.inputBorder,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: SPACING.md,
  },
  input: {
    color: LUX.body,
    flex: 1,
    fontSize: 16,
    height: 40,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },

  // ── Error ──
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },

  // ── Remember Me ──
  rememberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
    paddingVertical: 4,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: LUX.glassBorder,
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginRight: 10,
    width: 24,
  },
  checkboxChecked: {
    backgroundColor: LUX.accent,
    borderColor: LUX.accent,
  },
  rememberText: {
    color: LUX.body,
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Primary Button ──
  primaryButton: {
    borderRadius: RADIUS.button,
    overflow: 'hidden',
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonGradient: {
    alignItems: 'center',
    borderRadius: RADIUS.button,
    height: 54,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Links ──
  quietLinkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
  },
  quietText: {
    color: LUX.muted,
    fontSize: 14,
  },
  quietLink: {
    color: LUX.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Divider ──
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    backgroundColor: LUX.glassBorder,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: LUX.muted,
    fontSize: 13,
    marginHorizontal: SPACING.md,
    // Horizontal padding so Android doesn't clip the last Arabic glyph (أو -> أ).
    paddingHorizontal: 6,
    textAlign: 'center',
  },

  // ── Social ──
  socialRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'center',
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: RADIUS.social,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  socialIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },

  // ── Guest ──
  guestButton: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  guestText: {
    color: LUX.muted,
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Modals ──
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: LUX.gradientMid,
    borderColor: LUX.glassBorder,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: SPACING.lg,
    width: '100%',
  },
  modalIconCircle: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: LUX.accentGlow,
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    width: 60,
  },
  modalTitle: {
    color: LUX.heading,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  modalDescription: {
    color: LUX.muted,
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
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonSecondary: {
    alignItems: 'center',
    backgroundColor: LUX.inputBg,
    borderColor: LUX.inputBorder,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    flexDirection: 'row',
    height: 54,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  modalButtonSecondaryText: {
    color: LUX.body,
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonCancel: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
  },
  modalButtonCancelText: {
    color: LUX.muted,
    fontSize: 15,
    fontWeight: '500',
  },
});

export default SignInScreen;
