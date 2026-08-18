/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
/**
 * ReauthModal
 * 
 * Reusable modal for re-authentication when Firebase throws
 * requires-recent-login. Detects available methods and presents
 * the appropriate UI (password input, Apple sign-in, or fallback).
 * 
 * Usage:
 *   const reauthRef = useRef<ReauthModalHandle>(null);
 *   
 *   // In your sensitive action:
 *   await runSensitiveAction(action, () => reauthRef.current!.requestReauth());
 *   
 *   // In JSX:
 *   <ReauthModal ref={reauthRef} />
 */

import React, { useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/ThemeProvider';
import {
  getBestReauthMethod,
  reauthWithPassword,
  reauthWithApple,
} from '../services/auth/securityService';

// ─── Design Tokens ───────────────────────────────────────
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
const RADIUS = { input: 18, button: 18, modal: 28 };

// ─── Public Handle ───────────────────────────────────────
export interface ReauthModalHandle {
  /** Returns a Promise that resolves when reauth succeeds, rejects on cancel. */
  requestReauth: () => Promise<void>;
}

const ReauthModal = forwardRef<ReauthModalHandle>((_, ref) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();

  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'password' | 'apple' | 'signout'>('password');

  // Promise resolve/reject stored so we can fulfill from callbacks
  const resolveRef = React.useRef<(() => void) | null>(null);
  const rejectRef = React.useRef<((err: Error) => void) | null>(null);

  const reset = useCallback(() => {
    setPassword('');
    setShowPassword(false);
    setLoading(false);
    setError('');
  }, []);

  // Helper to detect user cancellation from Expo AppleAuthentication
  const isUserCancel = (e: any) => {
    const code = String(e?.code || '');
    return code === 'ERR_CANCELED' || code === 'ERR_REQUEST_CANCELED';
  };

  useImperativeHandle(ref, () => ({
    requestReauth: async () => {
      // Singleton guard — use refs (not visible state) to detect pending request
      if (resolveRef.current || rejectRef.current) {
        return Promise.reject(new Error('Reauth already in progress'));
      }
      const best = await getBestReauthMethod();
      return new Promise<void>((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;
        setMethod(best);
        reset();
        setVisible(true);

        // Auto-trigger Apple after modal animation settles
        if (best === 'apple') {
          InteractionManager.runAfterInteractions(() => {
            // Only fire if request is still pending (not cancelled during animation)
            if (resolveRef.current && rejectRef.current) {
              handleAppleReauth();
            }
          });
        }
      });
    },
  }));

  const handleCancel = () => {
    const rejectFn = rejectRef.current;
    // Clean up first to prevent races
    setVisible(false);
    resolveRef.current = null;
    rejectRef.current = null;
    reset();
    // Reject after cleanup
    rejectFn?.(new Error('Reauth cancelled'));
  };

  const handlePasswordSubmit = async () => {
    if (loading) return; // Prevent double-tap
    if (!password.trim()) {
      setError(t('confirmIdentity.enterPasswordError', { defaultValue: 'Please enter your password' }));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await reauthWithPassword(password);
      setVisible(false);
      reset();
      resolveRef.current?.();
      resolveRef.current = null;
      rejectRef.current = null;
    } catch (e: any) {
      if (e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential') {
        setError(t('auth.wrongPassword', { defaultValue: 'Incorrect password. Please try again.' }));
      } else {
        setError(e?.message || t('confirmIdentity.authFailed', { defaultValue: 'Authentication failed' }));
      }
    } finally {
      // Use ref-based check instead of stale `visible` closure
      setLoading(false);
    }
  };

  const handleAppleReauth = async () => {
    if (loading) return; // Prevent double-tap
    setLoading(true);
    setError('');
    try {
      // Delay slightly to prevent modal animation from conflicting with Apple's native sheet
      await new Promise<void>(resolve => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      // If request was cancelled while waiting for interactions, bail out
      if (!resolveRef.current || !rejectRef.current) return;

      await reauthWithApple();
      
      const resolveFn = resolveRef.current;
      setVisible(false);
      reset();
      resolveFn?.();
      resolveRef.current = null;
      rejectRef.current = null;
    } catch (e: any) {
      if (isUserCancel(e)) {
        // Treat cancellation as a first-class canceled outcome to prevent unexpected retry loops
        handleCancel();
        return;
      }
      setError(e?.message || t('profile.accountSecurity.reauth.appleFailed', { defaultValue: 'Apple authentication failed' }));
    } finally {
      // Use ref-based check instead of stale `visible` closure
      if (resolveRef.current && rejectRef.current) {
        setLoading(false);
      }
    }
  };

  const bg = isDark ? theme.colors.background : LUX.bg;
  const cardBg = isDark ? theme.colors.surface : LUX.surface;
  const textColor = isDark ? theme.colors.text : LUX.heading;
  const mutedColor = isDark ? theme.colors.textSecondary : LUX.muted;
  const inputBg = isDark ? theme.colors.background : LUX.inputBg;
  const borderColor = isDark ? theme.colors.border : LUX.border;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleCancel} />
        
        <View style={[styles.sheet, { backgroundColor: cardBg }]}>
          {/* Handle bar */}
          <View style={[styles.handleBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#DDE0E5' }]} />

          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(255,118,34,0.15)' : '#FFF3EB' }]}>
            <Ionicons name="shield-checkmark" size={28} color={isDark ? theme.colors.primary : LUX.accent} />
          </View>

          {/* Title */}
          <Text allowFontScaling={false} style={[styles.title, { color: textColor }]}>
            {t('profile.accountSecurity.reauth.title', { defaultValue: 'Verify Your Identity' })}
          </Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: mutedColor }]}>
            {method === 'password'
              ? t('profile.accountSecurity.reauth.passwordSubtitle', { defaultValue: 'Enter your password to continue this action.' })
              : method === 'apple'
              ? t('profile.accountSecurity.reauth.appleSubtitle', { defaultValue: 'Sign in with Apple to continue.' })
              : t('profile.accountSecurity.reauth.signoutSubtitle', { defaultValue: 'Please sign out and sign in again to continue.' })
            }
          </Text>

          {/* Error */}
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(232,72,85,0.12)' : '#FFF0F0' }]}>
              <Ionicons name="alert-circle" size={16} color={LUX.error} />
              <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Password Method */}
          {method === 'password' && (
            <>
              <View style={[styles.inputWrapper, { backgroundColor: inputBg, borderColor }]}>
                <Ionicons name="lock-closed-outline" size={18} color={mutedColor} style={styles.inputIcon} />
                <TextInput allowFontScaling={false}
                  style={[styles.input, { color: textColor }]}
                  placeholder={t('auth.enterPassword', { defaultValue: 'Enter your password' })}
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : LUX.placeholder}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handlePasswordSubmit}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('common.hidePassword', { defaultValue: 'Hide password' }) : t('common.showPassword', { defaultValue: 'Show password' })}
              accessibilityState={{ selected: showPassword }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handlePasswordSubmit}
                activeOpacity={0.7}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text allowFontScaling={false} style={styles.buttonText}>
                    {t('common.confirm', { defaultValue: 'Confirm' })}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Apple Method */}
          {method === 'apple' && (
            <TouchableOpacity
              style={[styles.appleButton, loading && styles.buttonDisabled]}
              onPress={handleAppleReauth}
              activeOpacity={0.7}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={20} color="#FFF" />
                  <Text allowFontScaling={false} style={styles.appleButtonText}>{t('auth.continueWithApple', { defaultValue: 'Continue with Apple' })}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Fallback (sign out) */}
          {method === 'signout' && (
            <View style={[styles.fallbackBox, { backgroundColor: isDark ? 'rgba(255,118,34,0.1)' : '#FFF8F2' }]}>
              <Ionicons name="information-circle-outline" size={18} color={LUX.accent} />
              <Text allowFontScaling={false} style={[styles.fallbackText, { color: mutedColor }]}>
                {t('profile.accountSecurity.reauth.signoutFallback', { defaultValue: 'For security, please sign out and sign back in, then try again.' })}
              </Text>
            </View>
          )}

          {/* Cancel */}
          <TouchableOpacity onPress={handleCancel} style={styles.cancelButton} activeOpacity={0.6}>
            <Text allowFontScaling={false} style={[styles.cancelText, { color: mutedColor }]}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

ReauthModal.displayName = 'ReauthModal';

const styles = StyleSheet.create({
  appleButton: {
    alignItems: 'center',
    backgroundColor: '#000',
    borderRadius: RADIUS.button,
    flexDirection: 'row',
    gap: 10,
    height: 52,
    justifyContent: 'center',
    marginTop: SPACING.md,
    width: '100%',
  },
  appleButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
  },
  button: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: RADIUS.button,
    height: 52,
    justifyContent: 'center',
    marginTop: SPACING.md,
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  errorBox: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  errorText: {
    color: LUX.error,
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  eyeButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  fallbackBox: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  fallbackText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  handleBar: {
    borderRadius: 3,
    height: 5,
    marginBottom: SPACING.lg,
    width: 40,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 20,
    height: 56,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    width: 56,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 14,
  },
  inputIcon: {
    marginRight: SPACING.xs,
  },
  inputWrapper: {
    alignItems: 'center',
    borderRadius: RADIUS.input,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    width: '100%',
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    alignItems: 'center',
    borderTopLeftRadius: RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    paddingBottom: 34,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
});

export default ReauthModal;
