import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { TenantAdminService, InvoiceSettings } from '../../services/tenantAdminService';
import { ImageService } from '../../services/imageService';
import { SPACING } from '../../constants/theme';
import PhoneInput from '../../components/PhoneInput';
import { getAllCountries, CountryInfo, CountryCode } from '../../utils/phoneUtils';

const SETTINGS_DOC_ID = 'invoiceSettings';

const AdminInvoiceSettingsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { tenantId } = useTenant();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Form state
  const [companyName, setCompanyName] = useState('');
  const [companyNameAr, setCompanyNameAr] = useState('');
  const [companyNameKu, setCompanyNameKu] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneDialCode, setPhoneDialCode] = useState('+1');
  const [phoneCountryCode, setPhoneCountryCode] = useState<CountryCode>('US');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [addressAr, setAddressAr] = useState('');
  const [addressKu, setAddressKu] = useState('');
  const [taxId, setTaxId] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Load existing settings
  useEffect(() => {
    // No tenant resolved yet: clear the spinner instead of hanging on it forever.
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const loadSettings = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const service = new TenantAdminService(tenantId);
        const data = await service.getSettings(SETTINGS_DOC_ID) as InvoiceSettings | null;
        // Drop stale results from a tenant we've already switched away from.
        if (cancelled) return;
        if (data) {
          setCompanyName(data.companyName || '');
          setCompanyNameAr(data.companyNameAr || '');
          setCompanyNameKu(data.companyNameKu || '');
          // Parse existing phone to extract dial code and local digits
          if (data.phone) {
            const allCountries = getAllCountries();
            // Sort by dial code length descending to match longest first (e.g. +964 before +9)
            const sorted = [...allCountries].sort((a, b) => b.dialCode.length - a.dialCode.length);
            const match = sorted.find(c => data.phone!.startsWith(c.dialCode));
            if (match) {
              setPhoneDialCode(match.dialCode);
              setPhoneCountryCode(match.code);
              setPhoneDigits(data.phone.slice(match.dialCode.length).trim());
            } else {
              // No matching dial code found, put everything in digits
              setPhoneDialCode('+1');
              setPhoneCountryCode('US');
              setPhoneDigits(data.phone.replace(/[^\d]/g, ''));
            }
          } else {
            setPhoneDialCode('+1');
            setPhoneCountryCode('US');
            setPhoneDigits('');
          }
          setEmail(data.email || '');
          setAddress(data.address || '');
          setAddressAr(data.addressAr || '');
          setAddressKu(data.addressKu || '');
          setTaxId(data.taxId || '');
          setWebsite(data.website || '');
          setLogoUrl(data.logoUrl || '');
        } else {
          // No settings for this tenant (e.g. after switching to a fresh tenant):
          // reset the whole form so the previous tenant's data can't remain on
          // screen and be re-saved under the new tenantId.
          setCompanyName('');
          setCompanyNameAr('');
          setCompanyNameKu('');
          setPhoneDigits('');
          setPhoneDialCode('+1');
          setPhoneCountryCode('US');
          setEmail('');
          setAddress('');
          setAddressAr('');
          setAddressKu('');
          setTaxId('');
          setWebsite('');
          setLogoUrl('');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load invoice settings:', err);
        // Flag the failure so the form isn't shown blank, which would let a Save
        // overwrite the tenant's real, previously-saved settings with empty values.
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const handlePickLogo = useCallback(async () => {
    try {
      const uri = await ImageService.showImagePicker();
      if (!uri) return;

      setUploadingLogo(true);
      const result = await ImageService.uploadImage(uri);
      if (result.success && result.url) {
        setLogoUrl(result.url);
      } else {
        Alert.alert(t('common.error'), t('admin.invoiceSettings.uploadLogoError', { defaultValue: 'Failed to upload logo' }));
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('admin.invoiceSettings.pickImageError', { defaultValue: 'Failed to pick image' }));
    } finally {
      setUploadingLogo(false);
    }
  }, [t]);

  const handleRemoveLogo = useCallback(() => {
    setLogoUrl('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!tenantId) return;

    // The initial load failed, so the form is blank/unreliable. Saving now would
    // overwrite the tenant's real invoice details with empty values — block it.
    if (loadError) {
      Alert.alert(
        t('common.error'),
        t('admin.invoiceSettings.loadFailedCannotSave', {
          defaultValue: 'Could not load your current settings. Please reload before saving to avoid overwriting your data.',
        })
      );
      return;
    }

    setSaving(true);
    try {
      const service = new TenantAdminService(tenantId);
      const settings: InvoiceSettings = {
        companyName: companyName.trim(),
        companyNameAr: companyNameAr.trim(),
        companyNameKu: companyNameKu.trim(),
        phone: (phoneDigits ? `${phoneDialCode}${phoneDigits}` : '').trim(),
        email: email.trim(),
        address: address.trim(),
        addressAr: addressAr.trim(),
        addressKu: addressKu.trim(),
        taxId: taxId.trim(),
        website: website.trim(),
        logoUrl,
      };
      await service.saveSettings(SETTINGS_DOC_ID, settings);
      Alert.alert(
        t('common.success'),
        t('admin.invoiceSettings.savedMessage', { defaultValue: 'Invoice settings saved successfully!' })
      );
    } catch (err) {
      Alert.alert(t('common.error'), t('admin.invoiceSettings.saveError', { defaultValue: 'Failed to save settings' }));
    } finally {
      setSaving(false);
    }
  }, [tenantId, loadError, companyName, companyNameAr, companyNameKu, phoneDigits, phoneDialCode, email, address, addressAr, addressKu, taxId, website, logoUrl, t]);

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    options?: { placeholder?: string; keyboardType?: any; multiline?: boolean; rtl?: boolean }
  ) => (
    <View style={styles.inputGroup}>
      <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <TextInput allowFontScaling={false}
        style={[
          styles.input,
          {
            backgroundColor: isDark ? theme.colors.background : '#F8F9FC',
            color: theme.colors.text,
            borderColor: theme.colors.border,
            textAlign: options?.rtl ? 'right' : 'left',
          },
          options?.multiline && styles.inputMultiline,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={options?.placeholder || ''}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType={options?.keyboardType || 'default'}
        multiline={options?.multiline}
        numberOfLines={options?.multiline ? 3 : 1}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#E0F7FA' }]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#E0F7FA' }]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.text }]}>
            {t('admin.invoiceSettings.loadError', { defaultValue: 'Could not load invoice settings. Check your connection and try again.' })}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => setReloadKey(k => k + 1)}
          >
            <Text allowFontScaling={false} style={styles.retryButtonText}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#E0F7FA' }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }]}>
          {t('admin.invoiceSettings.title', { defaultValue: 'Invoice Settings' })}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text allowFontScaling={false} style={[styles.saveButtonText, { color: theme.colors.primary }]}>
              {t('common.save', { defaultValue: 'Save' })}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Logo Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('admin.invoiceSettings.logo', { defaultValue: 'Invoice Logo' })}
            </Text>
            <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
              {t('admin.invoiceSettings.logoDescription', { defaultValue: 'This logo will appear at the top of your printed invoices' })}
            </Text>

            <View style={styles.logoContainer}>
              {logoUrl ? (
                <View style={styles.logoPreviewContainer}>
                  <Image
                    source={{ uri: logoUrl }}
                    style={styles.logoPreview}
                    resizeMode="contain"
                  />
                  <View style={styles.logoActions}>
                    <TouchableOpacity
                      style={[styles.logoActionButton, { backgroundColor: theme.colors.primary }]}
                      onPress={handlePickLogo}
                      disabled={uploadingLogo}
                    >
                      <Ionicons name="camera" size={18} color="#fff" />
                      <Text allowFontScaling={false} style={styles.logoActionText}>
                        {t('admin.invoiceSettings.changeLogo', { defaultValue: 'Change' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.logoActionButton, { backgroundColor: theme.colors.error || '#EF4444' }]}
                      onPress={handleRemoveLogo}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                      <Text allowFontScaling={false} style={styles.logoActionText}>
                        {t('admin.invoiceSettings.removeLogo', { defaultValue: 'Remove' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.logoPlaceholder, { borderColor: theme.colors.border }]}
                  onPress={handlePickLogo}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={40} color={theme.colors.textSecondary} />
                      <Text allowFontScaling={false} style={[styles.logoPlaceholderText, { color: theme.colors.textSecondary }]}>
                        {t('admin.invoiceSettings.uploadLogo', { defaultValue: 'Tap to upload logo' })}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Company Info Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('admin.invoiceSettings.companyInfo', { defaultValue: 'Company Information' })}
            </Text>

            {renderInput(
              t('admin.invoiceSettings.companyNameEn', { defaultValue: 'Company Name (English)' }),
              companyName,
              setCompanyName,
              { placeholder: 'e.g. Asankary' }
            )}
            {renderInput(
              t('admin.invoiceSettings.companyNameAr', { defaultValue: 'Company Name (العربية)' }),
              companyNameAr,
              setCompanyNameAr,
              { placeholder: 'e.g. Asankary', rtl: true }
            )}
            {renderInput(
              t('admin.invoiceSettings.companyNameKu', { defaultValue: 'Company Name (کوردی)' }),
              companyNameKu,
              setCompanyNameKu,
              { placeholder: 'e.g. Asankary', rtl: true }
            )}
          </View>

          {/* Contact Info Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('admin.invoiceSettings.contactInfo', { defaultValue: 'Contact Information' })}
            </Text>

            <View style={styles.inputGroup}>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.invoiceSettings.phone', { defaultValue: 'Phone Number' })}
              </Text>
              <PhoneInput
                value={phoneDigits}
                onChangeText={setPhoneDigits}
                onCountryChange={(country: CountryInfo) => setPhoneDialCode(country.dialCode)}
                defaultCountry={phoneCountryCode}
                label=""
              />
            </View>
            {renderInput(
              t('admin.invoiceSettings.email', { defaultValue: 'Email Address' }),
              email,
              setEmail,
              { placeholder: 'info@example.com', keyboardType: 'email-address' }
            )}
            {renderInput(
              t('admin.invoiceSettings.website', { defaultValue: 'Website' }),
              website,
              setWebsite,
              { placeholder: 'www.example.com', keyboardType: 'url' }
            )}
          </View>

          {/* Address Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('admin.invoiceSettings.addressSection', { defaultValue: 'Address' })}
            </Text>

            {renderInput(
              t('admin.invoiceSettings.addressEn', { defaultValue: 'Address (English)' }),
              address,
              setAddress,
              { placeholder: 'Street, City, Country', multiline: true }
            )}
            {renderInput(
              t('admin.invoiceSettings.addressAr', { defaultValue: 'Address (العربية)' }),
              addressAr,
              setAddressAr,
              { placeholder: 'الشارع، المدينة، البلد', multiline: true, rtl: true }
            )}
            {renderInput(
              t('admin.invoiceSettings.addressKu', { defaultValue: 'Address (کوردی)' }),
              addressKu,
              setAddressKu,
              { placeholder: 'شەقام، شار، وڵات', multiline: true, rtl: true }
            )}
          </View>

          {/* Tax / Registration Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('admin.invoiceSettings.taxSection', { defaultValue: 'Tax & Registration' })}
            </Text>

            {renderInput(
              t('admin.invoiceSettings.taxId', { defaultValue: 'Tax ID / Registration Number' }),
              taxId,
              setTaxId,
              { placeholder: t('checkout.optional') }
            )}
          </View>

          {/* Info note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.infoNoteText, { color: theme.colors.textSecondary }]}>
              {t('admin.invoiceSettings.infoNote', { defaultValue: 'These details will appear on all printed invoices. Leave fields empty to use default values.' })}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  container: {
    flex: 1,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: SPACING.sm,
  },
  infoNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 40,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  inputGroup: {
    marginTop: SPACING.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logoActionButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.md,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  logoPlaceholder: {
    alignItems: 'center',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 2,
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 30,
    width: '100%',
  },
  logoPlaceholderText: {
    fontSize: 14,
    fontWeight: '500',
  },
  logoPreview: {
    borderRadius: 10,
    height: 100,
    width: 200,
  },
  logoPreviewContainer: {
    alignItems: 'center',
  },
  retryButton: {
    borderRadius: 10,
    marginTop: SPACING.lg,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    paddingVertical: SPACING.md,
  },
  section: {
    borderRadius: 12,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
    padding: SPACING.lg,
    // Card shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default AdminInvoiceSettingsScreen;
