/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { isSyntheticEmail } from '../../utils/hashUtils';
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
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { AuthService } from '../../services/authService';
import { 
  getAuthState, 
  setPassword, 
  mapFirebaseError, 
  sendOTP, 
  verifyOTP, 
  resetPasswordAfterOTP, 
  sendPasswordResetEmail,
  reloadUser 
} from '../../services/auth';
import ReauthModal, { ReauthModalHandle } from '../../components/ReauthModal';
import { useTheme } from '../../components/ThemeProvider';

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
const RADIUS = { input: 18, button: 18, back: 22 };

type Step = 'change' | 'choose' | 'otp' | 'newPass' | 'emailSent';

/**
 * Luxury Change Password Screen
 *
 * Main flow: Current → New → Confirm → toast
 * Forgot flow:
 *   1. Choose method (Phone OTP / Email link)
 *   2a. Phone → OTP → New password → done
 *   2b. Email → "Check your inbox" → done
 */
const ChangePasswordScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { theme, isDark } = useTheme();
  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);
  const reauthRef = useRef<ReauthModalHandle>(null);
  // Synchronous in-flight guard for async network actions (OTP SMS / reset email are
  // billable). State-based `disabled`/`loading` guards only take effect after a
  // re-render, leaving a window where two queued taps both fire the side effect.
  const inFlightRef = useRef(false);

  // ─── Step state ────────────────────────────────────────
  const [step, setStep] = useState<Step>('change');

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // OTP fields
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [verificationId, setVerificationId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // New password (after OTP)
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNew, setShowResetNew] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Derived
  const authState = getAuthState();
  const hasPassword = authState.hasPassword;
  const isSetPasswordFlow = !hasPassword;

  const authEmailStr = authState.email || '';
  const fsEmailStr = user?.email || '';
  const authIsInternal = isSyntheticEmail(authEmailStr) || authEmailStr.includes('@asankaryapp.');
  const fsIsInternal = isSyntheticEmail(fsEmailStr) || fsEmailStr.includes('@asankaryapp.');

  // Prefer Auth email if real, otherwise Firestore email if real.
  const userEmail = (!authIsInternal && authEmailStr) 
    ? authEmailStr 
    : (!fsIsInternal && fsEmailStr) ? fsEmailStr : authEmailStr || fsEmailStr;

  const userPhone = user?.phone || authState.phone || '';
  const isInternalEmail = isSyntheticEmail(userEmail) || userEmail.includes('@asankaryapp.');
  const hasRealEmail = !!userEmail && !isInternalEmail;
  const hasPhone = !!userPhone;

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ─── Password Strength ────────────────────────────────
  const getStrength = (pw: string) => {
    if (!pw) return { level: 0, label: '', color: LUX.border };
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: t('profile.passwordScreen.strength.weak'), color: LUX.error };
    if (score <= 2) return { level: 2, label: t('profile.passwordScreen.strength.fair'), color: '#F5A623' };
    if (score <= 3) return { level: 3, label: t('profile.passwordScreen.strength.good'), color: '#4A90D9' };
    return { level: 4, label: t('profile.passwordScreen.strength.strong'), color: LUX.success };
  };

  // Mask helpers
  const maskEmail = (e: string) => {
    if (!e) return '';
    const [local, domain] = e.split('@');
    if (!domain) return e;
    return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
  };
  const maskPhone = (p: string) => {
    if (!p || p.length <= 5) return p;
    return `${p.slice(0, 4)} ••• ${p.slice(-2)}`;
  };

  // ═══════════════════════════════════════════════════════
  // STEP: CHANGE (main change password)
  // ═══════════════════════════════════════════════════════
  const handleChangePassword = async () => {
    setErrorMessage('');
    if (!currentPassword.trim()) { setErrorMessage(t('profile.passwordScreen.errors.enterCurrent')); return; }
    if (!newPassword.trim()) { setErrorMessage(t('profile.passwordScreen.errors.enterNew')); return; }
    if (newPassword.length < 6) { setErrorMessage(t('profile.passwordScreen.errors.tooShort')); return; }
    if (newPassword !== confirmPassword) { setErrorMessage(t('profile.passwordScreen.errors.mismatch')); return; }

    try {
      setLoading(true);
      await AuthService.changePassword(currentPassword, newPassword);
      Alert.alert(t('profile.passwordScreen.passwordUpdated'), t('profile.passwordScreen.passwordUpdatedMsg'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      const msg = error.message || '';
      const code = error.code || '';
      if (msg.includes('wrong-password') || msg.includes('invalid-credential') || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErrorMessage(t('profile.passwordScreen.errors.wrongPassword'));
      } else if (msg.includes('requires-recent-login') || code.includes('requires-recent-login')) {
        // Use ReauthModal instead of navigating to ConfirmIdentity
        try {
          await reauthRef.current?.requestReauth();
          // Retry after reauth
          await AuthService.changePassword(currentPassword, newPassword);
          Alert.alert(t('profile.passwordScreen.passwordUpdated'), t('profile.passwordScreen.passwordUpdatedMsg'), [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } catch (reauthError: any) {
          if (reauthError.message !== 'Reauth cancelled') {
            setErrorMessage(mapFirebaseError(reauthError));
          }
        }
      } else {
        setErrorMessage(mapFirebaseError(error));
      }
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════
  // STEP: SET PASSWORD (for social-only users)
  // ═══════════════════════════════════════════════════════
  const handleSetPassword = async () => {
    setErrorMessage('');
    if (!newPassword.trim()) { setErrorMessage(t('profile.passwordScreen.errors.enterPassword')); return; }
    if (newPassword.length < 6) { setErrorMessage(t('profile.passwordScreen.errors.tooShort')); return; }
    if (newPassword !== confirmPassword) { setErrorMessage(t('profile.passwordScreen.errors.mismatch')); return; }

    if (isInternalEmail) {
      Alert.alert(
        t('profile.passwordScreen.emailRequired'),
        t('profile.passwordScreen.emailRequiredMsg'),
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: t('profile.passwordScreen.addEmail'), 
            onPress: () => {
              navigation.goBack();
              setTimeout(() => navigation.navigate('UpdateEmail' as never), 300);
            }
          }
        ]
      );
      return;
    }

    try {
      setLoading(true);
      await setPassword(userEmail, newPassword, async () => {
        await reauthRef.current?.requestReauth();
      });
      await reloadUser();
      await refreshUser();
      Alert.alert(t('profile.passwordScreen.passwordSet'), t('profile.passwordScreen.passwordSetMsg'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      if (error.message === 'Reauth cancelled') return;
      if (error.message?.includes('email address is required before setting a password')) {
        Alert.alert(
          t('profile.passwordScreen.emailRequired'),
        t('profile.passwordScreen.emailRequiredVerifyMsg'),
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: t('profile.passwordScreen.addEmail'), 
              onPress: () => {
                navigation.goBack();
                setTimeout(() => navigation.navigate('UpdateEmail' as never), 300);
              }
            }
          ]
        );
      } else {
        setErrorMessage(mapFirebaseError(error));
      }
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════
  // STEP: CHOOSE (forgot → pick method)
  // ═══════════════════════════════════════════════════════
  const handleForgotPassword = () => {
    setErrorMessage('');
    if (!hasPhone && !hasRealEmail) {
      Alert.alert(t('profile.passwordScreen.noRecovery'), t('profile.passwordScreen.noRecoveryMsg'));
      return;
    }
    // If only one method, go directly
    if (hasPhone && !hasRealEmail) { handleSendPhoneOTP(); return; }
    if (!hasPhone && hasRealEmail) { handleSendEmailReset(); return; }
    // Both available → show choice
    setStep('choose');
  };

  // ─── Phone OTP path ───────────────────────────────────
  const handleSendPhoneOTP = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      setErrorMessage('');
      const result = await sendOTP(userPhone);
      setVerificationId(result.verificationId);
      setStep('otp');
      setCooldown(30);
    } catch (error: any) {
      setErrorMessage(error.message || t('profile.passwordScreen.errors.failedSendCode'));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  // ─── Email reset path ─────────────────────────────────
  const handleSendEmailReset = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      setErrorMessage('');
      await sendPasswordResetEmail(userEmail);
      setStep('emailSent');
    } catch (error: any) {
      setErrorMessage(error.message || t('profile.passwordScreen.errors.failedSendEmail'));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════
  // STEP: OTP verification
  // ═══════════════════════════════════════════════════════
  const handleOTPChange = (text: string, index: number) => {
    setErrorMessage('');
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      digits.forEach((d, i) => { if (i + index < 6) newCode[i + index] = d; });
      setCode(newCode);
      const focusIndex = Math.min(index + digits.length, 5);
      inputRefs.current[focusIndex]?.focus();
      if (newCode.every(c => c !== '')) handleVerifyOTP(newCode);
      return;
    }
    const newCode = [...code];
    newCode[index] = text.replace(/\D/g, '');
    setCode(newCode);
    if (text && index < 5) inputRefs.current[index + 1]?.focus();
    if (text && newCode.every(c => c !== '')) handleVerifyOTP(newCode);
  };

  const handleOTPKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleVerifyOTP = async (codeArray?: string[]) => {
    const otpCode = (codeArray || code).join('');
    if (otpCode.length !== 6) { setErrorMessage(t('profile.passwordScreen.errors.enterCode')); return; }

    try {
      setLoading(true);
      await verifyOTP(verificationId, otpCode);
      // OTP verified → now set new password
      setStep('newPass');
    } catch (error: any) {
      setErrorMessage(error.message || t('profile.passwordScreen.errors.incorrectCode'));
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    // Guard on cooldown AND the synchronous in-flight ref: cooldown is only set to 30
    // AFTER `await sendOTP` resolves, so during the round-trip it stays 0 and the button
    // stays enabled — two taps would otherwise fire two billable SMS.
    if (cooldown > 0 || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      const result = await sendOTP(userPhone);
      setVerificationId(result.verificationId);
      setCooldown(30);
    } catch (error: any) {
      setErrorMessage(error.message || t('profile.passwordScreen.errors.failedResend'));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════
  // STEP: NEW PASSWORD (after OTP verified)
  // ═══════════════════════════════════════════════════════
  const handleSetNewPassword = async () => {
    setErrorMessage('');
    if (!resetNewPassword.trim()) { setErrorMessage(t('profile.passwordScreen.errors.enterNew')); return; }
    if (resetNewPassword.length < 6) { setErrorMessage(t('profile.passwordScreen.errors.tooShort')); return; }
    if (resetNewPassword !== resetConfirmPassword) { setErrorMessage(t('profile.passwordScreen.errors.mismatch')); return; }

    try {
      setLoading(true);
      await resetPasswordAfterOTP(userPhone, resetNewPassword);
      await refreshUser();
      Alert.alert(t('profile.passwordScreen.passwordReset'), t('profile.passwordScreen.passwordResetMsg'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      setErrorMessage(error.message || t('profile.passwordScreen.errors.failedSetPassword'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Helpers ───────────────────────────────────────────
  const handleBack = () => {
    if (step === 'choose') setStep('change');
    else if (step === 'otp') setStep('choose');
    else if (step === 'newPass') setStep('otp');
    else navigation.goBack();
  };

  const renderPasswordInput = (
    label: string, value: string, setValue: (t: string) => void,
    show: boolean, setShow: (s: boolean) => void,
    placeholder: string, autoFocus?: boolean,
  ) => (
    <View style={styles.inputGroup}>
      <Text allowFontScaling={false} style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={isRTL ? { marginLeft: 12 } : { marginRight: 12 }} />
        <TextInput allowFontScaling={false}
          style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          value={value}
          onChangeText={(text) => { setValue(text); setErrorMessage(''); }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
        />
        <TouchableOpacity onPress={() => setShow(!show)} style={styles.eyeButton} activeOpacity={0.6}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStrength = (pw: string) => {
    const s = getStrength(pw);
    if (!pw) return null;
    return (
      <View style={styles.strengthContainer}>
        <View style={styles.strengthBars}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={[styles.strengthBar, { backgroundColor: i <= s.level ? s.color : colors.border }]} />
          ))}
        </View>
        <Text allowFontScaling={false} style={[styles.strengthLabel, { color: s.color }]}>{s.label}</Text>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Back ── */}
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.text} />
          </TouchableOpacity>

          {/* ════════════════════════════════════════════════
              STEP: CHANGE / SET PASSWORD
          ════════════════════════════════════════════════ */}
          {step === 'change' && (
            <>
              <Text allowFontScaling={false} style={styles.title}>{isSetPasswordFlow ? t('profile.passwordScreen.setTitle') : t('profile.passwordScreen.changeTitle')}</Text>
              <Text allowFontScaling={false} style={styles.subtitle}>
                {isSetPasswordFlow 
                  ? t('profile.passwordScreen.setSubtitle')
                  : t('profile.passwordScreen.changeSubtitle')}
              </Text>

              {!isSetPasswordFlow && renderPasswordInput(t('profile.passwordScreen.currentPassword'), currentPassword, setCurrentPassword, showCurrent, setShowCurrent, t('profile.passwordScreen.currentPasswordPlaceholder'), true)}

              {!isSetPasswordFlow && (
                <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotButton} activeOpacity={0.6} disabled={loading}>
                  <Text allowFontScaling={false} style={styles.forgotText}>{t('profile.passwordScreen.forgotPassword')}</Text>
                </TouchableOpacity>
              )}

              {renderPasswordInput(t('profile.passwordScreen.newPassword'), newPassword, setNewPassword, showNew, setShowNew, t('profile.passwordScreen.newPasswordPlaceholder'), isSetPasswordFlow)}
              {renderStrength(newPassword)}

              {renderPasswordInput(t('profile.passwordScreen.confirmPassword'), confirmPassword, setConfirmPassword, showConfirm, setShowConfirm, t('profile.passwordScreen.confirmPasswordPlaceholder'))}

              {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={isSetPasswordFlow ? handleSetPassword : handleChangePassword}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text allowFontScaling={false} style={styles.primaryButtonText}>{isSetPasswordFlow ? t('profile.passwordScreen.setPassword') : t('profile.passwordScreen.updatePassword')}</Text>}
              </TouchableOpacity>

              <View style={styles.noteCard}>
                <Ionicons name="shield-checkmark-outline" size={18} color={LUX.accent} />
                <Text allowFontScaling={false} style={styles.noteText}>{t('profile.passwordScreen.securityNote')}</Text>
              </View>
            </>
          )}

          {/* ════════════════════════════════════════════════
              STEP: CHOOSE METHOD
          ════════════════════════════════════════════════ */}
          {step === 'choose' && (
            <>
              <View style={styles.iconCenter}>
                <Ionicons name="key-outline" size={48} color={LUX.accent} />
              </View>
              <Text allowFontScaling={false} style={[styles.title, { textAlign: 'center' }]}>{t('profile.passwordScreen.resetTitle')}</Text>
              <Text allowFontScaling={false} style={[styles.subtitle, { textAlign: 'center' }]}>{t('profile.passwordScreen.resetSubtitle')}</Text>

              {/* Phone option */}
              {hasPhone && (
                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={handleSendPhoneOTP}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <View style={styles.methodIcon}>
                    <Ionicons name="call-outline" size={22} color={LUX.accent} />
                  </View>
                  <View style={styles.methodContent}>
                    <Text allowFontScaling={false} style={styles.methodTitle}>{t('profile.passwordScreen.sendCodeToPhone')}</Text>
                    <Text allowFontScaling={false} style={styles.methodValue}>{maskPhone(userPhone)}</Text>
                  </View>
                  <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}

              {/* Email option */}
              {hasRealEmail && (
                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={handleSendEmailReset}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <View style={styles.methodIcon}>
                    <Ionicons name="mail-outline" size={22} color={LUX.accent} />
                  </View>
                  <View style={styles.methodContent}>
                    <Text allowFontScaling={false} style={styles.methodTitle}>{t('profile.passwordScreen.sendLinkToEmail')}</Text>
                    <Text allowFontScaling={false} style={styles.methodValue}>{maskEmail(userEmail)}</Text>
                  </View>
                  <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}

              {loading && <ActivityIndicator color={LUX.accent} style={{ marginTop: SPACING.lg }} />}
              {!!errorMessage && <Text allowFontScaling={false} style={[styles.errorText, { textAlign: 'center', marginTop: SPACING.md }]}>{errorMessage}</Text>}
            </>
          )}

          {/* ════════════════════════════════════════════════
              STEP: OTP (phone verification)
          ════════════════════════════════════════════════ */}
          {step === 'otp' && (
            <>
              <Text allowFontScaling={false} style={styles.title}>{t('profile.passwordScreen.enterCode')}</Text>
              <Text allowFontScaling={false} style={styles.subtitle}>{t('profile.passwordScreen.sentTo', { phone: maskPhone(userPhone) })}</Text>

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
                onPress={() => handleVerifyOTP()}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('profile.passwordScreen.confirm')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleResendOTP} disabled={cooldown > 0 || loading} style={styles.resendButton} activeOpacity={0.6}>
                <Text allowFontScaling={false} style={[styles.resendText, cooldown > 0 && { color: colors.textSecondary }]}>
                  {cooldown > 0 ? t('profile.passwordScreen.resendCodeIn', { seconds: String(cooldown).padStart(2, '0') }) : t('profile.passwordScreen.resendCode')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* ════════════════════════════════════════════════
              STEP: NEW PASSWORD (after OTP verified)
          ════════════════════════════════════════════════ */}
          {step === 'newPass' && (
            <>
              <View style={styles.iconCenter}>
                <Ionicons name="checkmark-circle" size={48} color={LUX.success} />
              </View>
              <Text allowFontScaling={false} style={[styles.title, { textAlign: 'center' }]}>{t('profile.passwordScreen.verified')}</Text>
              <Text allowFontScaling={false} style={[styles.subtitle, { textAlign: 'center' }]}>{t('profile.passwordScreen.setNewPasswordSubtitle')}</Text>

              {renderPasswordInput(t('profile.passwordScreen.newPassword'), resetNewPassword, setResetNewPassword, showResetNew, setShowResetNew, t('profile.passwordScreen.newPasswordPlaceholder'), true)}
              {renderStrength(resetNewPassword)}

              {renderPasswordInput(t('profile.passwordScreen.confirmPassword'), resetConfirmPassword, setResetConfirmPassword, showResetConfirm, setShowResetConfirm, t('profile.passwordScreen.confirmPasswordPlaceholder'))}

              {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleSetNewPassword}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('profile.passwordScreen.updatePassword')}</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* ════════════════════════════════════════════════
              STEP: EMAIL SENT
          ════════════════════════════════════════════════ */}
          {step === 'emailSent' && (
            <View style={styles.centeredBlock}>
              <View style={styles.iconCenter}>
                <Ionicons name="mail-open-outline" size={48} color={LUX.accent} />
              </View>
              <Text allowFontScaling={false} style={[styles.title, { textAlign: 'center' }]}>{t('profile.passwordScreen.checkInbox')}</Text>
              <Text allowFontScaling={false} style={[styles.subtitle, { textAlign: 'center' }]}>
                {t('profile.passwordScreen.resetLinkSent')}{'\n'}
                <Text allowFontScaling={false} style={{ fontWeight: '600', color: colors.text }}>{maskEmail(userEmail)}</Text>
              </Text>
              <Text allowFontScaling={false} style={[styles.hintText, { textAlign: 'center' }]}>
                {t('profile.passwordScreen.clickLink')}
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('profile.passwordScreen.done')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Reauth Modal — inline identity verification */}
      <ReauthModal ref={reauthRef} />
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) => {
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : LUX.inputBg;

  return StyleSheet.create({
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
  centeredBlock: {
    alignItems: 'center',
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
  eyeButton: {
    padding: 6,
  },
  forgotButton: {
    alignSelf: isRTL ? 'flex-start' : 'flex-end',
    marginBottom: SPACING.lg,
    marginTop: -SPACING.sm,
    paddingVertical: 4,
  },
  forgotText: {
    color: LUX.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  iconCenter: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
    height: 40,
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
  methodCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
  },
  methodContent: {
    flex: 1,
    marginHorizontal: SPACING.sm,
  },
  methodIcon: {
    alignItems: 'center',
    backgroundColor: '#FF762212',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  methodTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: isRTL ? 'right' : 'left',
  },
  methodValue: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: isRTL ? 'right' : 'left',
  },
  noteCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FF762210',
    borderRadius: 14,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  noteText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
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
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: SPACING.sm,
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
  strengthBar: {
    borderRadius: 2,
    flex: 1,
    height: 4,
  },
  strengthBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  strengthContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    marginTop: -SPACING.sm,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
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
};

export default ChangePasswordScreen;
