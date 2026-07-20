import React, { useState, useEffect } from 'react';
import { isSyntheticEmail } from '../../utils/hashUtils';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { SPACING } from '../../constants/theme';
import settingsService from '../../services/settingsService';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { BusinessInfo } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { getAllCountries, CountryInfo, CountryCode } from '../../utils/phoneUtils';

const AdminBusinessInfoScreen = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<BusinessInfo>>({
    name: '',
    address: '',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    taxId: '',
    description: '',
  });

  // Phone input state
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneDialCode, setPhoneDialCode] = useState('+1');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('US');

  // WhatsApp input state
  const [waDigits, setWaDigits] = useState('');
  const [waDialCode, setWaDialCode] = useState('+1');
  const [waCountry, setWaCountry] = useState<CountryCode>('US');

  // Helper: parse a full phone string into { dialCode, digits, countryCode }
  const parsePhoneNumber = (phone: string) => {
    const allC = getAllCountries();
    const sorted = [...allC].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const match = sorted.find(c => phone.startsWith(c.dialCode));
    if (match) {
      return { dialCode: match.dialCode, digits: phone.slice(match.dialCode.length).trim(), countryCode: match.code };
    }
    return { dialCode: '+1', digits: phone.replace(/[^\d]/g, ''), countryCode: 'US' as CountryCode };
  };

  const fetchBusinessInfo = async (isActive: () => boolean = () => true) => {
    try {
      setLoading(true);

      // First try to get data from the tenant row (business_info jsonb)
      if (tenantId) {
        const { data: tenantData, error } = await supabase
          .from('tenants')
          .select('store_name, business_info')
          .eq('id', tenantId)
          .single();
        // Bail if a newer fetch (tenant switch / unmount) superseded this one.
        if (!isActive()) return;
        if (!error && tenantData) {
          const info = tenantData.business_info || {};
          const rawEmail = info.email || '';
          // ALWAYS use tenant data if tenantId exists, even if empty
          setFormData({
            name: info.name || tenantData.store_name || '',
            address: info.address || '',
            phone: info.phone || '',
            whatsapp: info.whatsapp || '',
            email: isSyntheticEmail(rawEmail) ? '' : rawEmail,
            website: info.website || '',
            taxId: info.taxId || '',
            description: info.description || '',
          });
          // Parse phone
          if (info.phone) {
            const parsed = parsePhoneNumber(info.phone);
            setPhoneDialCode(parsed.dialCode);
            setPhoneDigits(parsed.digits);
            setPhoneCountry(parsed.countryCode);
          }
          // Parse whatsapp
          if (info.whatsapp) {
            const parsed = parsePhoneNumber(info.whatsapp);
            setWaDialCode(parsed.dialCode);
            setWaDigits(parsed.digits);
            setWaCountry(parsed.countryCode);
          }
          setLoading(false);
          return;
        }
      }

      // Fallback to global settings ONLY if no tenantId (legacy/super admin?)
      // But for multi-tenant, we should probably start empty or default
      if (!tenantId) {
        const data = await settingsService.getBusinessInfo();
        // Bail if a newer fetch (tenant switch / unmount) superseded this one.
        if (!isActive()) return;
        if (data) {
          setFormData(data);
          // Parse phone
          if (data.phone) {
            const parsed = parsePhoneNumber(data.phone);
            setPhoneDialCode(parsed.dialCode);
            setPhoneDigits(parsed.digits);
            setPhoneCountry(parsed.countryCode);
          }
          // Parse whatsapp
          if (data.whatsapp) {
            const parsed = parsePhoneNumber(data.whatsapp);
            setWaDialCode(parsed.dialCode);
            setWaDigits(parsed.digits);
            setWaCountry(parsed.countryCode);
          }
        }
      }
    } catch (error) {
      if (!isActive()) return;
      console.error('Error fetching business info:', error);
      Alert.alert(t('admin.common.error'), t('admin.businessInfo.failed'));
    } finally {
      if (isActive()) setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchBusinessInfo(() => !ignore);
    return () => { ignore = true; };
  }, [tenantId]);

  const handleSave = async () => {
    const fullPhone = phoneDigits ? `${phoneDialCode}${phoneDigits}` : '';
    const fullWhatsapp = waDigits ? `${waDialCode}${waDigits}` : '';

    if (!formData.name || !formData.address || !fullPhone || !formData.email) {
      Alert.alert(t('admin.common.error'), t('validation.required'));
      return;
    }

    try {
      setSaving(true);
      
      // Save to the tenant row's business_info jsonb (read by tenantInfoService
      // for WhatsApp support in order details). Also keep store_name in sync.
      if (tenantId) {
        const businessInfo = {
          name: formData.name,
          phone: fullPhone,
          whatsapp: fullWhatsapp || fullPhone.replace(/[^0-9]/g, ''),
          email: formData.email,
          address: formData.address,
          website: formData.website || null,
          taxId: formData.taxId || null,
          description: formData.description || null,
        };
        const { error } = await supabase
          .from('tenants')
          .update({ store_name: formData.name, business_info: businessInfo })
          .eq('id', tenantId);
        if (error) throw error;
      }

      // ALIBABA ALWAYS save to global settings so regular buyers (who don't have a tenantId yet) 
      // get the updated exchange rate and business info!
      await settingsService.updateBusinessInfo({
        ...formData,
        phone: fullPhone,
        whatsapp: fullWhatsapp,
      });
      
      Alert.alert(t('admin.common.success'), t('admin.businessInfo.success'));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving business info:', error);
      Alert.alert(t('admin.common.error'), t('admin.businessInfo.failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof BusinessInfo, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons
          name={isRTL ? 'arrow-forward' : 'arrow-back'}
          size={24}
          color={theme.colors.text}
          onPress={() => navigation.goBack()}
        />
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.businessInfo.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Without keyboardShouldPersistTaps the first tap on Save (or any control)
          while an input is focused is consumed dismissing the keyboard, so the
          press is swallowed and the admin has to tap twice. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.businessInfo.generalInfo')}
          </Text>
          
          <Input
            label={t('admin.businessInfo.businessName') + ' *'}
            value={formData.name}
            onChangeText={(text) => handleChange('name', text)}
            placeholder={t('admin.businessInfo.businessNamePlaceholder')}
            containerStyle={styles.input}
          />

          <View style={styles.input}>
            <Text allowFontScaling={false} style={[styles.phoneLabel, { color: theme.colors.text }]}>
              {t('admin.businessInfo.phoneNumber') + ' *'}
            </Text>
            <PhoneInput
              value={phoneDigits}
              onChangeText={setPhoneDigits}
              onCountryChange={(country: CountryInfo) => setPhoneDialCode(country.dialCode)}
              defaultCountry={phoneCountry}
              label=""
            />
          </View>

          <View style={styles.input}>
            <Text allowFontScaling={false} style={[styles.phoneLabel, { color: theme.colors.text }]}>
              {t('admin.businessInfo.whatsappNumber')}
            </Text>
            <PhoneInput
              value={waDigits}
              onChangeText={setWaDigits}
              onCountryChange={(country: CountryInfo) => setWaDialCode(country.dialCode)}
              defaultCountry={waCountry}
              label=""
            />
          </View>
          <Text allowFontScaling={false} style={[styles.hintText, { color: theme.colors.textSecondary }]}>
            {t('admin.businessInfo.whatsappHint')}
          </Text>

          <Input
            label={t('admin.businessInfo.emailAddress') + ' *'}
            value={formData.email}
            onChangeText={(text) => handleChange('email', text)}
            placeholder={t('admin.businessInfo.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={styles.input}
          />

          <Input
            label={t('admin.businessInfo.description')}
            value={formData.description}
            onChangeText={(text) => handleChange('description', text)}
            placeholder={t('admin.businessInfo.descriptionPlaceholder')}
            multiline
            numberOfLines={3}
            containerStyle={styles.input}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.businessInfo.locationLegal')}
          </Text>

          <Input
            label={t('admin.businessInfo.address') + ' *'}
            value={formData.address}
            onChangeText={(text) => handleChange('address', text)}
            placeholder={t('admin.businessInfo.addressPlaceholder')}
            multiline
            containerStyle={styles.input}
          />

          <Input
            label={t('admin.businessInfo.taxId')}
            value={formData.taxId}
            onChangeText={(text) => handleChange('taxId', text)}
            placeholder={t('admin.businessInfo.taxIdPlaceholder')}
            containerStyle={styles.input}
          />

           <Input
            label={t('admin.businessInfo.website')}
            value={formData.website}
            onChangeText={(text) => handleChange('website', text)}
            placeholder={t('admin.businessInfo.websitePlaceholder')}
            keyboardType="url"
            autoCapitalize="none"
            containerStyle={styles.input}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { 
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.border 
      }]}>
        <Button
          title={t('admin.businessInfo.saveChanges')}
          onPress={handleSave}
          loading={saving}
          style={styles.saveButton}
        />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    elevation: 2,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  flex: {
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    padding: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? 30 : SPACING.md,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  hintText: {
    fontSize: 12,
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
    paddingHorizontal: 4,
  },
  input: {
    marginBottom: SPACING.md,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  phoneLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  saveButton: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
});

export default AdminBusinessInfoScreen;
