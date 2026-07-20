/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  SlideInLeft,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { loginWithPhone, loginWithEmail } from '../../services/auth';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { RootStackParamList } from '../../types';
import { CredentialStorage } from '../../services/credentialStorage';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Static Design Tokens (theme colours come from useTheme) ─────────────
const LUX = {
  gold: 'rgba(255,255,255,0.55)',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 16, button: 16, card: 26, coin: 30, back: 22 };

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
    translateY.value = withDelay(delay, withRepeat(withTiming(-50, { duration, easing: Easing.linear }), -1, false));
    opacity.value = withDelay(delay, withRepeat(
      withSequence(withTiming(0.6, { duration: duration * 0.3 }), withTiming(0.6, { duration: duration * 0.4 }), withTiming(0, { duration: duration * 0.3 })),
      -1, false
    ));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left: x, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animatedStyle]} />
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

const maskIdentifier = (method: 'phone' | 'email' | undefined, identifier?: string): string => {
  if (!identifier) return '';
  if (method === 'phone') {
    if (identifier.length < 4) return identifier;
    const last2 = identifier.slice(-2);
    const countryCode = identifier.match(/^\+\d{1,3}/)?.[0] || '';
    return `${countryCode} ••• ••• ••${last2}`;
  } else {
    const [local, domain] = identifier.split('@');
    if (!local || !domain) return identifier;
    return `${local.slice(0, 2)}***@${domain}`;
  }
};

/**
 * Password Screen — Premium Amber Retail
 */
const PasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const { theme, isDark } = useTheme();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F4';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

  const { method, identifier, returnReason, requireAuth, rememberMe: rememberMeParam } = route.params || {};

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Hard guard against double-submit; `loading` is state and lands a render later.
  const submittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [rememberMe, setRememberMe] = useState(rememberMeParam ?? false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const masked = maskIdentifier(method, identifier);

  // Guard: required params missing (e.g. restored nav state / deep link) — go back gracefully
  React.useEffect(() => {
    if (!method || !identifier) {
      navigation.goBack();
    }
  }, [method, identifier, navigation]);

  // Load saved credentials on mount — only prefill when they belong to THIS account
  React.useEffect(() => {
    const loadSaved = async () => {
      try {
        const credentials = await CredentialStorage.getCredentials();
        // getCredentials() is a single global slot; only prefill if it matches the
        // current identifier, and never clobber input the user has already typed.
        if (credentials && credentials.email === identifier) {
          setPassword((prev) => (prev ? prev : credentials.password));
          setRememberMe(true);
        }
      } catch (e) {
        // ignore
      }
    };
    loadSaved();
  }, [identifier]);

  const handleSuccessfulLogin = () => {
    if (requireAuth && returnReason) {
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
      navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
    }
  };

  const handleSignIn = async () => {
    setErrorMessage('');
    if (!password.trim()) {
      setErrorMessage(t('auth.enterPassword', { defaultValue: 'Please enter your password' }));
      return;
    }

    // `disabled={loading}` is the only other protection and it lands a render late,
    // while signInWithIdentifier is a seconds-long multi-hop flow (RPC lookup ->
    // native sign-in -> Cloud Function). Two taps in one frame therefore both run,
    // and all three consequences are user-visible: both handlers close over the same
    // failCount so the "3 attempts -> offer OTP" fallback is delayed; the provider
    // rate limit is burned twice as fast; and on success handleSuccessfulLogin runs
    // twice, which on the returnReason branch issues four navigation.goBack() calls
    // and throws the user two screens past where they meant to land.
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setLoading(true);
      if (method === 'phone') {
        await loginWithPhone(identifier, password);
      } else {
        await loginWithEmail(identifier, password);
      }

      // Login already succeeded above; a failed user refresh is NOT a wrong-password
      // error, so isolate it from the catch below (otherwise a transient network
      // hiccup would be misreported as "Incorrect password").
      try {
        await refreshUser();
      } catch (e) {
        console.log('refreshUser failed after successful login:', e);
      }

      try {
        if (rememberMe) {
          await CredentialStorage.saveCredentials(identifier, password);
        } else {
          await CredentialStorage.clearCredentials();
        }
      } catch (e) {
        console.log('Failed to save/clear credentials:', e);
      }

      handleSuccessfulLogin();
    } catch (error: any) {
      const newCount = failCount + 1;
      setFailCount(newCount);

      if (newCount >= 3 && method === 'phone') {
        Alert.alert(
          t('auth.tooManyAttempts', { defaultValue: 'Too many attempts' }),
          t('auth.tryOTP', { defaultValue: 'Would you like to sign in with a code instead?' }),
          [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('auth.sendCode', { defaultValue: 'Send code' }), onPress: handleSignInWithCode },
          ]
        );
      } else {
        setErrorMessage(t('auth.wrongPassword', { defaultValue: 'Incorrect password. Please try again.' }));
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleForgotPassword = () => {
    if (method === 'phone') {
      navigation.navigate('VerifyPhone' as any, { mode: 'forgot_password', phone: identifier });
    } else {
      navigation.navigate('ForgotPassword' as any);
    }
  };

  const handleSignInWithCode = () => {
    navigation.navigate('VerifyPhone' as any, { mode: 'fallback', phone: identifier });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const particles = [
    { delay: 0, x: SCREEN_WIDTH * 0.15, size: 3, duration: 9000 },
    { delay: 2000, x: SCREEN_WIDTH * 0.4, size: 2, duration: 11000 },
    { delay: 1000, x: SCREEN_WIDTH * 0.65, size: 3, duration: 8000 },
    { delay: 3000, x: SCREEN_WIDTH * 0.85, size: 2, duration: 10000 },
  ];

  // Required params missing — render nothing; the guard effect navigates back.
  if (!method || !identifier) {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

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
            style={[styles.hero, { paddingTop: insets.top + SPACING.sm }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Floating sparkles (clipped to hero) */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {particles.map((p, i) => (
                <FloatingParticle key={i} {...p} color="rgba(255,255,255,0.55)" />
              ))}
            </View>

            {/* Back button */}
            <Animated.View entering={FadeIn.duration(400)} style={styles.heroHeader}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
                <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.textOnPrimary} />
              </TouchableOpacity>
            </Animated.View>

            {/* Logo coin */}
            <Animated.View entering={ZoomIn.duration(800).springify().damping(12)} style={styles.logoArea}>
              <View style={styles.logoCircle}>
                <Image
                  source={require('../../../assets/images/asankarylogo.png')}
                  style={styles.logoImage}
                  contentFit="contain"
                />
              </View>
            </Animated.View>

            {/* Title */}
            <Animated.Text allowFontScaling={false} entering={SlideInLeft.duration(500).delay(300)} style={styles.title}>
              {t('auth.welcomeBack', { defaultValue: 'Welcome back' })}
            </Animated.Text>
            <Animated.Text allowFontScaling={false} entering={FadeIn.duration(500).delay(400)} style={styles.subtitle}>
              {t('auth.signInAs', { defaultValue: 'Sign in as' })} {masked}
            </Animated.Text>
          </LinearGradient>

          {/* ── Form Card (overlaps hero) ── */}
          <Animated.View entering={FadeInUp.duration(600).delay(400).springify().damping(14)} style={styles.glassCard}>
            {/* Password Input */}
            <View style={styles.inputGroup}>
              <AppText style={styles.label}>
                {t('auth.password', { defaultValue: 'Password' })}
              </AppText>
              <AnimatedInputWrapper isFocused={passwordFocused} colors={colors} fill={inputBg}>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={passwordFocused ? colors.primary : colors.placeholder}
                    style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }}
                  />
                  <TextInput allowFontScaling={false}
                    style={styles.input}
                    placeholder="••••••••••"
                    placeholderTextColor={colors.placeholder}
                    value={password}
                    onChangeText={(text) => { setPassword(text); setErrorMessage(''); }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} activeOpacity={0.6}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.placeholder} />
                  </TouchableOpacity>
                </View>
              </AnimatedInputWrapper>
            </View>

            {/* Error */}
            {!!errorMessage && <AppText style={styles.errorText}>{errorMessage}</AppText>}

            {/* Remember Me + Forgot */}
            <View style={styles.rememberRow}>
              <TouchableOpacity style={styles.rememberMe} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.7}>
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />}
                </View>
                <AppText style={styles.rememberText}>
                  {t('auth.rememberMe', { defaultValue: 'Remember me' })}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.6}>
                <AppText style={styles.forgotLink}>
                  {t('auth.forgotPasswordLabel', { defaultValue: 'Forgot password?' })}
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
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
                    {t('auth.signInAction', { defaultValue: 'Sign in' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Code link */}
          <Animated.View entering={FadeInDown.duration(400).delay(700)} style={styles.linksContainer}>
            {method === 'phone' && (
              <TouchableOpacity onPress={handleSignInWithCode} style={styles.quietButton} activeOpacity={0.6}>
                <AppText style={styles.quietLink}>
                  {t('auth.signInWithCode', { defaultValue: 'Sign in with code instead' })}
                </AppText>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    marginBottom: SPACING.sm,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },

  // ── Logo ──
  logoArea: {
    alignItems: 'center',
    marginBottom: SPACING.md,
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

  // ── Input ──
  inputGroup: {
    marginBottom: SPACING.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: SPACING.xs,
    textAlign: isRTL ? 'right' : 'left',
    textTransform: 'uppercase',
  },
  inputWrapper: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    height: 58,
    paddingHorizontal: SPACING.md,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    height: 40,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlign: isRTL ? 'right' : 'left',
    textAlignVertical: 'center',
  },
  eyeButton: {
    padding: 6,
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

  // ── Remember Me + Forgot ──
  rememberRow: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  rememberMe: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
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
  forgotLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  linksContainer: {
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
  },
  quietButton: {
    paddingVertical: SPACING.xs,
  },
  quietLink: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PasswordScreen;
