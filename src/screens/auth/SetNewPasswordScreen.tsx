/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerWithPhone, registerWithEmail, resetPasswordAfterOTP } from '../../services/auth';
import { RootStackParamList } from '../../types';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RouteParams = RouteProp<RootStackParamList, 'SetNewPassword'>;

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

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 14, button: 16, back: 22, card: 16 };

/**
 * Screen D — Create/Reset Password
 * Luxury: subtle strength hint (one line), skip option for register mode.
 */
const SetNewPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteParams>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { createAdminAccount, createPartnerAccount } = useTenant();
  const { setRegistrationInProgress, refreshUser } = useAuth();

  const { mode, phone, name, storeName } = route.params;
  // New flow params from AboutYouScreen
  const method = (route.params as any)?.method || 'phone';
  const email = (route.params as any)?.email || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isRegister = mode === 'register' || mode === 'admin-register' || mode === 'partner-register';

  // Subtle strength hint (one line)
  const strengthHint = useMemo(() => {
    if (!password) return '';
    if (password.length < 8) return t('auth.setPassword.strengthMin');
    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    if (!hasNumber) return t('auth.setPassword.strengthAddNumber');
    if (!hasLetter) return t('auth.setPassword.strengthAddLetter');
    if (password.length >= 12) return t('auth.setPassword.strengthStrong');
    return t('auth.setPassword.strengthGood');
  }, [password]);

  const strengthColor = useMemo(() => {
    if (!password || password.length < 8) return LUX.muted;
    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    if (!hasNumber || !hasLetter) return LUX.muted;
    if (password.length >= 12) return LUX.success;
    return LUX.accent;
  }, [password]);

  const validatePassword = (pass: string): { valid: boolean; message?: string } => {
    if (pass.length < 8) return { valid: false, message: t('auth.setPassword.minChars') };
    if (!/\d/.test(pass)) return { valid: false, message: t('auth.setPassword.needNumber') };
    if (!/[a-zA-Z]/.test(pass)) return { valid: false, message: t('auth.setPassword.needLetter') };
    return { valid: true };
  };

  const handleSubmit = async () => {
    setErrorMessage('');

    if (!password.trim() || !confirmPassword.trim()) {
      setErrorMessage(t('auth.setPassword.fillBothFields'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('auth.setPassword.passwordsNoMatch'));
      return;
    }
    const validation = validatePassword(password);
    if (!validation.valid) {
      setErrorMessage(validation.message!);
      return;
    }

    try {
      setLoading(true);

      if (mode === 'register') {
        if (!name) throw new Error('Name is required');

        if (method === 'email' && email) {
          await registerWithEmail(email, password, name);
        } else {
          await registerWithPhone({ phone, password, name, language: 'en', role: 'customer' });
        }
        // Clear registration flag and refresh user data
        setRegistrationInProgress(false);
        await refreshUser();
        // Navigate immediately — auth listener handles the rest
        navigation.navigate('RegisterSuccess' as any, { method });
      } else if (mode === 'admin-register') {
        if (!name || !storeName) throw new Error('Name and store name required');
        await registerWithPhone({ phone, password, name, language: 'en', role: 'admin' });
        const whatsappNumber = phone.replace('+', '');
        await createAdminAccount(name, storeName, phone, whatsappNumber);
        // Clear registration flag and refresh user data
        setRegistrationInProgress(false);
        await refreshUser();
        navigation.navigate('RegisterSuccess' as any, { method: 'phone' });
      } else if (mode === 'partner-register') {
        if (!name) throw new Error('Name is required');
        // Set a login password (so they can sign in with phone + password), then create the
        // VIEW-ONLY partner account — no store. role stays 'customer'; create_partner_account
        // flips is_partner.
        await registerWithPhone({ phone, password, name, language: 'en', role: 'customer' });
        await createPartnerAccount(name, phone);
        setRegistrationInProgress(false);
        await refreshUser();
        navigation.navigate('RegisterSuccess' as any, { method: 'phone' });
      } else if (mode === 'reset') {
        await resetPasswordAfterOTP(phone, password);
        Alert.alert(
          t('auth.success'),
          t('auth.setPassword.resetSuccess'),
          [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }]
        );
      }
    } catch (error: any) {
      setRegistrationInProgress(false);
      setErrorMessage(error.message || t('auth.setPassword.failedSet'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      setLoading(true);
      if (mode === 'register' && method === 'phone' && name) {
        await registerWithPhone({
          phone,
          name,
          language: 'en',
          role: 'customer'
        });
      }
      // Clear registration flag and refresh user data
      setRegistrationInProgress(false);
      await refreshUser();
      // Navigate immediately — auth listener handles the rest
      navigation.navigate('RegisterSuccess' as any, { method });
    } catch (error: any) {
      setRegistrationInProgress(false);
      setErrorMessage(error.message || t('auth.setPassword.failedRegistration'));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
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
            {isRegister
              ? t('auth.setPassword.title', { defaultValue: 'Secure your account' })
              : t('auth.resetPassword.title', { defaultValue: 'Reset password' })}
          </AppText>
          <AppText style={styles.subtitle}>
            {isRegister
              ? t('auth.setPassword.subtitle', { defaultValue: 'Create a password for faster sign-ins.' })
              : t('auth.resetPassword.subtitle', { defaultValue: 'Create a new password for your account.' })}
          </AppText>

          {/* ── New Password ── */}
          <View style={styles.inputGroup}>
            <AppText style={styles.label}>
              {t('auth.newPassword', { defaultValue: 'New Password' })}
            </AppText>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.enterPassword', { defaultValue: 'Enter password' })}
                placeholderTextColor={LUX.placeholder}
                value={password}
                onChangeText={(text) => { setPassword(text); setErrorMessage(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={LUX.muted}
                />
              </TouchableOpacity>
            </View>
            {/* Subtle strength hint (one line, not a meter) */}
            {!!strengthHint && (
              <AppText style={[styles.strengthHint, { color: strengthColor }]}>
                {strengthHint}
              </AppText>
            )}
          </View>

          {/* ── Confirm Password ── */}
          <View style={styles.inputGroup}>
            <AppText style={styles.label}>
              {t('auth.confirmPassword', { defaultValue: 'Confirm Password' })}
            </AppText>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.confirmPassword', { defaultValue: 'Confirm password' })}
                placeholderTextColor={LUX.placeholder}
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setErrorMessage(''); }}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeButton}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={LUX.muted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Error ── */}
          {!!errorMessage && (
            <AppText style={styles.errorText}>{errorMessage}</AppText>
          )}

          {/* ── Create Password Button ── */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={LUX.surface} />
            ) : (
              <AppText style={styles.primaryButtonText}>
                {isRegister
                  ? t('auth.createPassword', { defaultValue: 'Create password' })
                  : t('auth.resetPasswordLabel', { defaultValue: 'Reset password' })}
              </AppText>
            )}
          </TouchableOpacity>

          {/* ── "Not now" skip link (register only) ── */}
          {isRegister && mode !== 'partner-register' && (
            <TouchableOpacity
              onPress={handleSkip}
              style={styles.quietButton}
              activeOpacity={0.6}
            >
              <AppText style={styles.quietLink}>
                {t('auth.notNow', { defaultValue: 'Not now' })}
              </AppText>
            </TouchableOpacity>
          )}
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
    borderRadius: RADIUS.back,
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

  // ── Input ──
  inputGroup: {
    marginBottom: SPACING.lg,
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
    borderColor: LUX.border,
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
  eyeButton: {
    padding: 6,
  },

  // ── Strength Hint (subtle, one line) ──
  strengthHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },

  // ── Error ──
  errorText: {
    color: LUX.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
  },

  // ── Primary Button ──
  primaryButton: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: RADIUS.button,
    height: 52,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
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

export default SetNewPasswordScreen;
