/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { requestEmailChange, reloadUser } from '../../services/auth';
import { useAuth } from '../../contexts/AuthContext';
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
 * Update Email Screen
 * Enter new email → sends verification → toast.
 * If requires-recent-login → routes to ConfirmIdentity.
 */
const UpdateEmailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, updateUserProfile, refreshUser } = useAuth();
  const { t } = useTranslation();
  const reauthRef = useRef<ReauthModalHandle>(null);

  const currentEmail = user?.email || '';
  const isInternalEmail = isSyntheticEmail(currentEmail) || currentEmail.includes('@asankaryapp.');

  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [isPhoneUserSave, setIsPhoneUserSave] = useState(false);

  const handleContinue = async () => {
    const emailTrimmed = newEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setErrorMessage(t('updateEmail.errors.enterEmail'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setErrorMessage(t('updateEmail.errors.invalidEmail'));
      return;
    }
    if (emailTrimmed === currentEmail.toLowerCase()) {
      setErrorMessage(t('updateEmail.errors.sameEmail'));
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      // Check if phone user (internal Auth email)
      const { getAuthState } = require('../../services/auth');
      const authState = getAuthState();
      const isPhoneUser = !authState.email ||
        isSyntheticEmail(authState.email) ||
        authState.email.includes('@asankaryapp.');

      // Everyone uses verifyBeforeUpdateEmail (requestEmailChange)
      // This sends the verification link and updates the email ONLY when the link is clicked,
      // without revoking the current session tokens like the Admin SDK does.
      await requestEmailChange(
        emailTrimmed,
        () => reauthRef.current?.requestReauth() ?? Promise.reject(new Error('ReauthModal not ready')),
      );
      
      // Update contact info in Firestore instantly so they can see it in their profile.
      // Firebase Auth email won't update until they click the link, but this is fine.
      await updateUserProfile({ email: emailTrimmed });
      
      // Let the UI know to show "Check your inbox"
      setIsPhoneUserSave(false);

      setSent(true);
    } catch (error: any) {
      if (error.message === 'Reauth cancelled') return;
      if (error.code === 'auth/email-already-in-use') {
        setErrorMessage(t('updateEmail.errors.emailInUse'));
      } else {
        setErrorMessage(error.message || t('updateEmail.errors.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDone = async () => {
    await reloadUser();
    refreshUser();
    navigation.goBack();
  };

  const handleBack = () => navigation.goBack();

  // ── Success state ──
  if (sent) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.scrollContent, styles.centered, { paddingBottom: 40 + insets.bottom }]}>
          <View style={styles.successIcon}>
            <Ionicons name={isPhoneUserSave ? 'checkmark-circle-outline' : 'mail-open-outline'} size={48} color={LUX.accent} />
          </View>
          <Text allowFontScaling={false} style={[styles.title, { textAlign: 'center' }]}>
            {isPhoneUserSave ? t('updateEmail.success.emailSavedTitle') : t('updateEmail.success.checkInboxTitle')}
          </Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { textAlign: 'center' }]}>
            {isPhoneUserSave
              ? t('updateEmail.success.emailSavedSubtitle')
              : <>{t('updateEmail.success.checkInboxSubtitle')} {'\n'}<Text allowFontScaling={false} style={{ fontWeight: '600', color: LUX.body }}>{newEmail.trim()}</Text></>
            }
          </Text>
          {!isPhoneUserSave && (
            <Text allowFontScaling={false} style={[styles.hintText, { textAlign: 'center' }]}>
              {t('updateEmail.success.checkInboxHint')}
            </Text>
          )}
          <TouchableOpacity style={[styles.primaryButton, { width: '100%' }]} onPress={handleDone} activeOpacity={0.85}>
            <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('updateEmail.success.done')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

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

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{isInternalEmail ? t('updateEmail.addTitle') : t('updateEmail.updateTitle')}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            {isInternalEmail
              ? t('updateEmail.addSubtitle')
              : t('updateEmail.updateSubtitle')}
          </Text>

          {/* ── Input ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('updateEmail.newEmailLabel')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('updateEmail.emailPlaceholder')}
                placeholderTextColor={LUX.placeholder}
                value={newEmail}
                onChangeText={(text) => { setNewEmail(text); setErrorMessage(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
          </View>

          {/* ── Error ── */}
          {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

          {/* ── Continue ── */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={LUX.surface} />
            ) : (
              <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('updateEmail.continue')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Reauth Modal — inline identity verification */}
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
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
  hintText: {
    color: LUX.placeholder,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  input: {
    color: LUX.body,
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    height: 40,
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
  subtitle: {
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  successIcon: {
    marginBottom: SPACING.lg,
  },
  title: {
    color: LUX.heading,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
});

export default UpdateEmailScreen;
