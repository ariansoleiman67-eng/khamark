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
  accentSoft: '#FF762210',
  heading: '#1A1D26',
  body: '#32343E',
  muted: '#8F95A3',
  placeholder: '#B0B5C3',
  border: '#E8ECF0',
  error: '#E84855',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { input: 18, button: 18, back: 22, card: 20 };

/**
 * Admin Screen 2 — Store Name (the hero screen)
 * One purpose: name your store. Live preview below.
 */
const AdminStoreNameScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const { method, phone, email } = route.params || {};

  const [storeName, setStoreName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleContinue = () => {
    setErrorMessage('');
    if (!storeName.trim()) {
      setErrorMessage(t('auth.adminSetup.requireStoreName', { defaultValue: 'Please enter a store name.' }));
      return;
    }
    navigation.navigate('AdminDetails' as any, {
      method,
      phone,
      email,
      storeName: storeName.trim(),
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
          <Text allowFontScaling={false} style={styles.title}>{t('auth.adminSetup.storeNameTitle', { defaultValue: 'Store name' })}</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            {t('auth.adminSetup.storeNameSubtitle', { defaultValue: 'Choose a name for your store. This will appear to customers.' })}
          </Text>

          {/* ── Store Name Input (big, hero) ── */}
          <View style={styles.inputGroup}>
            <Text allowFontScaling={false} style={styles.label}>{t('auth.adminSetup.storeNameLabel', { defaultValue: 'Store Name' })}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="storefront-outline" size={18} color={LUX.placeholder} style={{ marginRight: 12 }} />
              <TextInput allowFontScaling={false}
                style={styles.input}
                placeholder={t('auth.adminSetup.storeNamePlaceholder', { defaultValue: 'My Awesome Store' })}
                placeholderTextColor={LUX.placeholder}
                value={storeName}
                onChangeText={(text) => { setStoreName(text); setErrorMessage(''); }}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
              />
            </View>
          </View>

          {/* ── Live Preview Card ── */}
          <View style={styles.previewCard}>
            <View style={styles.previewIconCircle}>
              <Ionicons name="storefront" size={24} color={LUX.accent} />
            </View>
            <Text allowFontScaling={false} style={styles.previewName}>
              {storeName.trim() || t('auth.adminSetup.yourStore', { defaultValue: 'Your Store' })}
            </Text>
            <Text allowFontScaling={false} style={styles.previewHint}>{t('auth.adminSetup.preview', { defaultValue: 'Preview' })}</Text>
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
    marginBottom: SPACING.xl,
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
  previewCard: {
    alignItems: 'center',
    backgroundColor: LUX.surface,
    borderColor: LUX.border,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  previewHint: {
    color: LUX.placeholder,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  previewIconCircle: {
    alignItems: 'center',
    backgroundColor: LUX.accentSoft,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    width: 48,
  },
  previewName: {
    color: LUX.heading,
    fontSize: 20,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: RADIUS.button,
    height: 52,
    justifyContent: 'center',
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

export default AdminStoreNameScreen;
