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
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../components/ThemeProvider';
import { isPhoneRegistered } from '../../services/auth';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getCountryInfo, CountryCode } from '../../utils/phoneUtils';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  inputBg: '#F4F6F9',
  accent: '#8B5CF6',
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
 * Partner sign-up (reached by the 3-tap gesture on the login title).
 * Creates a VIEW-ONLY partner account: no store, passwordless (phone OTP). After verify,
 * VerifyPhone (partner-register mode) calls create_partner_account. The store owner then
 * shares products with this number from Partner Management.
 */
const PartnerSignupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const styles = useMemo(() => createStyles(colors, isDark, isRTL), [colors, isDark, isRTL]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('IQ');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSendCode = async () => {
    setErrorMessage('');
    if (!name.trim()) {
      setErrorMessage(t('auth.partnerSetup.requiredName', { defaultValue: 'Please enter a name' }));
      return;
    }
    if (!phone.trim()) {
      setErrorMessage(t('auth.partnerSetup.requiredPhone', { defaultValue: 'Please enter a phone number' }));
      return;
    }
    try {
      setLoading(true);
      const countryInfo = getCountryInfo(selectedCountry);
      const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
      const formattedPhone = `${countryInfo.dialCode}${cleanPhone}`;

      const exists = await isPhoneRegistered(formattedPhone);
      if (exists) {
        setErrorMessage(t('auth.partnerSetup.phoneExists', { defaultValue: 'This phone is already registered' }));
        return;
      }

      // The OTP is sent on the VerifyPhone screen (partner-register mode), which then
      // promotes this user to a view-only partner on successful verification.
      navigation.navigate('VerifyPhone' as any, {
        mode: 'partner-register',
        phone: formattedPhone,
        name: name.trim(),
      });
    } catch (error: any) {
      setErrorMessage(error.message || t('common.error', { defaultValue: 'Something went wrong' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.iconBadge}>
          <Ionicons name="eye-outline" size={28} color={LUX.accent} />
        </View>
        <AppText style={styles.title}>{t('auth.partnerSetup.title', { defaultValue: 'Partner account' })}</AppText>
        <AppText style={styles.subtitle}>
          {t('auth.partnerSetup.subtitle', { defaultValue: 'A view-only account. The store owner shares products with this number so you can see them.' })}
        </AppText>

        <AppText style={styles.label}>{t('auth.partnerSetup.name', { defaultValue: 'Name' })}</AppText>
        <TextInput allowFontScaling={false}
          value={name}
          onChangeText={(v) => { setName(v); setErrorMessage(''); }}
          placeholder={t('auth.partnerSetup.namePlaceholder', { defaultValue: 'Partner / shop name' })}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          autoCapitalize="words"
        />

        <View style={{ marginTop: SPACING.md }}>
          <PhoneInput
            label={t('auth.partnerSetup.phone', { defaultValue: 'Phone number' })}
            value={phone}
            defaultCountry="IQ"
            onChangeText={(text) => { setPhone(text); setErrorMessage(''); }}
            onCountryChange={(c) => setSelectedCountry(c.code)}
          />
        </View>

        {errorMessage ? <AppText style={styles.error}>{errorMessage}</AppText> : null}

        <TouchableOpacity onPress={handleSendCode} disabled={loading} style={[styles.button, { opacity: loading ? 0.7 : 1 }]} activeOpacity={0.9}>
          {loading ? <ActivityIndicator color="#fff" /> : <AppText style={styles.buttonText}>{t('auth.partnerSetup.sendCode', { defaultValue: 'Send code' })}</AppText>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any, isDark: boolean, isRTL: boolean) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  backBtn: { width: RADIUS.back * 2, height: RADIUS.back * 2, borderRadius: RADIUS.back, alignItems: 'center', justifyContent: 'center', alignSelf: isRTL ? 'flex-end' : 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  iconBadge: { width: 60, height: 60, borderRadius: 18, backgroundColor: isDark ? 'rgba(139,92,246,0.20)' : '#8B5CF615', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: SPACING.md, textAlign: isRTL ? 'right' : 'left' },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: SPACING.xs, lineHeight: 20, textAlign: isRTL ? 'right' : 'left' },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: SPACING.lg, marginBottom: SPACING.xs, textAlign: isRTL ? 'right' : 'left' },
  input: { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : LUX.inputBg, borderRadius: RADIUS.input, paddingHorizontal: SPACING.md, height: 54, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' },
  error: { color: colors.error, fontSize: 13, marginTop: SPACING.md, fontWeight: '600', textAlign: isRTL ? 'right' : 'left' },
  button: { backgroundColor: LUX.accent, borderRadius: RADIUS.button, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

export default PartnerSignupScreen;
