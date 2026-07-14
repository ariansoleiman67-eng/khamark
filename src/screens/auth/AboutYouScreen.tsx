/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };
const RADIUS = { input: 14, button: 16, back: 22 };

/**
 * Screen 3 — Your Details (minimal identity)
 * Collects only what's needed: name + optional referral.
 */
const AboutYouScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { method, phone, email } = route.params || {};

  const [name, setName] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleContinue = () => {
    setErrorMessage('');

    if (!name.trim()) {
      setErrorMessage(t('auth.enterName', { defaultValue: 'Please enter your name' }));
      return;
    }

    // Go to Screen 4 — Create Password
    navigation.navigate('SetNewPassword' as any, {
      mode: 'register',
      phone: phone || '',
      name: name.trim(),
      method,
      email,
      referralCode: referralCode.trim() || undefined,
    });
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
          {/* ── Back ── */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color={LUX.body} />
          </TouchableOpacity>

          {/* ── Headline ── */}
          <AppText style={styles.title}>
            {t('auth.yourDetails', { defaultValue: 'Your details' })}
          </AppText>
          <AppText style={styles.subtitle}>
            {t('auth.yourDetailsSubtitle', { defaultValue: 'Tell us a bit about yourself.' })}
          </AppText>

          {/* ── Full Name ── */}
          <View style={styles.inputGroup}>
            <AppText style={styles.label}>
              {t('auth.fullName', { defaultValue: 'Full Name' })}
            </AppText>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.namePlaceholder', { defaultValue: 'John Doe' })}
                placeholderTextColor={LUX.placeholder}
                value={name}
                onChangeText={(text) => { setName(text); setErrorMessage(''); }}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
              />
            </View>
          </View>

          {/* ── Optional Referral Code (collapsed) ── */}
          {!showReferral ? (
            <TouchableOpacity
              onPress={() => setShowReferral(true)}
              style={styles.referralToggle}
              activeOpacity={0.6}
            >
              <AppText style={styles.referralToggleText}>
                {t('auth.haveCode', { defaultValue: 'Have a referral code?' })}
              </AppText>
            </TouchableOpacity>
          ) : (
            <View style={styles.inputGroup}>
              <AppText style={styles.label}>
                {t('auth.referralCode', { defaultValue: 'Referral Code' })}
              </AppText>
              <View style={styles.inputWrapper}>
                <Ionicons name="gift-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
                <TextInput allowFontScaling={false}
                  style={styles.input}
                  placeholder={t('auth.referralPlaceholder', { defaultValue: 'Enter code (optional)' })}
                  placeholderTextColor={LUX.placeholder}
                  value={referralCode}
                  onChangeText={setReferralCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          {/* ── Error ── */}
          {!!errorMessage && (
            <AppText style={styles.errorText}>{errorMessage}</AppText>
          )}

          {/* ── Continue ── */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <AppText style={styles.primaryButtonText}>
              {t('auth.continue', { defaultValue: 'Continue' })}
            </AppText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: SPACING.xl,
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
    lineHeight: 18,
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
    height: 56,
    paddingHorizontal: SPACING.md,
  },
  label: {
    color: LUX.muted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
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
  primaryButtonText: {
    color: LUX.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  referralToggle: {
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  referralToggleText: {
    color: LUX.muted,
    fontSize: 14,
    fontWeight: '500',
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
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
});

export default AboutYouScreen;
