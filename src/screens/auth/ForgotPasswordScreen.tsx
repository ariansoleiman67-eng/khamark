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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  FadeIn,
  ZoomIn,
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
import { isPhoneRegistered, sendPasswordResetEmail } from '../../services/auth';
import { validatePhone, getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { useUserRegion } from '../../hooks/useUserRegion';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { useTheme } from '../../components/ThemeProvider';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ResetMethod = 'phone' | 'email';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Static Design Tokens (theme colours come from useTheme) ─────────────
const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 16, button: 16, segment: 14, segmentPill: 11, card: 26, back: 22, coin: 30 };

// ─── Floating Particle Component ─────────────────────────
const FloatingParticle = ({
  delay,
  x,
  size,
  duration,
  color,
}: { delay: number; x: number; size: number; duration: number; color: string }) => {
  const translateY = useSharedValue(SCREEN_HEIGHT + 20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(withTiming(-50, { duration, easing: Easing.linear }), -1, false)
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
const EmailInput = ({ email, setEmail, t, colors, isRTL, inputBg }: any) => {
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
        {t('auth.email', { defaultValue: 'Email' })}
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
            onChangeText={setEmail}
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
const PhoneInputAnimated = ({ phone, setPhone, setSelectedCountry, defaultCountry, t, colors, isRTL, inputBg }: any) => {
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
          onChangeText={(text: string) => setPhone(text)}
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
 * Forgot Password Screen — Premium Amber Retail
 */
const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const userRegion = useUserRegion();
  const { theme, isDark } = useTheme();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F4';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

  const [resetMethod, setResetMethod] = useState<ResetMethod>('email');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(userRegion);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  // Synchronous re-entrancy guard: `loading` state flips a frame late, so a
  // fast double-tap can fire handleContinue twice (two reset emails / duplicate
  // nav) before the button's disabled prop commits. This ref blocks that.
  const inFlight = useRef(false);
  // Screen liveness. Alert.alert is a native global modal with no lifecycle
  // binding, and goBack() pops whatever is on top rather than this screen — so
  // an alert firing after the user navigated away could pop an unrelated screen.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // Sync selectedCountry when userRegion loads from AsyncStorage
  useEffect(() => {
    setSelectedCountry(userRegion);
  }, [userRegion]);

  const handleContinue = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (resetMethod === 'phone') {
        if (!phone.trim()) {
          Alert.alert(t('auth.error'), 'Please enter your phone number');
          return;
        }

        if (!validatePhone(phone)) {
          Alert.alert(t('auth.error'), 'Please enter a valid phone number');
          return;
        }

        setLoading(true);
        // getCountryInfo returns undefined for codes absent from the map (its
        // declared return type lies). selectedCountry is seeded from a persisted,
        // unchecked-cast region value, so a legacy/corrupt code would make
        // `.dialCode` throw. Fall back to IQ (always present in the map).
        const countryInfo = getCountryInfo(selectedCountry) ?? getCountryInfo('IQ');
        const formattedPhone = `${countryInfo.dialCode}${phone.replace(/\D/g, '')}`;

        const exists = await isPhoneRegistered(formattedPhone);
        if (!exists) {
          Alert.alert(
            t('auth.error'),
            'This phone number is not registered. Please check your number or register.'
          );
          setLoading(false);
          return;
        }

        navigation.navigate('VerifyPhone', {
          mode: 'forgot_password',
          phone: formattedPhone,
        });
      } else {
        if (!email.trim()) {
          Alert.alert(t('auth.error'), 'Please enter your email address');
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          Alert.alert(t('auth.error'), 'Please enter a valid email address');
          return;
        }

        setLoading(true);
        await sendPasswordResetEmail(email.trim());

        // If the user backed out during the SMTP round trip, this alert would fire
        // over whatever screen they landed on — and its OK handler calls goBack(),
        // which pops whatever is on TOP rather than this screen (React Navigation
        // ignores the source key when no target is set), dumping them a screen further
        // back than they asked for.
        if (!aliveRef.current) return;

        Alert.alert(
          t('auth.success'),
          t('auth.forgotPassword.emailSent', {
            defaultValue: 'Password reset email sent! Please check your inbox.'
          }),
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert(t('auth.error'), error.message || 'Failed to process request');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Particle data
  const particles = [
    { delay: 0, x: SCREEN_WIDTH * 0.1, size: 3, duration: 8000 },
    { delay: 1500, x: SCREEN_WIDTH * 0.25, size: 2, duration: 10000 },
    { delay: 3000, x: SCREEN_WIDTH * 0.45, size: 4, duration: 7000 },
    { delay: 500, x: SCREEN_WIDTH * 0.6, size: 2, duration: 9000 },
    { delay: 2000, x: SCREEN_WIDTH * 0.78, size: 3, duration: 11000 },
    { delay: 4000, x: SCREEN_WIDTH * 0.9, size: 2, duration: 8500 },
  ];

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
            <Animated.View entering={FadeIn.duration(400)} style={[styles.backRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
                <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.textOnPrimary} />
              </TouchableOpacity>
            </Animated.View>

            {/* Logo coin */}
            <Animated.View
              entering={ZoomIn.duration(800).springify().damping(12)}
              style={styles.logoArea}
            >
              <View style={styles.logoCircle}>
                <Image
                  source={require('../../../assets/images/asankarylogo.png')}
                  style={styles.logoImage}
                  contentFit="contain"
                />
              </View>
            </Animated.View>

            {/* Title */}
            <Animated.View entering={SlideInLeft.duration(600).delay(300)}>
              <Animated.Text
              allowFontScaling={false}
              style={styles.title}
            >
              {t('auth.forgotPassword.title', { defaultValue: 'Forgot Password' })}
            </Animated.Text>
            </Animated.View>
            <Animated.View entering={FadeIn.duration(600).delay(500)}>
              <Animated.Text
              allowFontScaling={false}
              style={styles.subtitle}
            >
              {t('auth.forgotPassword.subtitle', { defaultValue: 'Please sign in to your existing account' })}
            </Animated.Text>
            </Animated.View>
          </LinearGradient>

          {/* ── Form Card (overlaps hero) ── */}
          <Animated.View
            entering={FadeInUp.duration(700).delay(400).springify().damping(14)}
            style={styles.glassCard}
          >
            {/* Segmented Control */}
            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[styles.segmentButton, resetMethod === 'email' && styles.segmentButtonActive]}
                onPress={() => setResetMethod('email')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={resetMethod === 'email' ? colors.textOnPrimary : colors.textSecondary}
                  style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                />
                <AppText style={[styles.segmentText, resetMethod === 'email' && styles.segmentTextActive]}>
                  {t('auth.email', { defaultValue: 'Email' })}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, resetMethod === 'phone' && styles.segmentButtonActive]}
                onPress={() => setResetMethod('phone')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="call-outline"
                  size={16}
                  color={resetMethod === 'phone' ? colors.textOnPrimary : colors.textSecondary}
                  style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                />
                <AppText style={[styles.segmentText, resetMethod === 'phone' && styles.segmentTextActive]}>
                  {t('auth.phoneNumber', { defaultValue: 'Phone' })}
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Input with focus animations */}
            {resetMethod === 'email' ? (
              <EmailInput
                email={email}
                setEmail={setEmail}
                t={t}
                colors={colors}
                isRTL={isRTL}
                inputBg={inputBg}
              />
            ) : (
              <PhoneInputAnimated
                phone={phone}
                setPhone={setPhone}
                setSelectedCountry={setSelectedCountry}
                defaultCountry={userRegion}
                t={t}
                colors={colors}
                isRTL={isRTL}
                inputBg={inputBg}
              />
            )}

            {/* Send Code Button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleContinue}
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
                    {t('auth.sendCode', { defaultValue: 'Send Code' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
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
  backRow: {
    alignSelf: 'stretch',
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
});

export default ForgotPasswordScreen;
