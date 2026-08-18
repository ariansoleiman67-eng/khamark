import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { SPACING } from '../../constants/theme';
interface ShippingFormData {
  recipientName: string;
  mobileNumber: string;
  officeName: string;
  officePhone: string;
}

interface FormErrors {
  recipientName?: string;
  mobileNumber?: string;
  officeName?: string;
  officePhone?: string;
}

const ShippingInfoScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation();
  const { user } = useAuth();

  const [formData, setFormData] = useState<ShippingFormData>({
    recipientName: '',
    mobileNumber: '',
    officeName: '',
    officePhone: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Load shipping info on mount
  const loadShippingInfo = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('shipping_info')
        .eq('id', user.uid)
        .single();

      // postgrest resolves a failed read as { data: null, error } instead of
      // throwing, so the error has to be checked explicitly — otherwise a read
      // failure looks exactly like "nothing saved yet". PGRST116 = no row, which
      // genuinely means nothing saved yet.
      if (error && (error as any).code !== 'PGRST116') throw error;

      setLoadError(false);
      if (data?.shipping_info) {
        const info = data.shipping_info;
        setFormData({
          recipientName: info.recipientName || '',
          mobileNumber: info.mobileNumber || '',
          officeName: info.officeName || '',
          officePhone: info.officePhone || '',
        });
      }
    } catch (error) {
      console.error('Error loading shipping info:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadShippingInfo();
  }, [loadShippingInfo]);

  // Validate phone number
  const isValidPhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 7 && cleaned.length <= 15;
  };

  // Validate field
  const validateField = (field: keyof ShippingFormData, value: string): string | undefined => {
    if (!value.trim()) {
      return t('validation.required');
    }
    if ((field === 'mobileNumber' || field === 'officePhone') && !isValidPhone(value)) {
      return t('shippingInfo.invalidPhone');
    }
    return undefined;
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    newErrors.recipientName = validateField('recipientName', formData.recipientName);
    newErrors.mobileNumber = validateField('mobileNumber', formData.mobileNumber);
    newErrors.officeName = validateField('officeName', formData.officeName);
    newErrors.officePhone = validateField('officePhone', formData.officePhone);
    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  };

  // Handle input change
  const handleInputChange = (field: keyof ShippingFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm() || !user?.uid) return;

    setSaving(true);
    try {
      const shipping_info = {
        recipientName: formData.recipientName.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        officeName: formData.officeName.trim(),
        officePhone: formData.officePhone.trim(),
      };
      
      const { error } = await supabase
        .from('users')
        .update({ shipping_info })
        .eq('id', user.uid);
        
      if (error) throw error;

      Alert.alert(
        t('common.success'),
        t('shippingInfo.saved'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('shippingInfo.saveFailed', { defaultValue: 'Failed to save' }));
    } finally {
      setSaving(false);
    }
  };

  // Loading skeleton
  if (loading && !initialLoadDone) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            padding: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={{
              fontSize: 18,
              fontWeight: '600',
              color: theme.colors.text,
              marginLeft: isRTL ? 0 : SPACING.md,
              marginRight: isRTL ? SPACING.md : 0,
            }}>
              {t('shippingInfo.title')}
            </Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: isRTL ? 0 : SPACING.md,
            marginRight: isRTL ? SPACING.md : 0,
            flex: 1,
            textAlign: isRTL ? 'right' : 'left',
          }}>
            {t('shippingInfo.title')}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ padding: SPACING.md }}>
              {/* Load failure — distinct from "nothing saved yet", with a retry */}
              {loadError && (
                <View style={{
                  backgroundColor: theme.colors.error + '10',
                  padding: SPACING.md,
                  borderRadius: 12,
                  marginBottom: SPACING.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.error + '20',
                }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={24}
                      color={theme.colors.error}
                      style={{ marginTop: 2 }}
                    />
                    <View style={{
                      flex: 1,
                      marginLeft: isRTL ? 0 : SPACING.sm,
                      marginRight: isRTL ? SPACING.sm : 0,
                    }}>
                      <Text allowFontScaling={false} style={{
                        fontSize: 14,
                        color: theme.colors.error,
                        lineHeight: 20,
                        textAlign: isRTL ? 'right' : 'left',
                      }}>
                        {t('shippingInfo.loadFailed')}
                      </Text>
                      <TouchableOpacity
                        onPress={loadShippingInfo}
                        disabled={loading}
                        style={{ marginTop: SPACING.sm, alignSelf: isRTL ? 'flex-end' : 'flex-start' }}
                      >
                        <Text allowFontScaling={false} style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: theme.colors.primary,
                        }}>
                          {t('common.retry')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* Info Banner */}
              <View style={{
                backgroundColor: theme.colors.primary + '10',
                padding: SPACING.md,
                borderRadius: 12,
                marginBottom: SPACING.lg,
                borderWidth: 1,
                borderColor: theme.colors.primary + '20',
              }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                  <Ionicons
                    name="cube-outline"
                    size={24}
                    color={theme.colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{
                    flex: 1,
                    marginLeft: isRTL ? 0 : SPACING.sm,
                    marginRight: isRTL ? SPACING.sm : 0,
                  }}>
                    <Text allowFontScaling={false} style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.colors.primary,
                      marginBottom: SPACING.xs,
                      textAlign: isRTL ? 'right' : 'left',
                    }}>
                      {t('shippingInfo.subtitle')}
                    </Text>
                    <Text allowFontScaling={false} style={{
                      fontSize: 14,
                      color: theme.colors.primary,
                      lineHeight: 20,
                      textAlign: isRTL ? 'right' : 'left',
                    }}>
                      {t('shippingInfo.description', { defaultValue: 'Enter the details of the shipping office where your orders will be delivered.' })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Recipient Name */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {t('shippingInfo.recipientName')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.recipientName}
                  onChangeText={(value) => handleInputChange('recipientName', value)}
                  placeholder={t('shippingInfo.recipientNamePlaceholder')}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.recipientName ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlignVertical: 'center',
                    height: 48,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.recipientName && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>
                    {errors.recipientName}
                  </Text>
                )}
              </View>

              {/* Mobile Number */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {t('shippingInfo.mobileNumber')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.mobileNumber}
                  onChangeText={(value) => handleInputChange('mobileNumber', value)}
                  placeholder={t('shippingInfo.mobileNumberPlaceholder')}
                  keyboardType="phone-pad"
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.mobileNumber ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlignVertical: 'center',
                    height: 48,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.mobileNumber && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>
                    {errors.mobileNumber}
                  </Text>
                )}
              </View>

              {/* Shipping Office Name */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {t('shippingInfo.officeName')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.officeName}
                  onChangeText={(value) => handleInputChange('officeName', value)}
                  placeholder={t('shippingInfo.officeNamePlaceholder')}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.officeName ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlignVertical: 'center',
                    height: 48,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.officeName && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>
                    {errors.officeName}
                  </Text>
                )}
              </View>

              {/* Shipping Office Phone */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {t('shippingInfo.officePhone')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.officePhone}
                  onChangeText={(value) => handleInputChange('officePhone', value)}
                  placeholder={t('shippingInfo.officePhonePlaceholder')}
                  keyboardType="phone-pad"
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.officePhone ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlignVertical: 'center',
                    height: 48,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.officePhone && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>
                    {errors.officePhone}
                  </Text>
                )}
              </View>

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 12,
                  padding: SPACING.md,
                  alignItems: 'center',
                  marginTop: SPACING.md,
                  marginBottom: SPACING.xl,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text allowFontScaling={false} style={{
                    color: 'white',
                    fontSize: 16,
                    fontWeight: '600',
                  }}>
                    {t('shippingInfo.save')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

export default ShippingInfoScreen;
