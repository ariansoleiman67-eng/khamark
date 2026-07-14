/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useEffect } from 'react';
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  I18nManager,
} from 'react-native';
import AppText from '../../components/AppText';
import { Image } from 'expo-image';
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
import { isPhoneRegistered, isEmailRegistered } from '../../services/auth';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { useUserRegion } from '../../hooks/useUserRegion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { signInWithGoogle, isGoogleSignInAvailable } from '../../services/auth';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RegisterMethod = 'phone' | 'email';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Design Tokens (spacing / radius only — colors come from useTheme) ──────
const LUX = {
  accent: '#FF7622',
  gold: '#D4AF37',
  error: '#FF6B6B',
  google: '#EA4335',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 16, button: 16, segment: 14, segmentPill: 12, card: 24, back: 22, social: 16 };

const ASANKARY_LOGO = require('../../../assets/images/asankarylogo.png');

// ─── Floating Particle (preserved animation) ─────────────────
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

// ─── Animated Input Wrapper (preserved focus animation) ──────
const AnimatedInputWrapper = ({ children, isFocused, borderColor = 'rgba(255,255,255,0.12)' }: { children: React.ReactNode; isFocused: boolean; borderColor?: string }) => {
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
    borderColor: interpolateColor(focusProgress.value, [0, 1], [borderColor, 'rgba(255,118,34,0.65)']),
    borderWidth: 1.5,
    shadowColor: '#FF7622',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: focusProgress.value * 0.35,
    shadowRadius: focusProgress.value * 12,
  }));

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View style={wrapperStyle}>
      <Animated.View style={[{ borderRadius: RADIUS.input, overflow: 'hidden' }, glowBorderStyle]}>
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
const RegisterEmailInput = ({ email, setEmail, setErrorMessage, t, theme, isRTL }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <AppText style={[regInputStyles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
        {t('auth.emailAddress', { defaultValue: 'Email Address' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused} borderColor={theme.colors.border}>
        <View style={[regInputStyles.wrapper, { backgroundColor: theme.colors.background, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="mail-outline" size={20} color={isFocused ? LUX.accent : theme.colors.placeholder} />
          <TextInput allowFontScaling={false}
            style={[regInputStyles.input, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder="example@gmail.com"
            placeholderTextColor={theme.colors.placeholder}
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

const regInputStyles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
  },
  wrapper: {
    alignItems: 'center',
    gap: 10,
    height: 58,
    paddingHorizontal: SPACING.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: 42,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
});

// ─── Phone Input with Focus Animation ────────────────────
const RegisterPhoneAnimated = ({ phone, setPhone, setErrorMessage, setSelectedCountry, defaultCountry, t, theme, isRTL }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <AppText style={[regInputStyles.label, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
        {t('auth.phoneNumber', { defaultValue: 'Phone Number' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused} borderColor={theme.colors.border}>
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

const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const userRegion = useUserRegion();
  const { signInWithApple, isAppleAvailable } = useAuth();
  const { theme } = useTheme();

  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const initialMethod = route.params?.method || 'phone';
  const initialEmail = route.params?.email || '';

  const [registerMethod, setRegisterMethod] = useState<RegisterMethod>(initialMethod);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(userRegion);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Sync selectedCountry when userRegion loads from AsyncStorage
  useEffect(() => {
    setSelectedCountry(userRegion);
  }, [userRegion]);

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      // Auth state change routes into the app automatically.
    } catch (error: any) {
      if (error?.message !== 'Sign in was cancelled') {
        Alert.alert(t('auth.error'), error?.message || 'Google sign-in failed');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
      await signInWithApple();
    } catch (error: any) {
      if (error?.message !== 'Sign in was cancelled') {
        Alert.alert(t('auth.error'), error?.message || 'Apple sign-in failed');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleContinue = async () => {
    setErrorMessage('');

    if (registerMethod === 'phone') {
      if (!phone.trim()) {
        setErrorMessage(t('auth.enterPhone', { defaultValue: 'Please enter your phone number' }));
        return;
      }

      try {
        setLoading(true);
        const countryInfo = getCountryInfo(selectedCountry);
        const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
        const formattedPhone = `${countryInfo.dialCode}${cleanPhone}`;

        const exists = await isPhoneRegistered(formattedPhone);
        if (exists) {
          setErrorMessage(
            t('auth.phoneExists', { defaultValue: 'This phone is already registered. Try signing in instead.' })
          );
          return;
        }

        navigation.navigate('VerifyPhone' as any, {
          mode: 'register',
          phone: formattedPhone,
        });
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
        const exists = await isEmailRegistered(email.trim());

        if (exists) {
          setErrorMessage(
            t('auth.emailExists', { defaultValue: 'This email is already registered. Try signing in instead.' })
          );
          return;
        }

        navigation.navigate('AboutYou' as any, {
          method: 'email',
          email: email.trim(),
        });
      } catch (error: any) {
        setErrorMessage(error.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSignIn = () => {
    navigation.navigate('SignIn' as any);
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const isDisabled = loading;

  const particles = [
    { delay: 500, x: SCREEN_WIDTH * 0.1, size: 3, duration: 9000 },
    { delay: 2500, x: SCREEN_WIDTH * 0.3, size: 2, duration: 11000 },
    { delay: 1000, x: SCREEN_WIDTH * 0.55, size: 3, duration: 8500 },
    { delay: 3500, x: SCREEN_WIDTH * 0.8, size: 2, duration: 10000 },
    { delay: 0, x: SCREEN_WIDTH * 0.7, size: 2, duration: 12000 },
  ];

  const rowDir = isRTL ? 'row-reverse' : 'row';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* ── Amber Hero Band ── */}
      <View style={[styles.hero, { paddingTop: insets.top + SPACING.sm }]}>
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.accent]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
        />

        {/* Floating particles (confined to the amber hero) */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {particles.map((p, i) => (
            <FloatingParticle key={i} {...p} />
          ))}
        </View>

        {/* Back button */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={[styles.backRow, { flexDirection: rowDir }]}
        >
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>

        {/* Brand medallion */}
        <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.heroContent}>
          <View style={[styles.logoMedallion, { backgroundColor: theme.colors.surface }]}>
            <Image source={ASANKARY_LOGO} style={styles.logoImage} contentFit="contain" />
          </View>
          <Animated.Text allowFontScaling={false} entering={SlideInLeft.duration(500).delay(280)} style={styles.heroTitle}>
            {t('auth.createAccount', { defaultValue: 'Create account' })}
          </Animated.Text>
          <Animated.Text allowFontScaling={false} entering={FadeIn.duration(500).delay(360)} style={styles.heroSubtitle}>
            {t('auth.createAccountSubtitle', { defaultValue: 'Start with your phone or email.' })}
          </Animated.Text>
        </Animated.View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Floating Card ── */}
          <Animated.View
            entering={FadeInUp.duration(600).delay(300).springify().damping(14)}
            style={[styles.glassCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }]}
          >
            {/* Segmented Control */}
            <View style={[styles.segmentContainer, { backgroundColor: theme.colors.background, flexDirection: rowDir }]}>
              <TouchableOpacity
                style={[styles.segmentButton, { flexDirection: rowDir }, registerMethod === 'phone' && { backgroundColor: theme.colors.primary }]}
                onPress={() => { setRegisterMethod('phone'); setErrorMessage(''); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="call-outline"
                  size={16}
                  color={registerMethod === 'phone' ? theme.colors.textOnPrimary : theme.colors.textSecondary}
                />
                <AppText style={[styles.segmentText, { color: registerMethod === 'phone' ? theme.colors.textOnPrimary : theme.colors.textSecondary }]}>
                  {t('auth.phone', { defaultValue: 'Phone' })}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, { flexDirection: rowDir }, registerMethod === 'email' && { backgroundColor: theme.colors.primary }]}
                onPress={() => { setRegisterMethod('email'); setErrorMessage(''); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={registerMethod === 'email' ? theme.colors.textOnPrimary : theme.colors.textSecondary}
                />
                <AppText style={[styles.segmentText, { color: registerMethod === 'email' ? theme.colors.textOnPrimary : theme.colors.textSecondary }]}>
                  {t('auth.email', { defaultValue: 'Email' })}
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Input */}
            {registerMethod === 'phone' ? (
              <RegisterPhoneAnimated
                phone={phone}
                setPhone={setPhone}
                setErrorMessage={setErrorMessage}
                setSelectedCountry={setSelectedCountry}
                defaultCountry={userRegion}
                t={t}
                theme={theme}
                isRTL={isRTL}
              />
            ) : (
              <RegisterEmailInput
                email={email}
                setEmail={setEmail}
                setErrorMessage={setErrorMessage}
                t={t}
                theme={theme}
                isRTL={isRTL}
              />
            )}

            {/* Error */}
            {!!errorMessage && (
              <AppText style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{errorMessage}</AppText>
            )}

            {/* Continue Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { shadowColor: theme.colors.primary }, isDisabled && styles.primaryButtonDisabled]}
              onPress={handleContinue}
              disabled={isDisabled}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.accent]}
                style={styles.primaryButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.textOnPrimary} />
                ) : (
                  <AppText style={[styles.primaryButtonText, { color: theme.colors.textOnPrimary }]}>
                    {t('auth.continue', { defaultValue: 'Continue' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Divider ── */}
          <Animated.View entering={FadeIn.duration(400).delay(600)} style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            <AppText style={[styles.dividerText, { color: theme.colors.textSecondary }]}>{t('common.or', { defaultValue: 'or' })}</AppText>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
          </Animated.View>

          {/* ── Social sign-up (bordered pill rows) ── */}
          <Animated.View entering={FadeInDown.duration(600).delay(650)} style={styles.socialCol}>
            {isGoogleSignInAvailable() && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, flexDirection: rowDir }]}
                onPress={handleGoogleSignIn}
                disabled={googleLoading || appleLoading}
                activeOpacity={0.85}
              >
                {googleLoading ? (
                  <ActivityIndicator color={theme.colors.primary} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={20} color={LUX.google} />
                    <AppText style={[styles.socialText, { color: theme.colors.text }]}>
                      {t('auth.continueWithGoogle', { defaultValue: 'Continue with Google' })}
                    </AppText>
                  </>
                )}
              </TouchableOpacity>
            )}
            {Platform.OS === 'ios' && isAppleAvailable && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, flexDirection: rowDir }]}
                onPress={handleAppleSignIn}
                disabled={googleLoading || appleLoading}
                activeOpacity={0.85}
              >
                {appleLoading ? (
                  <ActivityIndicator color={theme.colors.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={22} color={theme.colors.text} />
                    <AppText style={[styles.socialText, { color: theme.colors.text }]}>
                      {t('auth.continueWithApple', { defaultValue: 'Continue with Apple' })}
                    </AppText>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Sign In link */}
          <Animated.View entering={FadeIn.duration(400).delay(750)}>
            <TouchableOpacity onPress={handleSignIn} style={[styles.quietLinkRow, { flexDirection: rowDir }]} activeOpacity={0.6}>
              <AppText style={[styles.quietText, { color: theme.colors.textSecondary }]}>
                {t('auth.haveAccount', { defaultValue: 'Already have an account?' })}{' '}
              </AppText>
              <AppText style={[styles.quietLink, { color: theme.colors.primary }]}>
                {t('auth.signIn', { defaultValue: 'Sign in' })}
              </AppText>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Hero ──
  hero: {
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
    paddingBottom: SPACING.xl + SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  backRow: {
    marginBottom: SPACING.sm,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: RADIUS.back,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroContent: {
    alignItems: 'center',
  },
  logoMedallion: {
    alignItems: 'center',
    borderRadius: 48,
    elevation: 8,
    height: 96,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    width: 96,
  },
  logoImage: {
    height: 58,
    width: 58,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
    textAlign: 'center',
  },

  // ── Scroll body ──
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 0,
  },

  // ── Floating Card ──
  glassCard: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    elevation: 6,
    marginBottom: SPACING.lg,
    marginTop: -SPACING.xl,
    padding: SPACING.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },

  // ── Segmented Control ──
  segmentContainer: {
    borderRadius: RADIUS.segment,
    marginBottom: SPACING.lg,
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: RADIUS.segmentPill,
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Error ──
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },

  // ── Primary Button ──
  primaryButton: {
    borderRadius: RADIUS.button,
    elevation: 6,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
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
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Divider ──
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    marginHorizontal: SPACING.md,
    paddingHorizontal: 6,
    textAlign: 'center',
  },

  // ── Social ──
  socialCol: {
    gap: SPACING.sm,
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: RADIUS.social,
    borderWidth: 1,
    gap: 10,
    height: 56,
    justifyContent: 'center',
  },
  socialText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Links ──
  quietLinkRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  quietText: {
    fontSize: 14,
  },
  quietLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default RegisterScreen;
