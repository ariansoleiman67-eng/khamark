/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import { supabase } from '../../services/supabase';
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPhoneRegistered, isEmailRegistered } from '../../services/auth';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getCountryInfo, CountryCode } from '../../utils/phoneUtils';
type NavigationProp = StackNavigationProp<RootStackParamList>;
type VerifyMethod = 'phone' | 'email';

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  inputBg: '#F4F6F9',
  segmentBg: '#F0F2F5',
  accent: '#FF7622',
  heading: '#1A1D26',
  body: '#32343E',
  muted: '#8F95A3',
  placeholder: '#B0B5C3',
  border: '#E8ECF0',
  error: '#E84855',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { input: 18, button: 18, segment: 14, segmentPill: 10, back: 22 };

/**
 * Admin Screen 1 — Verify (Phone | Email)
 * Stops spam and anchors store ownership.
 */
const AdminSignupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [method, setMethod] = useState<VerifyMethod>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('IQ');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSendCode = async () => {
    setErrorMessage('');

    if (method === 'phone') {
      if (!phone.trim()) {
        setErrorMessage(t('auth.adminSetup.requiredPhone'));
        return;
      }
      try {
        setLoading(true);
        const countryInfo = getCountryInfo(selectedCountry);
        const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
        const formattedPhone = `${countryInfo.dialCode}${cleanPhone}`;

        // Check if already registered
        const exists = await isPhoneRegistered(formattedPhone);
        if (exists) {
          setErrorMessage(t('auth.adminSetup.phoneExists'));
          return;
        }

        // Send OTP → VerifyPhone (admin-register mode)
        navigation.navigate('VerifyPhone' as any, {
          mode: 'admin-register',
          phone: formattedPhone,
        });
      } catch (error: any) {
        setErrorMessage(error.message || t('common.error'));
      } finally {
        setLoading(false);
      }
    } else {
      if (!email.trim()) {
        setErrorMessage(t('auth.adminSetup.requiredEmail'));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage(t('auth.adminSetup.invalidEmail'));
        return;
      }
      try {
        setLoading(true);
        const exists = await isEmailRegistered(email.trim());
        if (exists) {
          setErrorMessage(t('auth.adminSetup.emailExists'));
          return;
        }
        // Email ok → Supabase sends a 6-digit OTP via its SMTP, then verify screen
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true },
        });
        if (otpErr) throw otpErr;
        navigation.navigate('AdminVerifyEmail' as any, {
          email: email.trim(),
        });
      } catch (error: any) {
        setErrorMessage(error.message || t('common.error'));
      } finally {
        setLoading(false);
      }
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
            <Ionicons name="chevron-back" size={20} color={LUX.body} />
          </TouchableOpacity>

          {/* ── Badge ── */}
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={16} color={LUX.accent} />
            <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('auth.adminSetup.badge')}</Text>
          </View>

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{t('auth.adminSetup.title')}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            {t('auth.adminSetup.subtitle')}
          </Text>

          {/* ── Segmented Control ── */}
          <View style={styles.segmentContainer}>
            <TouchableOpacity
              style={[styles.segmentButton, method === 'phone' && styles.segmentButtonActive]}
              onPress={() => { setMethod('phone'); setErrorMessage(''); }}
              activeOpacity={0.8}
            >
              <Text allowFontScaling={false} style={[styles.segmentText, method === 'phone' && styles.segmentTextActive]}>
                {t('auth.adminSetup.methodPhone')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, method === 'email' && styles.segmentButtonActive]}
              onPress={() => { setMethod('email'); setErrorMessage(''); }}
              activeOpacity={0.8}
            >
              <Text allowFontScaling={false} style={[styles.segmentText, method === 'email' && styles.segmentTextActive]}>
                {t('auth.adminSetup.methodEmail')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Input ── */}
          {method === 'phone' ? (
            <View style={{ marginBottom: SPACING.lg }}>
              <PhoneInput
                label={t('auth.adminSetup.phoneLabel')}
                value={phone}
                defaultCountry="IQ"
                onChangeText={(text) => { setPhone(text); setErrorMessage(''); }}
                onCountryChange={(c) => setSelectedCountry(c.code)}
              />
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text allowFontScaling={false} style={styles.label}>{t('auth.adminSetup.emailLabel')}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
                <TextInput allowFontScaling={false}
                  style={styles.input}
                  placeholder={t('auth.adminSetup.emailPlaceholder')}
                  placeholderTextColor={LUX.placeholder}
                  value={email}
                  onChangeText={(text) => { setEmail(text); setErrorMessage(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          {/* ── Error ── */}
          {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

          {/* ── Send Code / Continue ── */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleSendCode}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={LUX.surface} />
            ) : (
              <Text allowFontScaling={false} style={styles.primaryButtonText}>
                {method === 'phone' ? t('auth.adminSetup.sendCode') : t('auth.adminSetup.continue')}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Cancel ── */}
          <TouchableOpacity onPress={handleBack} style={styles.quietButton} activeOpacity={0.6}>
            <Text allowFontScaling={false} style={styles.quietLink}>{t('auth.adminSetup.cancel')}</Text>
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
    marginBottom: SPACING.lg,
    width: 44,
  },
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF762212',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 6,
    marginBottom: SPACING.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    color: LUX.accent,
    fontSize: 13,
    fontWeight: '600',
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
    marginBottom: SPACING.sm,
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
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: RADIUS.segmentPill,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  segmentButtonActive: {
    backgroundColor: LUX.surfaceRaised,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  segmentContainer: {
    backgroundColor: LUX.segmentBg,
    borderRadius: RADIUS.segment,
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    padding: 4,
  },
  segmentText: {
    color: LUX.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: LUX.heading,
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

export default AdminSignupScreen;
