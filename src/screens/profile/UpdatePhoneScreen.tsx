/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect } from 'react';
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
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { t } = useTranslation();

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

    try {
      setLoading(true);
      setErrorMessage('');

      const cleanPhone = phone.replace(/\s/g, '');

      // Confirm the phone change with the OTP (sets + verifies the phone on the
      // Supabase auth user). No Firebase link/unlink needed.
      const { error } = await supabase.auth.verifyOtp({ phone: cleanPhone, token: otpCode, type: 'phone_change' });
      if (error) throw error;

      // Mirror onto the app's public.users row (what the app reads).
      await updateUserProfile({ phone: cleanPhone });
      await refreshUser();

      Alert.alert(
        hasExisting ? t('updatePhone.phoneUpdated') : t('updatePhone.phoneAdded'),
        hasExisting ? t('updatePhone.phoneUpdatedMessage') : t('updatePhone.phoneAddedMessage'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
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
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
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
            <Ionicons name="chevron-back" size={20} color={LUX.body} />
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
                  <Ionicons name="call-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
                  <TextInput allowFontScaling={false}
                    style={styles.input}
                    placeholder="+964 / +1 / +44 …"
                    placeholderTextColor={LUX.placeholder}
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
                  <ActivityIndicator color={LUX.surface} />
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
                  <ActivityIndicator color={LUX.surface} />
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
                <Text allowFontScaling={false} style={[styles.resendText, cooldown > 0 && { color: LUX.placeholder }]}>
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

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: LUX.surface,
    borderColor: LUX.border,
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 44,
  },
  container: {
    backgroundColor: LUX.bg,
    flex: 1,
  },
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
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
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: LUX.inputBg,
    borderColor: LUX.border,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    flexDirection: 'row',
    height: 54,
    paddingHorizontal: SPACING.md,
  },
  label: {
    color: LUX.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  otpBox: {
    backgroundColor: LUX.inputBg,
    borderColor: LUX.border,
    borderRadius: 14,
    borderWidth: 1,
    color: LUX.heading,
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
    color: LUX.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  quietButton: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  quietLink: {
    color: LUX.muted,
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
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  title: {
    color: LUX.heading,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
});

export default UpdatePhoneScreen;
