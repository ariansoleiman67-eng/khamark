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
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerWithPhone, registerWithEmail } from '../../services/auth';
import { RootStackParamList } from '../../types';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';

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
const RADIUS = { input: 18, button: 18, back: 22 };

/**
 * Admin Screen 4 — Security (create password)
 * Creates the Firebase account + admin store.
 */
const AdminSecurityScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const colors = theme.colors;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);
  const { createAdminAccount } = useTenant();
  const { refreshUser } = useAuth();

  const { method, phone, email, storeName, name, whatsapp } = route.params || {};

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const strengthHint = useMemo(() => {
    if (!password) return '';
    if (password.length < 8) return t('auth.adminSetup.atLeast8Chars', { defaultValue: 'At least 8 characters' });
    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    if (!hasNumber) return t('auth.adminSetup.addNumber', { defaultValue: 'Add a number' });
    if (!hasLetter) return t('auth.adminSetup.addLetter', { defaultValue: 'Add a letter' });
    if (password.length >= 12) return t('auth.adminSetup.strongPassword', { defaultValue: 'Strong password' });
    return t('auth.adminSetup.goodPassword', { defaultValue: 'Good password' });
  }, [password, t]);

  const strengthColor = useMemo(() => {
    if (!password || password.length < 8) return colors.textSecondary;
    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    if (!hasNumber || !hasLetter) return colors.textSecondary;
    if (password.length >= 12) return colors.success;
    return LUX.accent;
  }, [password, colors]);

  const handleCreateAccount = async () => {
    setErrorMessage('');

    if (!password.trim() || !confirmPassword.trim()) {
      setErrorMessage(t('auth.adminSetup.fillBothFields', { defaultValue: 'Please fill in both fields' }));
      return;
    }
    if (password.length < 8) {
      setErrorMessage(t('auth.adminSetup.passwordMinLength', { defaultValue: 'Password must be at least 8 characters' }));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('auth.adminSetup.passwordsDoNotMatch', { defaultValue: 'Passwords do not match' }));
      return;
    }

    // Route params are untyped (useRoute<any>) and may arrive without a phone
    // number (e.g. an email flow where `email` is empty falls into the phone
    // branch). Normalize + require a phone before touching `.replace` on it.
    const useEmailBranch = method === 'email' && !!email;
    const rawPhone = phone ? String(phone) : '';
    if (!useEmailBranch && !rawPhone) {
      setErrorMessage(t('auth.adminSetup.fillBothFields', { defaultValue: 'Missing phone number' }));
      return;
    }

    try {
      setLoading(true);

      if (useEmailBranch) {
        // Email admin registration
        await registerWithEmail(email, password, name);
        const whatsappNumber = whatsapp ? whatsapp.replace('+', '') : '';
        await createAdminAccount(name, storeName, '', whatsappNumber);
      } else {
        // Phone admin registration
        await registerWithPhone({ phone: rawPhone, password, name, language: 'en', role: 'admin' });
        const whatsappNumber = whatsapp ? whatsapp.replace('+', '') : rawPhone.replace('+', '');
        await createAdminAccount(name, storeName, rawPhone, whatsappNumber);
      }

      // Refresh auth so AuthContext picks up admin role from admins collection
      await refreshUser();
      navigation.navigate('AdminSuccess' as any, { storeName });
    } catch (error: any) {
      setErrorMessage(error.message || t('auth.adminSetup.failedToCreateAccount', { defaultValue: 'Failed to create account' }));
    } finally {
      setLoading(false);
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

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{t('auth.adminSetup.securityTitle', { defaultValue: 'Security' })}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>{t('auth.adminSetup.securitySubtitle', { defaultValue: 'Create a password for faster sign-ins.' })}</Text>

          {/* ── Password ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('auth.password', { defaultValue: 'Password' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.placeholder} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.adminSetup.enterPassword', { defaultValue: 'Enter password' })}
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={(text) => { setPassword(text); setErrorMessage(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} activeOpacity={0.6}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {!!strengthHint && (
              <Text allowFontScaling={false} style={[styles.strengthHint, { color: strengthColor }]}>{strengthHint}</Text>
            )}
          </View>

          {/* ── Confirm ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('auth.adminSetup.confirmPasswordLabel', { defaultValue: 'Confirm Password' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.placeholder} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.adminSetup.confirmPasswordPlaceholder', { defaultValue: 'Confirm password' })}
                placeholderTextColor={colors.placeholder}
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setErrorMessage(''); }}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton} activeOpacity={0.6}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Error ── */}
          {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

          {/* ── Create Account ── */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleCreateAccount}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('auth.adminSetup.createAccount')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) => StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: isRTL ? 'flex-end' : 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
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
  eyeButton: {
    padding: 6,
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : LUX.inputBg,
    borderColor: colors.border,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    height: 54,
    paddingHorizontal: SPACING.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
    textAlign: isRTL ? 'right' : 'left',
    textTransform: 'uppercase',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: RADIUS.button,
    height: 52,
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  strengthHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    textAlign: isRTL ? 'right' : 'left',
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

export default AdminSecurityScreen;
