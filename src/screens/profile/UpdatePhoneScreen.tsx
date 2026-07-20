/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  I18nManager,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import ReauthModal, { ReauthModalHandle } from '../../components/ReauthModal';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  inputBg: '#F4F6F9',
  accent: '#FF7622',
  heading: '#1A1D26',
  body: '#32343E',
  muted: '#8F95A3',
  placeholder: '#B0B5C3',
  border: '#E8ECF0',
  error: '#E84855',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { input: 18, button: 18, back: 22 };

/**
 * Update / Add Phone Screen
 * Step 1: Enter phone → Send code
 * Step 2: OTP → Verify → Link phone → toast & go back
 *
 * Route params:
 *   hasExisting: boolean (true = update, false = add)
 */
const UpdatePhoneScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { updateUserProfile, refreshUser } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : LUX.inputBg;
  const styles = useMemo(() => createStyles(colors, isRTL, inputBg), [colors, isRTL, inputBg]);

  const hasExisting = route.params?.hasExisting ?? false;

  const reauthRef = useRef<ReauthModalHandle>(null);

  // Step 1 state — start at '+' (not '+964') so an admin can add ANY country's
  // number; they type the full international number including its country code.
  const [phone, setPhone] = useState('+');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [verificationId, setVerificationId] = useState('');

  // Step 2 OTP state
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Synchronous in-flight guard shared by the async submit handlers (verify /
  // resend). `loading` is React state and only flips on the next render, so it
  // can't block a second call dispatched within the same frame.
  const busyRef = useRef(false);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const maskPhone = (p: string) => {
    if (!p || p.length <= 5) return p;
    return `${p.slice(0, 4)} ••• ${p.slice(-2)}`;
  };

  const handleSendCode = async () => {
    const cleanPhone = phone.replace(/\s/g, '');
    if (!cleanPhone || cleanPhone.replace(/[^0-9]/g, '').length < 8) {
      setErrorMessage(t('updatePhone.invalidPhone'));
      return;
    }

    // Same guard handleVerify and handleResend already use, and for the same reason
    // this file documents above: `loading` is state and lands a render later, so two
    // taps in one frame both reach updateUser({ phone }). That sends two SMS; the
    // second is usually rejected by the 60s rate limit and its raw error paints a
    // red "you can only request this after N seconds" on the OTP step the first tap
    // just navigated to — beside a running countdown, while the SMS did arrive. If
    // both succeed instead, only the newer code verifies and the first one the user
    // reads is rejected as incorrect.
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      setLoading(true);
      setErrorMessage('');

      // Supabase-native phone change: sends the OTP to the new number via the
      // send-sms-otp hook (OTPIQ for Iraq, Twilio for international) — same routing
      // as login. Requires "Enable phone confirmations" in the dashboard.
      const { error } = await supabase.auth.updateUser({ phone: cleanPhone });
      if (error) throw error;
      setVerificationId('supabase');
      setStep('otp');
      setCooldown(30);
    } catch (error: any) {
      const raw = String(error?.message || '');
      setErrorMessage(
        /hook|unexpected status|provider|\b5\d\d\b/i.test(raw)
          ? t('auth.errSendCodeFailed', { defaultValue: "We couldn't send a code to this number. Make sure it's correct and can receive SMS, then try again." })
          : raw || t('updatePhone.resendFailed', { defaultValue: 'Failed to send code' })
      );
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  // ─── Step 2: OTP Handling ──────────────────────────────
  const handleOTPChange = (text: string, index: number) => {
    setErrorMessage('');

    // Handle paste
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (i + index < 6) newCode[i + index] = d;
      });
      setCode(newCode);
      const focusIndex = Math.min(index + digits.length, 5);
      inputRefs.current[focusIndex]?.focus();
      if (newCode.every(c => c !== '')) handleVerify(newCode);
      return;
    }

    const newCode = [...code];
    newCode[index] = text.replace(/\D/g, '');
    setCode(newCode);
    if (text && index < 5) inputRefs.current[index + 1]?.focus();
    if (text && newCode.every(c => c !== '')) handleVerify(newCode);
  };

  const handleOTPKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleVerify = async (codeArray?: string[]) => {
    const otpCode = (codeArray || code).join('');
    if (otpCode.length !== 6) {
      setErrorMessage(t('updatePhone.enterCode'));
      return;
    }

    // Auto-verify fires the instant the 6th digit lands, and the OTP boxes stay
    // interactive during the request — without a synchronous guard a second
    // tap/re-type would call verifyOtp again with an already-consumed token and
    // surface a false "incorrect code" over a successful verification.
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      setLoading(true);
      setErrorMessage('');

      const cleanPhone = phone.replace(/\s/g, '');

      // Confirm the phone change with the OTP (sets + verifies the phone on the
      // Supabase auth user). No Firebase link/unlink needed.
      const { error } = await supabase.auth.verifyOtp({ phone: cleanPhone, token: otpCode, type: 'phone_change' });
      if (error) throw error;

      // The phone is now changed & verified on the Supabase auth user. Mirroring
      // it onto the app's public.users row is a best-effort follow-up: if it
      // fails the verification still succeeded, so don't clear the code or report
      // it as a wrong/expired code — the OTP is already consumed and re-entering
      // or resending would only confuse the user.
      try {
        await updateUserProfile({ phone: cleanPhone });
        await refreshUser();
      } catch (syncError) {
        console.warn('[UpdatePhone] profile mirror failed after successful verify:', syncError);
      }

      Alert.alert(
        hasExisting ? t('updatePhone.phoneUpdated') : t('updatePhone.phoneAdded'),
        hasExisting ? t('updatePhone.phoneUpdatedMessage') : t('updatePhone.phoneAddedMessage'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      // Reached only when verifyOtp itself fails (wrong / expired / reused code).
      const raw = String(error?.message || '');
      if (/already|registered|in use|exists/i.test(raw)) {
        setErrorMessage(t('updatePhone.alreadyInUse', { defaultValue: 'This number is already on another account.' }));
      } else if (/invalid|expired|token|otp/i.test(raw)) {
        setErrorMessage(t('updatePhone.incorrectCode', { defaultValue: 'Incorrect or expired code.' }));
      } else {
        setErrorMessage(raw || t('updatePhone.resendFailed', { defaultValue: 'Something went wrong. Please try again.' }));
      }
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    // Same synchronous re-entrancy guard as handleVerify (busyRef is shared by
    // both submit handlers). `cooldown` is React state and won't flip until the
    // next render, so two taps within one frame would otherwise both pass the
    // cooldown check and fire a duplicate updateUser → duplicate SMS.
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      setLoading(true);
      const cleanPhone = phone.replace(/\s/g, '');
      const { error } = await supabase.auth.updateUser({ phone: cleanPhone });
      if (error) throw error;
      setCooldown(30);
      setErrorMessage('');
    } catch (error: any) {
      setErrorMessage(error.message || t('updatePhone.resendFailed', { defaultValue: 'Failed to resend code' }));
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  const handleBack = () => {
    if (step === 'otp') {
      setStep('phone');
      setCode(['', '', '', '', '', '']);
      setErrorMessage('');
    } else {
      navigation.goBack();
    }
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
          {/* ── Back ── */}
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.text} />
          </TouchableOpacity>

          {step === 'phone' ? (
            <>
              {/* ── Step 1: Enter Phone ── */}
              <Text allowFontScaling={false} style={styles.title}>{hasExisting ? t('updatePhone.updateTitle') : t('updatePhone.addTitle')}</Text>
              <Text allowFontScaling={false} style={styles.subtitle}>
                {hasExisting
                  ? t('updatePhone.updateSubtitle')
                  : t('updatePhone.addSubtitle')}
              </Text>

              <View style={styles.inputGroup}>
                <Text allowFontScaling={false} style={styles.label}>{t('updatePhone.phoneNumber')}</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={18} color={colors.placeholder} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />
                  <TextInput allowFontScaling={false}
                    style={styles.input}
                    placeholder="+964 / +1 / +44 …"
                    placeholderTextColor={colors.placeholder}
                    value={phone}
                    onChangeText={(text) => { setPhone(text); setErrorMessage(''); }}
                    keyboardType="phone-pad"
                    autoFocus
                  />
                </View>
              </View>

              {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('updatePhone.sendCode')}</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* ── Step 2: OTP ── */}
              <Text allowFontScaling={false} style={styles.title}>{t('updatePhone.enterCodeTitle')}</Text>
              <Text allowFontScaling={false} style={styles.subtitle}>
                {t('updatePhone.sentTo', { phone: maskPhone(phone.replace(/\s/g, '')) })}
              </Text>

              <View style={styles.otpContainer}>
                {code.map((digit, index) => (
                  <TextInput allowFontScaling={false}
                    key={index}
                    ref={ref => { inputRefs.current[index] = ref; }}
                    style={[styles.otpBox, digit ? styles.otpBoxFilled : undefined]}
                    value={digit}
                    onChangeText={text => handleOTPChange(text, index)}
                    onKeyPress={e => handleOTPKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={index === 0 ? 6 : 1}
                    autoFocus={index === 0}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    selectTextOnFocus
                    editable={!loading}
                  />
                ))}
              </View>

              {!!errorMessage && <Text allowFontScaling={false} style={[styles.errorText, { textAlign: 'center' }]}>{errorMessage}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={() => handleVerify()}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('updatePhone.confirm')}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResend}
                disabled={cooldown > 0}
                style={styles.resendButton}
                activeOpacity={0.6}
              >
                <Text allowFontScaling={false} style={[styles.resendText, cooldown > 0 && { color: colors.placeholder }]}>
                  {cooldown > 0
                    ? t('updatePhone.resendIn', { seconds: String(cooldown).padStart(2, '0') })
                    : t('updatePhone.resendCode')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleBack} style={styles.quietButton} activeOpacity={0.6}>
                <Text allowFontScaling={false} style={styles.quietLink}>{t('updatePhone.differentNumber')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ReauthModal ref={reauthRef} />
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, inputBg: string) => StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 44,
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
    textAlign: isRTL ? 'right' : 'left',
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
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: inputBg,
    borderColor: colors.border,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    height: 54,
    paddingHorizontal: SPACING.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
    textAlign: isRTL ? 'right' : 'left',
  },
  otpBox: {
    backgroundColor: inputBg,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    height: 56,
    width: 48,
    textAlign: 'center',
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  otpBoxFilled: {
    backgroundColor: '#FF762208',
    borderColor: LUX.accent,
  },
  otpContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: RADIUS.button,
    height: 52,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  quietButton: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  quietLink: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  resendButton: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  resendText: {
    color: LUX.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
    textAlign: isRTL ? 'right' : 'left',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
    textAlign: isRTL ? 'right' : 'left',
  },
});

export default UpdatePhoneScreen;
