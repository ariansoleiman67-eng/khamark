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
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../components/ThemeProvider';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// ─── Static Design Tokens (theme colours come from useTheme) ─────────────
const LUX = {
  inputBg: '#F4F6F9',
  accent: '#FF7622',
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
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();

  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : LUX.inputBg;
  const styles = useMemo(() => createStyles(colors, isRTL, inputBg), [colors, isRTL, inputBg]);

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
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.text} />
          </TouchableOpacity>

          {/* ── Headline ── */}
          <Text allowFontScaling={false} style={styles.title}>{t('auth.adminSetup.adminDetailsTitle', { defaultValue: 'Admin details' })}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>{t('auth.adminSetup.adminDetailsSubtitle', { defaultValue: 'Tell us about yourself.' })}</Text>

          {/* ── Full Name ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('auth.adminSetup.fullName', { defaultValue: 'Full Name' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={colors.placeholder} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.adminSetup.namePlaceholder', { defaultValue: 'John Doe' })}
                placeholderTextColor={colors.placeholder}
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
              <Ionicons name="logo-whatsapp" size={18} color={colors.placeholder} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder="+964 780 123 4567"
                placeholderTextColor={colors.placeholder}
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

const createStyles = (colors: any, isRTL: boolean, inputBg: string) => StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: isRTL ? 'flex-end' : 'flex-start',
    backgroundColor: colors.card,
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
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
    textAlign: isRTL ? 'right' : 'left',
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
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
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

export default AdminDetailsScreen;
