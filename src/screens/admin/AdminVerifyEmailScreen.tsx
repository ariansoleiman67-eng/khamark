/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import { supabase } from '../../services/supabase';
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
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../components/ThemeProvider';
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
  success: '#2ECC71',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { input: 14, button: 18, back: 22 };

/**
 * Admin Email OTP Verification Screen
 * 6-digit boxes with auto-advance, paste support, resend timer.
 */
const AdminVerifyEmailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

  const email = route.params?.email || '';

  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // 60s to match the backend's 60s minimum between code sends (index.ts sendAdminEmailOTP).
  // A shorter UI cooldown would let the user tap Resend before the server allows it → error.
  const [cooldown, setCooldown] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  // Synchronous re-entrancy guards. `loading`/`resending` state commits after a
  // re-render, so a same-frame double-tap (or an auto-submit racing a Confirm tap)
  // would otherwise fire two verifyOtp/signInWithOtp calls before `disabled` applies.
  const verifyingRef = useRef(false);
  const resendingRef = useRef(false);

  // Countdown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Mask email
  const maskEmail = (e: string) => {
    if (!e) return '';
    const [local, domain] = e.split('@');
    if (!domain) return e;
    return `${local.slice(0, 2)}***@${domain}`;
  };

  const handleChange = (text: string, index: number) => {
    setErrorMessage('');

    // Handle paste (6-digit code)
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (i + index < 6) newCode[i + index] = d;
      });
      setCode(newCode);
      const focusIndex = Math.min(index + digits.length, 5);
      inputRefs.current[focusIndex]?.focus();
      if (newCode.every(c => c !== '')) {
        handleVerify(newCode);
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = text.replace(/\D/g, '');
    setCode(newCode);

    // Auto-advance
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 filled
    if (text && newCode.every(c => c !== '')) {
      handleVerify(newCode);
    }
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleVerify = async (codeArray?: string[]) => {
    if (verifyingRef.current) return;
    const otpCode = (codeArray || code).join('');
    if (otpCode.length !== 6) {
      setErrorMessage(t('auth.adminSetup.require6Digits'));
      return;
    }

    try {
      verifyingRef.current = true;
      setLoading(true);
      // Supabase verifies the emailed 6-digit code and creates a session for this
      // email; registerWithEmail later finishes the account on that session.
      const { error: vErr } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' });
      if (vErr) throw vErr;
      navigation.navigate('AdminStoreName' as any, {
        method: 'email',
        email,
      });
    } catch (error: any) {
      const message = error.message || t('common.error');
      if (message.includes('expired')) {
        setErrorMessage(t('auth.adminSetup.codeExpired'));
      } else if (message.includes('Incorrect')) {
        setErrorMessage(t('auth.adminSetup.incorrectCode'));
      } else if (message.includes('Too many')) {
        setErrorMessage(t('auth.adminSetup.tooManyAttempts'));
      } else {
        setErrorMessage(message);
      }
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resendingRef.current) return;
    try {
      resendingRef.current = true;
      setResending(true);
      setErrorMessage('');
      const { error: rErr } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (rErr) throw rErr;
      setCooldown(60);
    } catch (error: any) {
      setErrorMessage(error.message || t('common.error'));
    } finally {
      resendingRef.current = false;
      setResending(false);
    }
  };

  const handleBack = () => navigation.goBack();

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

          {/* ── Badge ── */}
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('auth.adminSetup.badge')}</Text>
          </View>

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{t('auth.adminSetup.enterCodeTitle')}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            {t('auth.adminSetup.sentTo', { contact: maskEmail(email) })}
          </Text>

          {/* ── OTP Boxes ── */}
          <View style={styles.otpContainer}>
            {code.map((digit, index) => (
              <TextInput allowFontScaling={false}
                key={index}
                ref={ref => { inputRefs.current[index] = ref; }}
                style={[
                  styles.otpBox,
                  digit ? styles.otpBoxFilled : undefined,
                ]}
                value={digit}
                onChangeText={text => handleChange(text, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={index === 0 ? 6 : 1}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                autoFocus={index === 0}
                selectTextOnFocus
              />
            ))}
          </View>

          {/* ── Error ── */}
          {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

          {/* ── Confirm ── */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={() => handleVerify()}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('auth.adminSetup.confirm')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleResend}
            disabled={cooldown > 0 || resending}
            style={styles.resendButton}
            activeOpacity={0.6}
          >
            {resending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text allowFontScaling={false} style={[styles.resendText, cooldown > 0 && { color: colors.placeholder }]}>
                {cooldown > 0
                  ? t('auth.adminSetup.resendIn', { seconds: String(cooldown).padStart(2, '0') })
                  : t('auth.adminSetup.resend')}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Different email ── */}
          <TouchableOpacity onPress={handleBack} style={styles.quietButton} activeOpacity={0.6}>
            <Text allowFontScaling={false} style={styles.quietLink}>{t('auth.adminSetup.differentEmail')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) => {
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : LUX.inputBg;
  const badgeBg = isDark ? 'rgba(255,118,34,0.18)' : '#FF762212';
  const filledBg = isDark ? 'rgba(255,118,34,0.16)' : '#FF762208';

  return StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 44,
  },
  badge: {
    alignItems: 'center',
    alignSelf: isRTL ? 'flex-end' : 'flex-start',
    backgroundColor: badgeBg,
    borderRadius: 20,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    gap: 6,
    marginBottom: SPACING.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
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
    textAlign: 'center',
  },
  otpBox: {
    backgroundColor: inputBg,
    borderColor: colors.border,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    height: 56,
    textAlign: 'center',
    width: 48,
  },
  otpBoxFilled: {
    backgroundColor: filledBg,
    borderColor: colors.primary,
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
    backgroundColor: colors.primary,
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
    color: colors.primary,
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
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
    textAlign: isRTL ? 'right' : 'left',
  },
  });
};

export default AdminVerifyEmailScreen;
