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
import { isPhoneRegistered, isEmailRegistered } from '../../services/auth';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { useUserRegion } from '../../hooks/useUserRegion';
import { useAuth } from '../../contexts/AuthContext';
import { signInWithGoogle, isGoogleSignInAvailable } from '../../services/auth';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RegisterMethod = 'phone' | 'email';

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
  heading: '#FFFFFF',
  body: 'rgba(255,255,255,0.9)',
  muted: 'rgba(255,255,255,0.5)',
  placeholder: 'rgba(255,255,255,0.3)',
  error: '#FF6B6B',
  google: '#EA4335',
  apple: '#FFFFFF',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 14, button: 16, segment: 14, segmentPill: 12, card: 24, back: 22, social: 28 };

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

// ─── Email Input with Focus Animation ────────────────────
const RegisterEmailInput = ({ email, setEmail, setErrorMessage, t }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={regEmailStyles.group}>
      <AppText style={regEmailStyles.label}>
        {t('auth.emailAddress', { defaultValue: 'Email Address' })}
      </AppText>
      <AnimatedInputWrapper isFocused={isFocused}>
        <View style={regEmailStyles.wrapper}>
          <Ionicons name="mail-outline" size={18} color={isFocused ? LUX.accent : LUX.placeholder} style={{ marginRight: 12 }} />
          <TextInput allowFontScaling={false}
            style={regEmailStyles.input}
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

const regEmailStyles = StyleSheet.create({
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
const RegisterPhoneAnimated = ({ phone, setPhone, setErrorMessage, setSelectedCountry, defaultCountry, t }: any) => {
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

const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const userRegion = useUserRegion();
  const { signInWithApple, isAppleAvailable } = useAuth();

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

          {/* User icon */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.iconArea}>
            <View style={styles.userCircle}>
              <Ionicons name="person-add" size={32} color={LUX.accent} />
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.Text allowFontScaling={false} entering={SlideInLeft.duration(500).delay(300)} style={styles.title}>
            {t('auth.createAccount', { defaultValue: 'Create account' })}
          </Animated.Text>
          <Animated.Text allowFontScaling={false} entering={FadeIn.duration(500).delay(400)} style={styles.subtitle}>
            {t('auth.createAccountSubtitle', { defaultValue: 'Start with your phone or email.' })}
          </Animated.Text>

          {/* Glass Card */}
          <Animated.View entering={FadeInUp.duration(600).delay(400).springify().damping(14)} style={styles.glassCard}>
            {/* Segmented Control */}
            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[styles.segmentButton, registerMethod === 'phone' && styles.segmentButtonActive]}
                onPress={() => { setRegisterMethod('phone'); setErrorMessage(''); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="call-outline"
                  size={16}
                  color={registerMethod === 'phone' ? '#fff' : LUX.muted}
                  style={{ marginRight: 6 }}
                />
                <AppText style={[styles.segmentText, registerMethod === 'phone' && styles.segmentTextActive]}>
                  {t('auth.phone', { defaultValue: 'Phone' })}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, registerMethod === 'email' && styles.segmentButtonActive]}
                onPress={() => { setRegisterMethod('email'); setErrorMessage(''); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={registerMethod === 'email' ? '#fff' : LUX.muted}
                  style={{ marginRight: 6 }}
                />
                <AppText style={[styles.segmentText, registerMethod === 'email' && styles.segmentTextActive]}>
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
              />
            ) : (
              <RegisterEmailInput
                email={email}
                setEmail={setEmail}
                setErrorMessage={setErrorMessage}
                t={t}
              />
            )}

            {/* Error */}
            {!!errorMessage && <AppText style={styles.errorText}>{errorMessage}</AppText>}

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

          {/* ── Divider ── */}
          <Animated.View entering={FadeIn.duration(400).delay(600)} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <AppText style={styles.dividerText}>{t('common.or', { defaultValue: 'or' })}</AppText>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* ── Social sign-up ── */}
          <Animated.View entering={FadeInDown.duration(600).delay(650)} style={styles.socialRow}>
            {isGoogleSignInAvailable() && (
              <TouchableOpacity style={[styles.socialButton, { backgroundColor: LUX.google }]} onPress={handleGoogleSignIn} disabled={googleLoading || appleLoading} activeOpacity={0.85}>
                {googleLoading ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={styles.socialIcon}>G</AppText>}
              </TouchableOpacity>
            )}
            {Platform.OS === 'ios' && isAppleAvailable && (
              <TouchableOpacity style={[styles.socialButton, { backgroundColor: LUX.apple }]} onPress={handleAppleSignIn} disabled={googleLoading || appleLoading} activeOpacity={0.85}>
                {appleLoading ? <ActivityIndicator color="#000" size="small" /> : <Ionicons name="logo-apple" size={22} color="#000" />}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Sign In link */}
          <Animated.View entering={FadeIn.duration(400).delay(700)}>
            <TouchableOpacity onPress={handleSignIn} style={styles.quietLinkRow} activeOpacity={0.6}>
              <AppText style={styles.quietText}>
                {t('auth.haveAccount', { defaultValue: 'Already have an account?' })}{' '}
              </AppText>
              <AppText style={styles.quietLink}>
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
  dividerRow: { alignItems: 'center', flexDirection: 'row', marginVertical: SPACING.lg },
  dividerLine: { backgroundColor: LUX.glassBorder, flex: 1, height: 1 },
  dividerText: { color: LUX.muted, fontSize: 13, marginHorizontal: SPACING.md, paddingHorizontal: 6, textAlign: 'center' },
  socialRow: { flexDirection: 'row', gap: SPACING.md, justifyContent: 'center' },
  socialButton: { alignItems: 'center', borderRadius: RADIUS.social, height: 56, justifyContent: 'center', width: 56 },
  socialIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
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
  userCircle: {
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

  // Segmented Control
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

  // Input
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

  // Error
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.sm,
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
});

export default RegisterScreen;
