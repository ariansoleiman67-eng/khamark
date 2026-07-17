/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Keyboard,
  Dimensions,
  StatusBar,
  I18nManager,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
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
  Easing,
} from 'react-native-reanimated';
import { sendOTP, verifyOTP, resendOTP, validateOTPCode, linkPhone, mintSupabaseSessionFromFirebase } from '../../services/auth';
import { AuthService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RouteParams = RouteProp<RootStackParamList, 'VerifyPhone'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Static Design Tokens (theme colours come from useTheme) ─────────────
const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 14, button: 16, card: 26, back: 22, coin: 30 };

const ASANKARY_LOGO = require('../../../assets/images/asankarylogo.png');

// ─── Floating Particle (premium hero sparkle) ────────────────
const FloatingParticle = ({
  delay,
  x,
  size,
  duration,
}: { delay: number; x: number; size: number; duration: number }) => {
  const translateY = useSharedValue(SCREEN_HEIGHT + 20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(delay, withRepeat(withTiming(-50, { duration, easing: Easing.linear }), -1, false));
    opacity.value = withDelay(delay, withRepeat(
      withSequence(withTiming(0.55, { duration: duration * 0.3 }), withTiming(0.55, { duration: duration * 0.4 }), withTiming(0, { duration: duration * 0.3 })),
      -1, false
    ));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: x, width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.55)' },
        animatedStyle,
      ]}
    />
  );
};

const VerifyPhoneScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteParams>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { setRegistrationInProgress } = useAuth();
  const { theme, isDark } = useTheme();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

  const { mode, phone, name, storeName } = route.params || {};

  // ALL phone OTP (Iraq + international) now goes through Supabase. The send-sms-otp
  // Auth hook delivers Iraq via OTPIQ and everything else via Twilio, so the country
  // split lives server-side, not here. A real Supabase session is created at verify
  // time for every country, so register/forgot finish via updateUser downstream (no
  // Firebase round-trip / phone-otp-session minting needed). 'link' mode is excluded —
  // it links a phone identity (still via Firebase), it is not a login.
  const useSupabaseOtp =
    mode === 'otp-login' || mode === 'fallback' || mode === 'register' || mode === 'admin-register' || mode === 'partner-register' || mode === 'forgot_password';

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [error, setError] = useState('');

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const hasSentRef = useRef(false);
  const verifyingRef = useRef(false);     // hard guard against double-submit
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const focusBox = useCallback((i: number) => {
    requestAnimationFrame(() => inputRefs.current[i]?.focus());
  }, []);

  // One stable countdown — no interval re-creation each tick
  const startTimer = useCallback(() => {
    setTimer(60);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Send OTP on mount + start the timer once
  useEffect(() => {
    if (!hasSentRef.current) {
      hasSentRef.current = true;
      handleSendOTP();
      startTimer();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line
  }, []);

  const handleSendOTP = async () => {
    try {
      setLoading(true);
      setError('');
      if (useSupabaseOtp) {
        // Iraqi → Supabase OTP (delivered by OTPIQ)
        await AuthService.sendPhoneVerification(phone);
        setVerificationId('supabase');
      } else {
        const result = await sendOTP(phone);
        setVerificationId(result.verificationId);
      }
      focusBox(0);
    } catch (error: any) {
      const raw = String(error?.message || '');
      // A hook/provider 5xx means the SMS gateway (OTPIQ) couldn't deliver the code
      // (balance, API key, or rejected/unreachable number) — a delivery problem, NOT a
      // wrong code and NOT a rate limit. Show a friendly message instead of the raw
      // 'Unexpected status code returned from hook: 500'. Useful messages (e.g. the
      // rate-limit 'you can only request this after N seconds') don't match and pass through.
      setError(
        /hook|unexpected status|provider|\b5\d\d\b/i.test(raw)
          ? t('auth.errSendCodeFailed', { defaultValue: "We couldn't send a code to this number. Make sure it's correct and can receive SMS, then try again." })
          : raw || t('auth.otpSendFailed', { defaultValue: 'Failed to send code' }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setResending(true);
      setError('');
      setCode(['', '', '', '', '', '']);
      if (useSupabaseOtp) {
        await AuthService.sendPhoneVerification(phone);
        setVerificationId('supabase');
      } else {
        const result = await resendOTP(phone);
        setVerificationId(result.verificationId);
      }
      startTimer();
      focusBox(0);
    } catch (error: any) {
      const raw = String(error?.message || '');
      // Same classification as handleSendOTP: friendly message for hook/provider/5xx
      // delivery failures; raw passthrough for rate-limit and other useful errors (so
      // the 'you can only request after N seconds' cooldown reason is still shown).
      setError(
        /hook|unexpected status|provider|\b5\d\d\b/i.test(raw)
          ? t('auth.errSendCodeFailed', { defaultValue: "We couldn't send a code to this number. Make sure it's correct and can receive SMS, then try again." })
          : raw || t('auth.otpResendFailed', { defaultValue: 'Failed to resend code' }),
      );
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOTP = async (directCode?: string) => {
    if (verifyingRef.current) return;            // already verifying — ignore extra triggers
    try {
      const otpCode = directCode || code.join('');

      if (!validateOTPCode(otpCode)) {
        setError(t('auth.invalidCode', { defaultValue: 'Please enter the 6-digit code' }));
        return;
      }

      if (!verificationId) {
        setError(t('auth.requestNewCode', { defaultValue: 'Please request a new code' }));
        return;
      }

      verifyingRef.current = true;
      Keyboard.dismiss();
      setLoading(true);
      setError('');

      // Prevent the auth listener from yanking us to Main mid-setup (a Supabase session
      // appears the instant an Iraqi register/admin OTP is verified).
      if (mode === 'register' || mode === 'admin-register' || mode === 'partner-register') {
        setRegistrationInProgress(true);
      }

      // ── Verify the code: Iraqi → Supabase (OTPIQ, creates a session); else Firebase ──
      if (useSupabaseOtp) {
        await AuthService.verifyPhoneCode(phone, otpCode);
      } else if (mode === 'link') {
        await linkPhone(verificationId, otpCode);
      } else {
        await verifyOTP(verificationId, otpCode);
      }

      // International passwordless login (otp-login + the SignInScreen "Send OTP Code"
      // fallback): Firebase just proved the phone — exchange that proof for a real
      // Supabase session before we land in the app.
      if ((mode === 'otp-login' || mode === 'fallback') && !useSupabaseOtp) {
        await mintSupabaseSessionFromFirebase(phone);
      }

      // ── Route per mode (identical for both verification backends) ──
      if (mode === 'otp-login') {
        navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
      } else if (mode === 'register') {
        navigation.navigate('AboutYou' as any, { method: 'phone', phone });
      } else if (mode === 'admin-register') {
        navigation.navigate('AdminStoreName' as any, { method: 'phone', phone });
      } else if (mode === 'partner-register') {
        // Collect a login password next, then SetNewPassword creates the view-only partner.
        navigation.navigate('SetNewPassword' as any, { mode: 'partner-register', phone, name });
      } else if (mode === 'forgot_password') {
        navigation.navigate('SetNewPassword' as any, { mode: 'reset', phone });
      } else if (mode === 'fallback') {
        Alert.alert(
          t('auth.success'),
          t('auth.signedIn', { defaultValue: 'Signed in successfully!' }),
          [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] }) }]
        );
      } else if (mode === 'link') {
        const currentUser = await AuthService.getCurrentUser();
        if (currentUser) {
          await AuthService.updateUserProfile(currentUser.uid, { phone });
        }
        Alert.alert(t('auth.success'), 'Phone number linked successfully');
        navigation.goBack();
      }
    } catch (error: any) {
      // Verification failed — re-close the registration gate we optimistically opened
      // above (line ~240). Leaving registrationInProgress=true here permanently muzzles
      // AuthContext's auth listener, so a later successful sign-in never lands in the app.
      // Reset here (NOT in finally): on success the gate must stay open until the
      // downstream setup screen consumes it.
      if (mode === 'register' || mode === 'admin-register' || mode === 'partner-register') {
        setRegistrationInProgress(false);
      }
      // Smooth retry: clear the boxes, show inline error, refocus the first box
      setError(error.message || t('auth.verifyFailed', { defaultValue: 'Verification failed. Try again.' }));
      setCode(['', '', '', '', '', '']);
      focusBox(0);
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  };

  const handleCodeChange = (text: string, index: number) => {
    if (error) setError('');

    // Handle paste / SMS-autofill (multi-digit arriving in one box)
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      digits.forEach((digit, i) => {
        if (index + i < 6) newCode[index + i] = digit;
      });
      setCode(newCode);
      focusBox(Math.min(index + digits.length, 5));

      if (newCode.every(d => d !== '') && !verifyingRef.current) {
        handleVerifyOTP(newCode.join(''));   // pass directly — no stale closure, no timeout lag
      }
      return;
    }

    if (text && !/^\d$/.test(text)) return;

    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    if (text && index < 5) inputRefs.current[index + 1]?.focus();

    // Auto-submit the moment all 6 are present
    if (newCode.every(digit => digit !== '') && !verifyingRef.current) {
      handleVerifyOTP(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Particle data (confined to the amber hero)
  const particles = [
    { delay: 0, x: SCREEN_WIDTH * 0.12, size: 3, duration: 8500 },
    { delay: 1800, x: SCREEN_WIDTH * 0.32, size: 2, duration: 10500 },
    { delay: 900, x: SCREEN_WIDTH * 0.55, size: 3, duration: 9000 },
    { delay: 3200, x: SCREEN_WIDTH * 0.74, size: 2, duration: 11000 },
    { delay: 500, x: SCREEN_WIDTH * 0.88, size: 3, duration: 9500 },
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
            style={[styles.hero, { paddingTop: insets.top + SPACING.md }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Floating sparkles (clipped to hero) */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {particles.map((p, i) => (
                <FloatingParticle key={i} {...p} />
              ))}
            </View>

            {/* Back button (mirrored for RTL) */}
            <Animated.View entering={FadeIn.duration(400)} style={styles.backRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.textOnPrimary} />
              </TouchableOpacity>
            </Animated.View>

            {/* Logo coin */}
            <Animated.View
              entering={ZoomIn.duration(800).springify().damping(12)}
              style={styles.logoArea}
            >
              <View style={styles.logoCircle}>
                <Image source={ASANKARY_LOGO} style={styles.logoImage} contentFit="contain" />
              </View>
            </Animated.View>

            {/* Title + subtitle */}
            <Animated.Text
              allowFontScaling={false}
              entering={SlideInLeft.duration(600).delay(250)}
              style={styles.title}
            >
              {t('auth.verifyPhone.title', { defaultValue: 'Verify' })}
            </Animated.Text>
            <Animated.Text
              allowFontScaling={false}
              entering={FadeIn.duration(600).delay(420)}
              style={styles.subtitle}
            >
              {t('auth.verifyPhone.subtitle', {
                phone,
                defaultValue: `Enter the 6-digit code sent to ${phone}`,
              })}
            </Animated.Text>
          </LinearGradient>

          {/* ── Form Card (overlaps hero) ── */}
          <Animated.View
            entering={FadeInUp.duration(700).delay(300).springify().damping(14)}
            style={styles.glassCard}
          >
            {/* ── OTP Boxes ── */}
            <View style={styles.otpContainer}>
              {code.map((digit, index) => (
                <TextInput allowFontScaling={false}
                  key={index}
                  ref={(ref) => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.otpBox,
                    digit ? styles.otpBoxFilled : null,
                    focusedIndex === index && styles.otpBoxFocused,
                  ]}
                  value={digit}
                  onChangeText={(text) => handleCodeChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onFocus={() => setFocusedIndex(index)}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  selectTextOnFocus
                  editable={!loading}
                  returnKeyType="done"
                  placeholderTextColor={colors.placeholder}
                />
              ))}
            </View>

            {/* ── Inline error (smooth, no popup) ── */}
            {error ? <AppText style={styles.errorText}>{error}</AppText> : null}

            {/* ── Resend Row ── */}
            <View style={styles.resendRow}>
              {canResend ? (
                <TouchableOpacity onPress={handleResendOTP} disabled={resending} activeOpacity={0.6}>
                  {resending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <AppText style={styles.resendLink}>
                      {t('auth.resendCode', { defaultValue: 'Resend code' })}
                    </AppText>
                  )}
                </TouchableOpacity>
              ) : (
                <AppText style={styles.timerText}>
                  {t('auth.resendIn', { defaultValue: 'Resend in' })}{' '}
                  <AppText style={styles.timerAccent}>{formatTime(timer)}</AppText>
                </AppText>
              )}
            </View>

            {/* ── Confirm Button ── */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (loading || code.some(d => !d)) && styles.primaryButtonDisabled,
              ]}
              onPress={() => handleVerifyOTP()}
              disabled={loading || code.some(d => !d)}
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
                    {t('auth.verify', { defaultValue: 'Confirm' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Use a different phone/email ── */}
          <Animated.View entering={FadeIn.duration(400).delay(600)}>
            <TouchableOpacity
              onPress={() => navigation.navigate('SignIn' as any)}
              style={styles.quietButton}
              activeOpacity={0.6}
            >
              <AppText style={styles.quietLink}>
                {t('auth.useDifferent', { defaultValue: 'Use a different phone/email' })}
              </AppText>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) => {
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F4';
  const filledBg = isDark ? 'rgba(255,176,32,0.16)' : 'rgba(245,160,10,0.12)';

  return StyleSheet.create({
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
      flexDirection: isRTL ? 'row-reverse' : 'row',
      marginBottom: SPACING.sm,
      width: '100%',
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
      maxWidth: 320,
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

    // ── OTP Boxes ──
    otpContainer: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
      marginBottom: SPACING.lg,
      marginTop: SPACING.xs,
    },
    otpBox: {
      backgroundColor: inputBg,
      borderColor: colors.border,
      borderRadius: RADIUS.input,
      borderWidth: 1.5,
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      height: 58,
      includeFontPadding: false,
      paddingVertical: 0,
      textAlign: 'center',
      textAlignVertical: 'center',
      width: 46,
    },
    otpBoxFilled: {
      backgroundColor: filledBg,
      borderColor: colors.primary,
    },
    otpBoxFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
    },

    // ── Inline error ──
    errorText: {
      color: colors.error,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      marginBottom: SPACING.md,
      textAlign: 'center',
    },

    // ── Resend ──
    resendRow: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    resendLink: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    timerText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    timerAccent: {
      color: colors.primary,
      fontWeight: '700',
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

    // ── Quiet Link ──
    quietButton: {
      alignItems: 'center',
      marginTop: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    quietLink: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
};

export default VerifyPhoneScreen;
