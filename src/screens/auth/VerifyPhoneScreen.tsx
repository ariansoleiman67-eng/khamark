/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Keyboard,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendOTP, verifyOTP, resendOTP, validateOTPCode, linkPhone, mintSupabaseSessionFromFirebase } from '../../services/auth';
import { AuthService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RouteParams = RouteProp<RootStackParamList, 'VerifyPhone'>;

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  inputBg: '#F4F6F9',
  accent: '#FF7622',
  accentSoft: '#FF762215',
  heading: '#1A1D26',
  body: '#32343E',
  muted: '#8F95A3',
  placeholder: '#B0B5C3',
  border: '#E8ECF0',
  error: '#E84855',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };

const VerifyPhoneScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteParams>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { setRegistrationInProgress } = useAuth();

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Back Button ── */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color={LUX.body} />
          </TouchableOpacity>

          {/* ── Headline ── */}
          <AppText style={styles.title}>
            {t('auth.verifyPhone.title', { defaultValue: 'Verify' })}
          </AppText>
          <AppText style={styles.subtitle}>
            {t('auth.verifyPhone.subtitle', {
              phone,
              defaultValue: `Enter the 6-digit code sent to ${phone}`,
            })}
          </AppText>

          {/* ── Luxury OTP Boxes ── */}
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
                  <ActivityIndicator size="small" color={LUX.accent} />
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
            {loading ? (
              <ActivityIndicator color={LUX.surface} />
            ) : (
              <AppText style={styles.primaryButtonText}>
                {t('auth.verify', { defaultValue: 'Confirm' })}
              </AppText>
            )}
          </TouchableOpacity>

          {/* ── Use a different phone/email ── */}
          <TouchableOpacity
            onPress={() => navigation.navigate('SignIn' as any)}
            style={styles.quietButton}
            activeOpacity={0.6}
          >
            <AppText style={styles.quietLink}>
              {t('auth.useDifferent', { defaultValue: 'Use a different phone/email' })}
            </AppText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUX.bg,
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },

  // ── Back ──
  backButton: {
    alignItems: 'center',
    backgroundColor: LUX.surface,
    borderColor: LUX.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    width: 44,
  },

  // ── Typography ──
  title: {
    color: LUX.heading,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },

  // ── OTP Boxes (luxury) ──
  otpContainer: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  otpBox: {
    backgroundColor: LUX.inputBg,
    borderColor: LUX.border,
    borderRadius: 14,
    borderWidth: 1.5,
    color: LUX.heading,
    fontSize: 22,
    fontWeight: '700',
    height: 56,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    width: 48,
  },
  otpBoxFilled: {
    backgroundColor: LUX.accentSoft,
    borderColor: LUX.accent,
  },
  otpBoxFocused: {
    borderColor: LUX.accent,
    shadowColor: LUX.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },

  // ── Inline error ──
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },

  // ── Resend ──
  resendRow: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  resendLink: {
    color: LUX.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  timerText: {
    color: LUX.muted,
    fontSize: 14,
  },
  timerAccent: {
    color: LUX.accent,
    fontWeight: '700',
  },

  // ── Primary Button ──
  primaryButton: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: LUX.surface,
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Quiet Link ──
  quietButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  quietLink: {
    color: LUX.muted,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default VerifyPhoneScreen;
