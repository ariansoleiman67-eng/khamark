/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
} from 'react-native-reanimated';
import { registerWithPhone, registerWithEmail, resetPasswordAfterOTP } from '../../services/auth';
import { RootStackParamList } from '../../types';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';

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
const RADIUS = { input: 16, button: 16, back: 22, card: 24, coin: 48 };

const ASANKARY_LOGO = require('../../../assets/images/asankarylogo.png');

/**
 * Screen D — Create/Reset Password
 * Luxury: subtle strength hint (one line), skip option for register mode.
 */
const SetNewPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteParams>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { createAdminAccount, createPartnerAccount } = useTenant();
  const { setRegistrationInProgress, refreshUser } = useAuth();
  const { theme, isDark } = useTheme();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isRTL, isDark), [colors, isRTL, isDark]);

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
  // Synchronous re-entrancy guard shared by both submit paths (primary + skip).
  // `loading` is async state, so it cannot block same-frame double taps or
  // cross-handler concurrency (submit in flight while "Not now" is tapped).
  const busyRef = useRef(false);
  // Screen liveness. Alert.alert is a native global modal with no lifecycle binding,
  // so an alert resolving after the user backed out fires over an unrelated screen.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

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
    if (busyRef.current) return;
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

    busyRef.current = true;
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
        // Alert.alert is a native global modal that outlives this screen, so if the
        // user backed out during the reset it fires over whatever they landed on.
        if (!aliveRef.current) return;
        Alert.alert(
          t('auth.success'),
          t('auth.setPassword.resetSuccess'),
          // reset, not navigate. The reset stack is
          // [SignIn, Password, ForgotPassword, VerifyPhone, SetNewPassword], so SignIn
          // is never the top and navigate() PUSHES a second copy — on the happy path,
          // not just under a race. Back from there returned the user to the OTP screen
          // holding a code they had already consumed.
          [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'SignIn' as never }] }) }]
        );
      }
    } catch (error: any) {
      setRegistrationInProgress(false);
      setErrorMessage(error.message || t('auth.setPassword.failedSet'));
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  const handleSkip = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
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
      busyRef.current = false;
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
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
            style={[styles.hero, { paddingTop: insets.top + SPACING.sm }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Back button */}
            <Animated.View entering={FadeIn.duration(400)} style={styles.backRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isRTL ? 'chevron-forward' : 'chevron-back'}
                  size={22}
                  color={colors.textOnPrimary}
                />
              </TouchableOpacity>
            </Animated.View>

            {/* Logo coin */}
            <Animated.View
              entering={ZoomIn.duration(700).springify().damping(12)}
              style={styles.logoArea}
            >
              <View style={styles.logoCircle}>
                <Image source={ASANKARY_LOGO} style={styles.logoImage} contentFit="contain" />
              </View>
            </Animated.View>

            {/* Headline */}
            <Animated.Text
              allowFontScaling={false}
              entering={SlideInLeft.duration(500).delay(200)}
              style={styles.title}
            >
              {isRegister
                ? t('auth.setPassword.title', { defaultValue: 'Secure your account' })
                : t('auth.resetPassword.title', { defaultValue: 'Reset password' })}
            </Animated.Text>
            <Animated.Text
              allowFontScaling={false}
              entering={FadeIn.duration(500).delay(320)}
              style={styles.subtitle}
            >
              {isRegister
                ? t('auth.setPassword.subtitle', { defaultValue: 'Create a password for faster sign-ins.' })
                : t('auth.resetPassword.subtitle', { defaultValue: 'Create a new password for your account.' })}
            </Animated.Text>
          </LinearGradient>

          {/* ── Form Card (overlaps hero) ── */}
          <Animated.View
            entering={FadeInUp.duration(600).delay(250).springify().damping(14)}
            style={styles.glassCard}
          >
            {/* ── New Password ── */}
            <View style={styles.inputGroup}>
              <AppText style={styles.label}>
                {t('auth.newPassword', { defaultValue: 'New Password' })}
              </AppText>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.placeholder} />
                <TextInput allowFontScaling={false}
                  style={styles.input}
                  placeholder={t('auth.enterPassword', { defaultValue: 'Enter password' })}
                  placeholderTextColor={colors.placeholder}
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
                
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('common.hidePassword', { defaultValue: 'Hide password' }) : t('common.showPassword', { defaultValue: 'Show password' })}
              accessibilityState={{ selected: showPassword }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textSecondary}
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
                <Ionicons name="lock-closed-outline" size={20} color={colors.placeholder} />
                <TextInput allowFontScaling={false}
                  style={styles.input}
                  placeholder={t('auth.confirmPassword', { defaultValue: 'Confirm password' })}
                  placeholderTextColor={colors.placeholder}
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
                
              accessibilityRole="button"
              accessibilityLabel={showConfirmPassword ? t('common.hidePassword', { defaultValue: 'Hide password' }) : t('common.showPassword', { defaultValue: 'Show password' })}
              accessibilityState={{ selected: showConfirmPassword }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textSecondary}
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
                    {isRegister
                      ? t('auth.createPassword', { defaultValue: 'Create password' })
                      : t('auth.resetPasswordLabel', { defaultValue: 'Reset password' })}
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ── "Not now" skip link (phone register only) ── */}
          {/* Email register has no passwordless path — skipping would navigate to
              RegisterSuccess without creating an account (ghost account), so the
              skip link is only shown for phone registration. */}
          {isRegister && mode !== 'partner-register' && method === 'phone' && (
            <Animated.View entering={FadeIn.duration(400).delay(500)}>
              <TouchableOpacity
                onPress={handleSkip}
                disabled={loading}
                style={[styles.quietButton, loading && { opacity: 0.5 }]}
                activeOpacity={0.6}
              >
                <AppText style={styles.quietLink}>
                  {t('auth.notNow', { defaultValue: 'Not now' })}
                </AppText>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (colors: any, isRTL: boolean, isDark: boolean) => {
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F2';

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

    // ── Back ──
    backRow: {
      alignSelf: 'stretch',
      flexDirection: isRTL ? 'row-reverse' : 'row',
      marginBottom: SPACING.sm,
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
      borderRadius: RADIUS.coin,
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
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: -0.4,
      marginBottom: SPACING.xs,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textOnPrimary,
      fontSize: 14.5,
      lineHeight: 21,
      maxWidth: 320,
      opacity: 0.9,
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

    // ── Input ──
    inputGroup: {
      marginBottom: SPACING.lg,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontWeight: '600',
      letterSpacing: 0.4,
      marginBottom: SPACING.xs,
      textAlign: isRTL ? 'right' : 'left',
      textTransform: 'uppercase',
    },
    inputWrapper: {
      alignItems: 'center',
      backgroundColor: inputBg,
      borderColor: colors.border,
      borderRadius: RADIUS.input,
      borderWidth: 1.5,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 10,
      height: 58,
      paddingHorizontal: SPACING.md,
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
    eyeButton: {
      padding: 6,
    },

    // ── Strength Hint (subtle, one line) ──
    strengthHint: {
      fontSize: 12,
      fontWeight: '500',
      marginTop: 6,
      textAlign: isRTL ? 'right' : 'left',
    },

    // ── Error ──
    errorText: {
      color: colors.error,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      marginBottom: SPACING.sm,
      textAlign: isRTL ? 'right' : 'left',
    },

    // ── Primary Button ──
    primaryButton: {
      borderRadius: RADIUS.button,
      elevation: 8,
      marginTop: SPACING.xs,
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
    },
  });
};

export default SetNewPasswordScreen;
