/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import { supabase } from '../../services/supabase';
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
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
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { input: 18, button: 18, back: 22 };

/**
 * Confirm Identity Screen
 * Reusable re-authentication for sensitive operations.
 * Primary: "Continue with password" + quiet link: "Use a code instead" (OTP)
 *
 * Route params:
 *   returnTo: screen name to navigate back to after success
 *   action: string describing what we're confirming for (e.g. 'changeEmail')
 */
const ConfirmIdentityScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const colors = theme.colors;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleContinueWithPassword = async () => {
    if (!password.trim()) {
      setErrorMessage(t('confirmIdentity.enterPasswordError', { defaultValue: 'Please enter your password' }));
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) {
        setErrorMessage(t('confirmIdentity.noAccount', { defaultValue: 'No account found' }));
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: authUser.email, password });
      if (error) throw error;

      // Success — just go back to the previous screen
      // The previous screen (UpdateEmail, etc.) is still in the stack
      // and the user's recent login is now fresh, so they can retry.
      navigation.goBack();
    } catch (error: any) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        setErrorMessage(t('confirmIdentity.incorrectPassword', { defaultValue: 'Incorrect password' }));
      } else {
        setErrorMessage(error.message || t('confirmIdentity.authFailed', { defaultValue: 'Authentication failed' }));
      }
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

          {/* ── Shield icon ── */}
          <View style={styles.shieldContainer}>
            <Ionicons name="shield-checkmark" size={48} color={LUX.accent} />
          </View>

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{t('confirmIdentity.title', { defaultValue: 'Confirm identity' })}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            {t('confirmIdentity.subtitle', { defaultValue: 'For your security, confirm your identity to continue.' })}
          </Text>

          {/* ── Password Input ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('confirmIdentity.passwordLabel', { defaultValue: 'YOUR PASSWORD' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.placeholder} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('confirmIdentity.passwordPlaceholder', { defaultValue: 'Enter password' })}
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={(text) => { setPassword(text); setErrorMessage(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton} activeOpacity={0.6}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Error ── */}
          {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

          {/* ── Continue ── */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleContinueWithPassword}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={LUX.surface} />
            ) : (
              <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('confirmIdentity.continueButton', { defaultValue: 'Continue with password' })}</Text>
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
    backgroundColor: colors.surface,
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
  eyeButton: {
    padding: 6,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    textAlign: isRTL ? 'right' : 'left',
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
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
    textAlign: isRTL ? 'right' : 'left',
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
    color: LUX.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  shieldContainer: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
});

export default ConfirmIdentityScreen;
