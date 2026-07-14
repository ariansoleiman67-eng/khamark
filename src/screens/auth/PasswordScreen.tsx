/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
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
import { RootStackParamList } from '../../types';
import { CredentialStorage } from '../../services/credentialStorage';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Luxury Dark Design Tokens ──────────────────────────
const LUX = {
  gradientStart: '#0A0E27',
  gradientMid: '#10143A',
  gradientEnd: '#1A0B3E',
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.12)',
  inputBg: 'rgba(255,255,255,0.08)',
  inputBorder: 'rgba(255,255,255,0.12)',
  accent: '#FF7622',
  gold: '#D4AF37',
  goldSoft: 'rgba(212,175,55,0.15)',
  heading: '#FFFFFF',
  body: 'rgba(255,255,255,0.9)',
  muted: 'rgba(255,255,255,0.5)',
  placeholder: 'rgba(255,255,255,0.3)',
  error: '#FF6B6B',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 14, button: 16, card: 24, back: 22 };

// ─── Floating Particle ────────────────────────────────────
const FloatingParticle = ({ delay, x, size, duration }: { delay: number; x: number; size: number; duration: number }) => {
  const translateY = useSharedValue(SCREEN_HEIGHT + 20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(delay, withRepeat(withTiming(-50, { duration, easing: Easing.linear }), -1, false));
    opacity.value = withDelay(delay, withRepeat(
      withSequence(withTiming(0.5, { duration: duration * 0.3 }), withTiming(0.5, { duration: duration * 0.4 }), withTiming(0, { duration: duration * 0.3 })),
      -1, false
    ));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left: x, width: size, height: size, borderRadius: size / 2, backgroundColor: LUX.gold }, animatedStyle]} />
  );
};

// ─── Animated Input Wrapper ──────────────────────────────
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

const maskIdentifier = (method: 'phone' | 'email', identifier: string): string => {
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

const PasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();

  const { method, identifier, returnReason, requireAuth, rememberMe: rememberMeParam } = route.params || {};

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [rememberMe, setRememberMe] = useState(rememberMeParam ?? false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const masked = maskIdentifier(method, identifier);

  // Load saved credentials on mount
  React.useEffect(() => {
    const loadSaved = async () => {
      try {
        const credentials = await CredentialStorage.getCredentials();
        if (credentials) {
          setPassword(credentials.password);
          setRememberMe(true);
        }
      } catch (e) {
        // ignore
      }
    };
    loadSaved();
  }, []);

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

    try {
      setLoading(true);
      if (method === 'phone') {
        await loginWithPhone(identifier, password);
      } else {
        await loginWithEmail(identifier, password);
      }

      await refreshUser();

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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[LUX.gradientStart, LUX.gradientMid, LUX.gradientEnd]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

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
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back Button */}
          <Animated.View entering={FadeIn.duration(400)}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={20} color={LUX.body} />
            </TouchableOpacity>
          </Animated.View>

          {/* Lock icon */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.iconArea}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={32} color={LUX.accent} />
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.Text allowFontScaling={false} entering={SlideInLeft.duration(500).delay(300)} style={styles.title}>
            {t('auth.welcomeBack', { defaultValue: 'Welcome back' })}
          </Animated.Text>
          <Animated.Text allowFontScaling={false} entering={FadeIn.duration(500).delay(400)} style={styles.subtitle}>
            {t('auth.signInAs', { defaultValue: 'Sign in as' })} {masked}
          </Animated.Text>

          {/* Glass Card */}
          <Animated.View entering={FadeInUp.duration(600).delay(400).springify().damping(14)} style={styles.glassCard}>
            {/* Password Input */}
            <View style={styles.inputGroup}>
              <AppText style={styles.label}>
                {t('auth.password', { defaultValue: 'Password' })}
              </AppText>
              <AnimatedInputWrapper isFocused={passwordFocused}>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={passwordFocused ? LUX.accent : LUX.placeholder} style={{ marginRight: 12 }} />
                  <TextInput allowFontScaling={false}
                    style={styles.input}
                    placeholder="••••••••••"
                    placeholderTextColor={LUX.placeholder}
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
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={LUX.muted} />
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
                  {rememberMe && <Ionicons name="checkmark" size={14} color="#fff" />}
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
                colors={['#FF8C3A', '#FF7622', '#FF5C00']}
                style={styles.primaryButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <AppText style={styles.primaryButtonText}>
                    {t('auth.signInAction', { defaultValue: 'Sign in' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Code link */}
          <Animated.View entering={FadeIn.duration(400).delay(700)} style={styles.linksContainer}>
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUX.gradientStart,
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
  },

  // Back
  backButton: {
    alignItems: 'center',
    backgroundColor: LUX.glass,
    borderColor: LUX.glassBorder,
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    width: 44,
  },

  // Icon
  iconArea: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  lockCircle: {
    alignItems: 'center',
    backgroundColor: LUX.glass,
    borderColor: LUX.glassBorder,
    borderRadius: 40,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },

  // Typography
  title: {
    color: LUX.heading,
    fontSize: 30,
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

  // Glass Card
  glassCard: {
    backgroundColor: LUX.glass,
    borderColor: LUX.glassBorder,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
  },

  // Input
  inputGroup: {
    marginBottom: SPACING.sm,
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
  eyeButton: {
    padding: 6,
  },

  // Error
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },

  // Remember Me
  rememberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  rememberMe: {
    alignItems: 'center',
    flexDirection: 'row',
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
  forgotLink: {
    color: LUX.accent,
    fontSize: 14,
    fontWeight: '500',
  },

  // Primary Button
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

  // Links
  linksContainer: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  quietButton: {
    paddingVertical: SPACING.xs,
  },
  quietLink: {
    color: LUX.muted,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default PasswordScreen;
