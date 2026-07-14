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

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { input: 18, button: 18, back: 22 };

/**
 * Admin Screen 3 — Admin Details
 * Collects: full name (required) + optional WhatsApp.
 */
const AdminDetailsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const { method, phone, email, storeName } = route.params || {};

  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleContinue = () => {
    setErrorMessage('');
    if (!name.trim()) {
      setErrorMessage(t('auth.adminSetup.requireName', { defaultValue: 'Please enter your name.' }));
      return;
    }
    navigation.navigate('AdminSecurity' as any, {
      method,
      phone,
      email,
      storeName,
      name: name.trim(),
      whatsapp: whatsapp.trim() || undefined,
    });
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

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{t('auth.adminSetup.adminDetailsTitle', { defaultValue: 'Admin details' })}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>{t('auth.adminSetup.adminDetailsSubtitle', { defaultValue: 'Tell us about yourself.' })}</Text>

          {/* ── Full Name ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('auth.adminSetup.fullName', { defaultValue: 'Full Name' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.adminSetup.namePlaceholder', { defaultValue: 'John Doe' })}
                placeholderTextColor={LUX.placeholder}
                value={name}
                onChangeText={(text) => { setName(text); setErrorMessage(''); }}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
              />
            </View>
          </View>

          {/* ── WhatsApp (Optional) ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('auth.adminSetup.whatsappLabel', { defaultValue: 'WhatsApp (optional)' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="logo-whatsapp" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder="+964 780 123 4567"
                placeholderTextColor={LUX.placeholder}
                value={whatsapp}
                onChangeText={setWhatsapp}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>
            <Text allowFontScaling={false} style={styles.helperText}>
              {t('auth.adminSetup.whatsappHelper', { defaultValue: 'Customers can reach you on WhatsApp.' })}
            </Text>
          </View>

          {/* ── Error ── */}
          {!!errorMessage && <Text allowFontScaling={false} style={styles.errorText}>{errorMessage}</Text>}

          {/* ── Continue ── */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('auth.adminSetup.continue')}</Text>
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
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
  },
  helperText: {
    color: LUX.placeholder,
    fontSize: 12,
    marginTop: 6,
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
    marginTop: SPACING.xs,
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
  title: {
    color: LUX.heading,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
});

export default AdminDetailsScreen;
