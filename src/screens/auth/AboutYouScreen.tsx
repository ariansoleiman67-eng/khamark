/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { RootStackParamList } from '../../types';
import { useTheme } from '../../components/ThemeProvider';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Design Tokens (spacing / radius only — colors come from useTheme) ──────
const LUX = {
  gold: '#D4AF37',
  error: '#FF6B6B',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 16, button: 16, card: 24, back: 22 };

const KHAMARK_LOGO = require('../../../assets/images/khamark_logo.png');

// ─── Floating Particle (matches Register/SignIn hero sparkle) ─────────────────
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

// ─── Animated Input Wrapper (premium focus glow, theme-aware) ─────────
const AnimatedInputWrapper = ({ children, isFocused, borderColor, primary }: { children: React.ReactNode; isFocused: boolean; borderColor: string; primary: string }) => {
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
    borderColor: interpolateColor(focusProgress.value, [0, 1], [borderColor, primary]),
    borderWidth: 1.5,
    shadowColor: primary,
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
            { position: 'absolute', top: 0, left: '15%', right: '15%', height: 2, backgroundColor: primary, borderRadius: 1, zIndex: 10 },
            topGlowStyle,
          ]}
        />
        {children}
      </Animated.View>
    </Animated.View>
  );
};

/**
 * Screen 3 — Your Details (minimal identity)
 * Collects only what's needed: name + optional referral.
 */
const AboutYouScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F4';

  const { method, phone, email } = route.params || {};

  const [name, setName] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Presentation-only focus state for the premium input glow.
  const [nameFocused, setNameFocused] = useState(false);
  const [referralFocused, setReferralFocused] = useState(false);

  const handleContinue = () => {
    setErrorMessage('');

    if (!name.trim()) {
      setErrorMessage(t('auth.enterName', { defaultValue: 'Please enter your name' }));
      return;
    }

    // Go to Screen 4 — Create Password
    navigation.navigate('SetNewPassword' as any, {
      mode: 'register',
      phone: phone || '',
      name: name.trim(),
      method,
      email,
      referralCode: referralCode.trim() || undefined,
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const particles = [
    { delay: 500, x: SCREEN_WIDTH * 0.1, size: 3, duration: 9000 },
    { delay: 2500, x: SCREEN_WIDTH * 0.3, size: 2, duration: 11000 },
    { delay: 1000, x: SCREEN_WIDTH * 0.55, size: 3, duration: 8500 },
    { delay: 3500, x: SCREEN_WIDTH * 0.8, size: 2, duration: 10000 },
    { delay: 0, x: SCREEN_WIDTH * 0.7, size: 2, duration: 12000 },
  ];

  const styles = createStyles(colors, isRTL);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          <View style={[styles.hero, { paddingTop: insets.top + SPACING.sm }]}>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
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
              <View style={[styles.logoMedallion, { backgroundColor: colors.surface }]}>
                <Image source={KHAMARK_LOGO} style={styles.logoImage} contentFit="contain" />
              </View>
              <Animated.View entering={SlideInLeft.duration(500).delay(280)}>
              <Animated.Text allowFontScaling={false} style={styles.heroTitle}>
                {t('auth.yourDetails', { defaultValue: 'Your details' })}
              </Animated.Text>
            </Animated.View>
              <Animated.View entering={FadeIn.duration(500).delay(360)}>
              <Animated.Text allowFontScaling={false} style={styles.heroSubtitle}>
                {t('auth.yourDetailsSubtitle', { defaultValue: 'Tell us a bit about yourself.' })}
              </Animated.Text>
            </Animated.View>
            </Animated.View>
          </View>

          {/* ── Body (overlaps hero) ── */}
          <View style={styles.body}>
            {/* ── Floating Card ── */}
            <Animated.View
              entering={FadeInUp.duration(600).delay(300).springify().damping(14)}
              style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}
            >
              {/* ── Full Name ── */}
              <View style={styles.inputGroup}>
                <AppText style={[styles.label, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('auth.fullName', { defaultValue: 'Full Name' })}
                </AppText>
                <AnimatedInputWrapper isFocused={nameFocused} borderColor={colors.border} primary={colors.primary}>
                  <View style={[styles.inputWrapper, { backgroundColor: inputBg, flexDirection: rowDir }]}>
                    <Ionicons name="person-outline" size={20} color={nameFocused ? colors.primary : colors.placeholder} />
                    <TextInput allowFontScaling={false}
                      style={[styles.input, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}
                      placeholder={t('auth.namePlaceholder', { defaultValue: 'John Doe' })}
                      placeholderTextColor={colors.placeholder}
                      value={name}
                      onChangeText={(text) => { setName(text); setErrorMessage(''); }}
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoFocus
                      onFocus={() => setNameFocused(true)}
                      onBlur={() => setNameFocused(false)}
                    />
                  </View>
                </AnimatedInputWrapper>
              </View>

              {/* ── Optional Referral Code (collapsed) ── */}
              {!showReferral ? (
                <TouchableOpacity
                  onPress={() => setShowReferral(true)}
                  style={[styles.referralToggle, { flexDirection: rowDir }]}
                  activeOpacity={0.6}
                >
                  <Ionicons name="gift-outline" size={16} color={colors.primary} style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
                  <AppText style={[styles.referralToggleText, { color: colors.primary }]}>
                    {t('auth.haveCode', { defaultValue: 'Have a referral code?' })}
                  </AppText>
                </TouchableOpacity>
              ) : (
                <View style={styles.inputGroup}>
                  <AppText style={[styles.label, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('auth.referralCode', { defaultValue: 'Referral Code' })}
                  </AppText>
                  <AnimatedInputWrapper isFocused={referralFocused} borderColor={colors.border} primary={colors.primary}>
                    <View style={[styles.inputWrapper, { backgroundColor: inputBg, flexDirection: rowDir }]}>
                      <Ionicons name="gift-outline" size={20} color={referralFocused ? colors.primary : colors.placeholder} />
                      <TextInput allowFontScaling={false}
                        style={[styles.input, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}
                        placeholder={t('auth.referralPlaceholder', { defaultValue: 'Enter code (optional)' })}
                        placeholderTextColor={colors.placeholder}
                        value={referralCode}
                        onChangeText={setReferralCode}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        onFocus={() => setReferralFocused(true)}
                        onBlur={() => setReferralFocused(false)}
                      />
                    </View>
                  </AnimatedInputWrapper>
                </View>
              )}

              {/* ── Error ── */}
              {!!errorMessage && (
                <AppText style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{errorMessage}</AppText>
              )}

              {/* ── Continue ── */}
              <TouchableOpacity
                style={[styles.primaryButton, { shadowColor: colors.primary }]}
                onPress={handleContinue}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  style={styles.primaryButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <AppText style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}>
                    {t('auth.continue', { defaultValue: 'Continue' })}
                  </AppText>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean) => StyleSheet.create({
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
    paddingTop: 0,
  },
  body: {
    marginTop: -SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },

  // ── Floating Card ──
  glassCard: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    elevation: 6,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },

  // ── Inputs ──
  inputGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
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

  // ── Referral toggle ──
  referralToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  referralToggleText: {
    fontSize: 14,
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
    marginTop: SPACING.xs,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
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
});

export default AboutYouScreen;
