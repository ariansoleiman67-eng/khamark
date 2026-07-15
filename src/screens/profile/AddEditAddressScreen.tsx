import React, { useState, useEffect } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import Button from '../../components/Button';
import { SPACING } from '../../constants/theme';
import addressService, { AddressInput } from '../../services/addressService';
import { Address } from '../../types';
import { getCountryByCode, getCityByCode, COUNTRIES, normalizeForSearch } from '../../constants/countries';
import PhoneNumberService from '../../services/phoneNumberService';
import * as Location from 'expo-location';
import SimpleMapPicker from '../../components/SimpleMapPicker';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FormData {
  title: string;
  fullName: string;
  address: string;
  countryCode: string;
  cityCode: string;
  city: string; // For backward compatibility
  region: string; // For backward compatibility
  phone: string;
  isDefault: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

interface FormErrors {
  title?: string;
  fullName?: string;
  address?: string;
  countryCode?: string;
  cityCode?: string;
  phone?: string;
}

type AddEditAddressRouteProp = RouteProp<{
  AddEditAddress: {
    address?: Address;
  };
}, 'AddEditAddress'>;

const AddEditAddressScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation();
  const route = useRoute<AddEditAddressRouteProp>();
  const { user } = useAuth();

  const params = route.params as any;
  const address = params?.address;
  // Determine if we're editing based on whether an address is provided
  const isEditing = !!address;

  // State for checking if this is the first address
  const [isFirstAddress, setIsFirstAddress] = useState(false);

  // State
  const [formData, setFormData] = useState<FormData>({
    title: '',
    fullName: '',
    address: '',
    countryCode: '',
    cityCode: '',
    city: '',
    region: '',
    phone: '',
    isDefault: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);
  
  
  const isMountedRef = React.useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check if this is the user's first address
  useEffect(() => {
    const checkFirstAddress = async () => {
      if (!isEditing && user?.uid) {
        try {
          const existingAddresses = await addressService.getUserAddresses(user.uid);
          if (isMountedRef.current) { // Guard against unmounted component
            setIsFirstAddress(existingAddresses.length === 0);
          }
        } catch (error) {
          console.error('Error checking existing addresses:', error);
        }
      }
    };
    checkFirstAddress();
  }, [isEditing, user?.uid]);

  // Handle dynamic auto-fill for title based on selected language
  useEffect(() => {
    const currentLang = i18n.language; // subscribe to language changes
    if (!isEditing && !isTitleManuallyEdited) {
      setFormData(prev => ({
        ...prev,
        title: t('addresses.defaultTitle', { defaultValue: 'Shop' })
      }));
    }
  }, [isEditing, isTitleManuallyEdited, i18n.language, t]);

  // Load address data if editing
  useEffect(() => {
    if (isEditing && address) {
      // Resolve codes to full names for display
      const country = getCountryByCode(address.countryCode || '');
      const city = getCityByCode(address.countryCode || '', address.cityCode || '');
      setFormData({
        title: address.title,
        fullName: address.fullName,
        address: address.address,
        countryCode: country?.name || address.countryCode || '',
        cityCode: city?.name || address.cityCode || '',
        city: address.city,
        region: address.region,
        phone: address.phone,
        isDefault: address.isDefault,
        coordinates: address.coordinates,
      });
    } else {
      // Set default country and city for new addresses from onboarding
      const loadDefaults = async () => {
        try {
          const regionStr = await AsyncStorage.getItem('user_region');
          const cityStr = await AsyncStorage.getItem('user_city');
          
          let defaultCountry = '';
          let defaultCity = '';
          let defaultPhone = '';
          let addressStreet = '';
          let resolvedCoordinates: { latitude: number; longitude: number } | undefined;
          
          // TRY AUTO-FILL IF PERMISSION GRANTED
          try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              resolvedCoordinates = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              };
              
              const geocode = await Location.reverseGeocodeAsync(resolvedCoordinates);
              if (geocode && geocode.length > 0) {
                const g = geocode[0];
                if (g.country) defaultCountry = g.country;
                
                // Extract phone code from location
                if (g.isoCountryCode) {
                  const locCountry = getCountryByCode(g.isoCountryCode);
                  if (locCountry) {
                    defaultPhone = locCountry.phoneCode;
                  }
                }

                if (g.city || g.subregion) defaultCity = g.city || g.subregion || '';
                
                // Build a more descriptive street address
                const addressParts = [
                  g.name && g.name !== g.street && g.name !== g.city && g.name !== g.country ? g.name : '',
                  g.streetNumber ? g.streetNumber : '',
                  g.street ? g.street : '',
                  g.district ? g.district : ''
                ].filter(Boolean);
                
                if (addressParts.length > 0) {
                  addressStreet = addressParts.join(', ');
                } else if (g.name && g.name !== g.city && g.name !== g.country) {
                  addressStreet = g.name;
                } else if ((g as any).formattedAddress) {
                  addressStreet = (g as any).formattedAddress;
                }
              }
            }
          } catch (e) {
            console.warn('Auto-fill location skipped', e);
          }
          
          if (!defaultCountry && regionStr) {
            const regionData = JSON.parse(regionStr);
            // In AddEditAddressScreen, countryCode input field currently takes the name (or code which gets resolved later)
            // It's safer to use the 'name' so it gets shown nicely and resolved properly on save
            defaultCountry = regionData.name || regionData.code || '';
            
            // Auto prefix phone if Iraq or we can lookup the phoneCode if needed
            if (!defaultPhone) {
              const foundCountry = getCountryByCode(regionData.code);
              if (foundCountry) {
                defaultPhone = foundCountry.phoneCode;
              }
            }
          }
          if (!defaultCity && cityStr) {
            const cityData = JSON.parse(cityStr);
            defaultCity = cityData.name || cityData.code || '';
          }
          
          setFormData(prev => ({
            ...prev,
            title: prev.title || t('addresses.defaultTitle', { defaultValue: 'Shop' }),
            fullName: prev.fullName || user?.name || '',
            countryCode: prev.countryCode || defaultCountry,
            cityCode: prev.cityCode || defaultCity,
            phone: prev.phone || user?.phone || defaultPhone,
            address: prev.address || addressStreet,
            coordinates: resolvedCoordinates,
            city: '',
            region: ''
          }));
        } catch (e) {
          // Fallback
          setFormData(prev => ({
            ...prev,
            countryCode: '',
            cityCode: '',
            city: '',
            region: ''
          }));
        }
      };
      
      loadDefaults();
    }
  }, [isEditing, address]);

  // Validation functions
  const validateField = (field: keyof FormData, value: string): string | undefined => {
    switch (field) {
      case 'title':
        if (!value.trim()) return t('validation.required');
        if (value.trim().length < 2) return t('validation.minLength', { min: 2 });
        return undefined;

      case 'fullName':
        if (!value.trim()) return t('validation.required');
        if (value.trim().length < 2) return t('validation.minLength', { min: 2 });
        return undefined;

      case 'address':
        if (!value.trim()) return t('validation.required');
        if (value.trim().length < 5) return t('addresses.detailedAddressRequired');
        return undefined;

      case 'countryCode':
        if (!value.trim()) return t('validation.required');
        return undefined;

      case 'cityCode':
        if (!value.trim()) return t('validation.required');
        return undefined;

      case 'phone': {
        if (!value.trim()) return t('validation.required');
        
        // Use provided country code slightly deeper logic:
        // 1. Try forms country code
        // 2. If invalid/missing, try detecting from phone number
        let countryCodeToUse = formData.countryCode;
        const formCountry = getCountryByCode(countryCodeToUse);
        
        if (!formCountry) {
          const detectedCode = PhoneNumberService.detectCountryFromPhone(value);
          if (detectedCode) {
            countryCodeToUse = detectedCode;
          }
        }
        
        const phoneValidation = PhoneNumberService.validatePhone(value, countryCodeToUse);
        if (!phoneValidation.isValid) {
          return phoneValidation.error;
        }
        return undefined;
      }

      default:
        return undefined;
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    newErrors.title = validateField('title', formData.title);
    newErrors.fullName = validateField('fullName', formData.fullName);
    newErrors.address = validateField('address', formData.address);
    newErrors.countryCode = validateField('countryCode', formData.countryCode);
    newErrors.cityCode = validateField('cityCode', formData.cityCode);
    newErrors.phone = validateField('phone', formData.phone);

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  };


  // Handle input change
  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    if (field === 'title') {
      setIsTitleManuallyEdited(true);
    }
    
    setFormData(prev => {
      // Create new form data with the updated field
      const newFormData: FormData = {
        ...prev,
        [field]: value
      };

      // Special handling for country change
      if (field === 'countryCode' && typeof value === 'string') {
        const trimmedValue = value.trim().toLowerCase();
        
        // Find matching country
        const searchInput = normalizeForSearch(value);
        const countryMatch = COUNTRIES.find(c => 
          c.code.toLowerCase() === trimmedValue ||
          normalizeForSearch(c.name) === searchInput ||
          normalizeForSearch(c.nameAr) === searchInput ||
          normalizeForSearch(c.nameKu) === searchInput
        );

        if (countryMatch) {
          // IMPORTANT: Only update if the phone is empty or doesn't already start with the code
          // Or per user request "auto change", maybe just force update it?
          // Let's force update the prefix, but keep the rest if possible?
          // No, safer to just set the prefix as a starting point if it's different
          
          // Check if current phone already has this code
          if (!prev.phone.startsWith(countryMatch.phoneCode)) {
             newFormData.phone = countryMatch.phoneCode;
          }
        }
      }

      return newFormData;
    });

    // Clear error for this field
    if (typeof value === 'string' && errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };


  // Request location permission
  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('location.permissionDenied'),
          t('location.permissionRequired')
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  };

  // Get current location using GPS
  const handleGetCurrentLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    try {
      setGettingLocation(true);
      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const resolvedCoordinates = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      };

      let newCountry = formData.countryCode;
      let newCity = formData.cityCode;
      let newStreet = formData.address;
      let newPhone = formData.phone;
      
      try {
        const geocode = await Location.reverseGeocodeAsync(resolvedCoordinates);
        if (geocode && geocode.length > 0) {
          const g = geocode[0];
          if (g.country) newCountry = g.country;
          if (g.city || g.subregion) newCity = g.city || g.subregion || '';
          
          // Try to update phone code if missing or empty
          if (g.isoCountryCode) {
            const locCountry = getCountryByCode(g.isoCountryCode);
            if (locCountry && (!newPhone || newPhone.trim() === '')) {
              newPhone = locCountry.phoneCode;
            }
          }

          // Build a more descriptive street address
          const addressParts = [
            g.name && g.name !== g.street && g.name !== g.city && g.name !== g.country ? g.name : '',
            g.streetNumber ? g.streetNumber : '',
            g.street ? g.street : '',
            g.district ? g.district : ''
          ].filter(Boolean);
          
          if (addressParts.length > 0) {
            newStreet = addressParts.join(', ');
          } else if (g.name && g.name !== g.city && g.name !== g.country) {
            newStreet = g.name;
          } else if ((g as any).formattedAddress) {
            newStreet = (g as any).formattedAddress;
          }
        }
      } catch (e) {
        console.warn('Reverse geocode failed', e);
      }

      setFormData(prev => ({
        ...prev,
        coordinates: resolvedCoordinates,
        countryCode: newCountry,
        cityCode: newCity,
        address: newStreet,
        phone: newPhone,
      }));

      Alert.alert(
        t('addresses.locationSet'),
        t('addresses.locationSetMessage'),
        [{ text: t('common.ok') }]
      );
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert(
        t('location.error'),
        t('location.failedToGetLocation')
      );
    } finally {
      setGettingLocation(false);
    }
  };

  // Remove location
  const removeLocation = () => {
    setFormData(prev => ({
      ...prev,
      coordinates: undefined,
    }));
  };

  // Handle save
  const handleSave = async () => {
    // We don't call validateForm() immediately because it validates the raw inputs (names). 
    // We need to resolve them to codes first, then validate.
    
    if (!user?.uid) return;

    try {
      setLoading(true);

      // --- SMART RESOLVE: Convert Names to Codes ---
      
      // 1. Resolve Country
      let finalCountryCode = formData.countryCode.trim();
      let finalCityCode = formData.cityCode.trim();
      
      const searchCountry = normalizeForSearch(finalCountryCode);
      const countryMatch = COUNTRIES.find(c => 
        c.code === finalCountryCode.toUpperCase() || 
        normalizeForSearch(c.name) === searchCountry ||
        normalizeForSearch(c.nameAr) === searchCountry ||
        normalizeForSearch(c.nameKu) === searchCountry
      );
      
      if (countryMatch) {
         finalCountryCode = countryMatch.code;
         
         // 2. Resolve City (only if country is valid)
         const searchCity = normalizeForSearch(finalCityCode);
         const cityMatch = countryMatch.cities.find(c => 
            c.code === finalCityCode.toUpperCase() ||
            normalizeForSearch(c.name) === searchCity ||
            normalizeForSearch(c.nameAr) === searchCity ||
            normalizeForSearch(c.nameKu) === searchCity
         );
         
         if (cityMatch) {
            finalCityCode = cityMatch.code;
         }
      }
      
      // --- END SMART RESOLVE ---

      const country = getCountryByCode(finalCountryCode);
      const city = getCityByCode(finalCountryCode, finalCityCode);

      const addressInput: AddressInput = {
        title: formData.title,
        fullName: formData.fullName,
        address: formData.address,
        countryCode: finalCountryCode, // Use the resolved code (e.g. "IQ" instead of "Iraq")
        cityCode: finalCityCode,       // Use the resolved code (e.g. "ERB" instead of "Erbil")
        city: city?.name || formData.city || finalCityCode,
        region: country?.name || formData.region || finalCountryCode,
        phone: PhoneNumberService.formatPhone(formData.phone, finalCountryCode),
        isDefault: formData.isDefault,
        coordinates: formData.coordinates,
      };
      
      // Now manually validate the Resolved Input
      // We replicate validateForm logic here but with the resolved values
      const validationErrors: FormErrors = {};
      if (!addressInput.title?.trim()) validationErrors.title = t('validation.required');
      if (!addressInput.fullName?.trim()) validationErrors.fullName = t('validation.required');
      if (!addressInput.address?.trim()) validationErrors.address = t('validation.required');
      if (!addressInput.countryCode?.trim()) validationErrors.countryCode = t('validation.required');
      if (!addressInput.cityCode?.trim()) validationErrors.cityCode = t('validation.required');
      
      // Validate country existence
      if (!getCountryByCode(addressInput.countryCode)) {
         validationErrors.countryCode = t('addresses.invalidCountry', { defaultValue: 'Invalid country selected (Try "Iraq")' });
      }
      
      // Phone validation with resolved country
      const phoneValidation = PhoneNumberService.validatePhone(formData.phone, addressInput.countryCode);
      if (!phoneValidation.isValid) {
        validationErrors.phone = phoneValidation.error;
      }

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setLoading(false);
        return;
      }
      
      // --- End Manual Validation ---


      // Validate Iraq-specific address data (Service Level)
      const validation = addressService.validateIraqAddress(addressInput);
      if (!validation.isValid) {
        Alert.alert(t('validation.error'), validation.errors.join('\n'));
        setLoading(false); // Make sure to stop loading
        return;
      }

      if (isEditing && address) {
        await addressService.updateAddress(address.id, user.uid, addressInput);
        Alert.alert(
          t('addresses.addressUpdated'),
          t('addresses.addressUpdatedMessage'),
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
        );
      } else {
        // Check if this will be the user's first address
        const existingAddresses = await addressService.getUserAddresses(user.uid);
        const isFirstAddress = existingAddresses.length === 0;

        await addressService.addAddress(user.uid, addressInput);

        if (isFirstAddress) {
          Alert.alert(
            t('addresses.firstAddressAdded'),
            t('addresses.firstAddressMessage'),
            [{ text: t('common.perfect'), onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert(
            t('addresses.addressAdded'),
            t('addresses.addressAddedMessage'),
            [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
          );
        }
      }
    } catch (error: any) {
      console.error('Error saving address:', error);
      Alert.alert(t('addresses.saveFailed'), error.message || t('addresses.failedToSave'));
    } finally {
      setLoading(false);
    }
  };


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
          <TouchableOpacity onPress={() => {
            try {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('MyAddress' as never);
              }
            } catch (error) {
              console.error('Navigation error:', error);
            }
          }}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: isRTL ? 0 : SPACING.md,
            marginRight: isRTL ? SPACING.md : 0,
          }}>
            {isEditing ? t('addresses.editAddress') : t('addresses.addNewAddress')}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            <View style={{ padding: SPACING.md }}>
              {/* First Address Info */}
              {!isEditing && isFirstAddress && (
                <View style={{
                  backgroundColor: theme.colors.primary + '10',
                  padding: SPACING.md,
                  borderRadius: 12,
                  marginBottom: SPACING.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.primary + '20',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Ionicons
                      name="information-circle"
                      size={24}
                      color={theme.colors.primary}
                      style={{ marginTop: 2 }}
                    />
                    <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                      <Text allowFontScaling={false} style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: theme.colors.primary,
                        marginBottom: SPACING.xs,
                      }}>
                        {t('addresses.firstAddressTitle')}
                      </Text>
                      <Text allowFontScaling={false} style={{
                        fontSize: 14,
                        color: theme.colors.primary,
                        lineHeight: 20,
                      }}>
                        {t('addresses.firstAddressDescription')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              {/* Address Name */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('addresses.addressName')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.title}
                  onChangeText={(value) => handleInputChange('title', value)}
                  placeholder={t('addresses.addressNamePlaceholder')}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.title ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlign: isRTL ? 'right' : 'left',
                    textAlignVertical: 'center',
                    height: 48,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.title && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4 }}>
                    {errors.title}
                  </Text>
                )}
              </View>

              {/* Full Name */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('profile.fullName')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.fullName}
                  onChangeText={(value) => handleInputChange('fullName', value)}
                  placeholder={t('addresses.fullNamePlaceholder')}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.fullName ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlign: isRTL ? 'right' : 'left',
                    textAlignVertical: 'center',
                    height: 48,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.fullName && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4 }}>
                    {errors.fullName}
                  </Text>
                )}
              </View>

              {/* Street Address */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('profile.streetAddress')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.address}
                  onChangeText={(value) => handleInputChange('address', value)}
                  placeholder={t('addresses.streetAddressPlaceholder')}
                  multiline
                  numberOfLines={3}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.address ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    padding: SPACING.md,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    minHeight: 80,
                    textAlign: isRTL ? 'right' : 'left',
                    textAlignVertical: 'top',
                    includeFontPadding: false,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.address && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4 }}>
                    {errors.address}
                  </Text>
                )}

              </View>

              {/* Country - Manual Input with Suggestions */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('addresses.country')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.countryCode}
                  onChangeText={(value) => handleInputChange('countryCode', value)}
                  placeholder={t('addresses.selectCountry')}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.countryCode ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlign: isRTL ? 'right' : 'left',
                    textAlignVertical: 'center',
                    height: 48,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {/* Show detected country or suggestions */}
                {formData.countryCode.length > 0 && (() => {
                  const input = formData.countryCode.toLowerCase().trim();
                  
                  // Check if it's already a valid code or name
                  const directMatch = getCountryByCode(formData.countryCode);
                  if (directMatch) {
                    return (
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.success, marginTop: 4 }}>
                        ✓ {directMatch.name}
                      </Text>
                    );
                  }
                  
                  // Find matching countries by name
                  const searchInput = normalizeForSearch(formData.countryCode);
                  const matches = COUNTRIES.filter(c => 
                    normalizeForSearch(c.name).includes(searchInput) || 
                    normalizeForSearch(c.nameAr).includes(searchInput) ||
                    normalizeForSearch(c.nameKu).includes(searchInput) ||
                    c.code.toLowerCase() === input
                  ).slice(0, 5);
                  
                  if (matches.length > 0) {
                    return (
                      <View style={{ marginTop: 4 }}>
                        <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>
                          {t('addresses.suggestionsTapToSelect', { defaultValue: 'Suggestions (tap to select):' })}
                        </Text>
                        {matches.map((country) => (
                          <TouchableOpacity
                            key={country.code}
                            onPress={() => handleInputChange('countryCode', country.name)}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              backgroundColor: theme.colors.surface,
                              borderRadius: 6,
                              marginBottom: 4,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                            }}
                          >
                            <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.text }}>
                              {country.name} ({country.code})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  }
                  
                  return null;
                })()}
                {errors.countryCode && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4 }}>
                    {errors.countryCode}
                  </Text>
                )}
              </View>

              {/* City - Manual Input with Suggestions */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('addresses.city')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.cityCode}
                  onChangeText={(value) => handleInputChange('cityCode', value)}
                  placeholder={t('addresses.selectCity')}
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.cityCode ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlign: isRTL ? 'right' : 'left',
                    textAlignVertical: 'center',
                    height: 48,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {/* Show detected city or suggestions */}
                {formData.cityCode.length > 0 && (() => {
                  const input = formData.cityCode.toLowerCase().trim();
                  
                  // Get country to narrow down cities
                  const searchCountry = normalizeForSearch(formData.countryCode);
                  const countryMatch = COUNTRIES.find(c => 
                    c.code === formData.countryCode.toUpperCase() ||
                    normalizeForSearch(c.name) === searchCountry ||
                    normalizeForSearch(c.nameAr) === searchCountry ||
                    normalizeForSearch(c.nameKu) === searchCountry
                  );
                  
                  if (!countryMatch) {
                    return (
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.warning, marginTop: 4 }}>
                        {t('addresses.selectCountryFirst', { defaultValue: 'Select a country first' })}
                      </Text>
                    );
                  }
                  
                  // Check if it's already a valid city code or name
                  const directMatch = getCityByCode(countryMatch.code, formData.cityCode);
                  if (directMatch) {
                    return (
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.success, marginTop: 4 }}>
                        ✓ {directMatch.name}
                      </Text>
                    );
                  }
                  
                  // Find matching cities by name
                  const searchInputCity = normalizeForSearch(formData.cityCode);
                  const matches = countryMatch.cities.filter(c => 
                    normalizeForSearch(c.name).includes(searchInputCity) || 
                    normalizeForSearch(c.nameAr).includes(searchInputCity) ||
                    normalizeForSearch(c.nameKu).includes(searchInputCity) ||
                    c.code.toLowerCase() === input
                  ).slice(0, 5);
                  
                  if (matches.length > 0) {
                    return (
                      <View style={{ marginTop: 4 }}>
                        <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>
                          {t('addresses.citiesIn', { name: countryMatch.name, defaultValue: 'Cities in {{name}}:' })}
                        </Text>
                        {matches.map((city) => (
                          <TouchableOpacity
                            key={city.code}
                            onPress={() => handleInputChange('cityCode', city.name)}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              backgroundColor: theme.colors.surface,
                              borderRadius: 6,
                              marginBottom: 4,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                            }}
                          >
                            <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.text }}>
                              {city.name} {city.isCapital ? '★' : ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  }
                  
                  return null;
                })()}
                {errors.cityCode && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4 }}>
                    {errors.cityCode}
                  </Text>
                )}
              </View>

              {/* Location (GPS Only - No Map) */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('addresses.location')} {t('common.optional')}
                </Text>

                {formData.coordinates ? (
                  <View style={{
                    borderWidth: 1,
                    borderColor: theme.colors.success,
                    borderRadius: 8,
                    backgroundColor: theme.colors.success + '10',
                    padding: SPACING.md,
                  }}>
                    {/* Location Set Header */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: SPACING.sm,
                    }}>
                      <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
                      <Text allowFontScaling={false} style={{
                        marginLeft: SPACING.sm,
                        fontSize: 16,
                        fontWeight: '600',
                        color: theme.colors.success,
                      }}>
                        {t('addresses.locationSet')}
                      </Text>
                    </View>

                    {/* Coordinates Display */}
                    <View style={{
                      backgroundColor: theme.colors.surface,
                      padding: SPACING.sm,
                      borderRadius: 6,
                      marginBottom: SPACING.sm,
                    }}>
                      <Text allowFontScaling={false} style={{
                        fontSize: 12,
                        color: theme.colors.textSecondary,
                        marginBottom: 4,
                      }}>
                        {t('addresses.gpsCoordinates', { defaultValue: 'GPS Coordinates:' })}
                      </Text>
                      <Text allowFontScaling={false} style={{
                        fontSize: 14,
                        fontFamily: 'monospace',
                        color: theme.colors.text,
                      }}>
                        {formData.coordinates.latitude.toFixed(6)}, {formData.coordinates.longitude.toFixed(6)}
                      </Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={{
                      flexDirection: 'row',
                      gap: SPACING.sm,
                    }}>
                      <TouchableOpacity
                        onPress={handleGetCurrentLocation}
                        disabled={gettingLocation}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.colors.primary,
                          paddingVertical: SPACING.sm,
                          borderRadius: 6,
                          opacity: gettingLocation ? 0.6 : 1,
                        }}
                      >
                        <Ionicons name="refresh" size={16} color="white" />
                        <Text allowFontScaling={false} style={{ color: 'white', fontWeight: '500', marginLeft: 6 }}>
                          {t('common.update')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={removeLocation}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.colors.error,
                          paddingVertical: SPACING.sm,
                          borderRadius: 6,
                        }}
                      >
                        <Ionicons name="trash" size={16} color="white" />
                        <Text allowFontScaling={false} style={{ color: 'white', fontWeight: '500', marginLeft: 6 }}>
                          {t('common.remove')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleGetCurrentLocation}
                    disabled={gettingLocation}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 8,
                      backgroundColor: theme.colors.surface,
                      padding: SPACING.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      opacity: gettingLocation ? 0.6 : 1,
                    }}
                  >
                    {gettingLocation ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Ionicons name="location" size={24} color={theme.colors.primary} />
                    )}
                    <View style={{ marginLeft: SPACING.md, flex: 1 }}>
                      <Text allowFontScaling={false} style={{
                        fontSize: 16,
                        fontWeight: '500',
                        color: theme.colors.primary,
                        marginBottom: 2,
                      }}>
                        {gettingLocation ? t('location.gettingLocation') : t('addresses.useCurrentLocation')}
                      </Text>
                      <Text allowFontScaling={false} style={{
                        fontSize: 14,
                        color: theme.colors.textSecondary,
                      }}>
                        {t('addresses.locationHelpText')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}

                {/* Map Picker - Show when coordinates are available */}
                {formData.coordinates && (
                  <View style={{ marginTop: SPACING.md }}>
                    <SimpleMapPicker
                      latitude={formData.coordinates.latitude}
                      longitude={formData.coordinates.longitude}
                      onLocationChange={(latitude, longitude) => {
                        setFormData(prev => ({
                          ...prev,
                          coordinates: { latitude, longitude }
                        }));
                      }}
                      height={250}
                    />
                  </View>
                )}

                <Text allowFontScaling={false} style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginTop: SPACING.xs,
                  lineHeight: 16,
                }}>
                  💡 {t('addresses.locationOptionalNote')}
                </Text>
              </View>


              {/* Phone Number */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: theme.colors.text,
                  marginBottom: SPACING.xs,
                }}>
                  {t('profile.phoneNumber')} *
                </Text>
                <TextInput allowFontScaling={false}
                  value={formData.phone}
                  onChangeText={(value) => handleInputChange('phone', value)}
                  placeholder={t('addresses.phonePlaceholder', { defaultValue: '+964 XXX XXX XXXX' })}
                  keyboardType="phone-pad"
                  scrollEnabled={false}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.phone ? theme.colors.error : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 0,
                    fontSize: 16,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    includeFontPadding: false,
                    textAlignVertical: 'center',
                    height: 48,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.phone && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 14, marginTop: 4 }}>
                    {errors.phone}
                  </Text>
                )}
              </View>

              {/* Set as Default */}
              <TouchableOpacity
                onPress={() => handleInputChange('isDefault', !formData.isDefault)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.surface,
                  padding: SPACING.md,
                  borderRadius: 8,
                  marginBottom: SPACING.xl,
                }}
              >
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: formData.isDefault ? theme.colors.primary : theme.colors.border,
                  backgroundColor: formData.isDefault ? theme.colors.primary : 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: SPACING.md,
                }}>
                  {formData.isDefault && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text allowFontScaling={false} style={{
                    fontSize: 16,
                    fontWeight: '500',
                    color: theme.colors.text,
                  }}>
                    {t('addresses.setAsDefaultAddress')}
                  </Text>
                  <Text allowFontScaling={false} style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    marginTop: 2,
                  }}>
                    {t('addresses.useForFutureOrders')}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Help Text */}
              <View style={{
                backgroundColor: theme.colors.primary + '10',
                padding: SPACING.md,
                borderRadius: 8,
                marginBottom: SPACING.xl,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={{
                    fontSize: 14,
                    color: theme.colors.primary,
                    marginLeft: SPACING.sm,
                    flex: 1,
                    lineHeight: 20,
                  }}>
                    {t('addresses.deliveryHelpText')}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Save Button */}
          <View style={{ padding: SPACING.md }}>
            <Button
              title={isEditing ? t('addresses.updateAddress') : t('addresses.addAddress')}
              onPress={handleSave}
              loading={loading}
              disabled={loading}
              icon={isEditing ? 'checkmark' : 'add'}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

    </View>
  );
};

export default AddEditAddressScreen;
