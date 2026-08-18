/**
 * Admin Store Profile Screen
 * 
 * Allows admin to set store profile info that appears on all products.
 * Data is stored at: tenants/{tenantId}/public/storeProfile
 */
import React, { useState, useCallback, useRef } from 'react';
import { Image as ExpoImage } from 'expo-image';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Switch,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { SPACING } from '../../constants/theme';
import { storeProfileService, StoreProfile, StoreProfileUpdate } from '../../services/storeProfileService';
import { locationService, StoreLocation } from '../../services/locationService';
import { ImageService } from '../../services/imageService';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { DateTime } from 'luxon'; 
import AppText from '../../components/AppText'; 
import PhoneInput from '../../components/PhoneInput';
import { getAllCountries, CountryInfo, CountryCode } from '../../utils/phoneUtils';

const AdminStoreProfileScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<StoreProfile>>({
    storeName: '',
    storeNameAr: '',
    storeNameKu: '',
    logoUrl: '',
    coverUrl: '',
    coverUrls: [],
    about: '',
    aboutAr: '',
    aboutKu: '',
    phone: '',
    whatsapp: '',
    tiktok: '',
    wechat: '',
    wechatId: '',
    email: '',
    website: '',
    instagram: '',
    facebook: '',
    isActive: true,
    // Default hours
    openTime: null,
    closeTime: null,
    closedDays: null, // null = default (Friday)
    timeZone: DateTime.local().zoneName, // Default to device zone (IANA)
  });

  // Phone input state. Iraq-only app: defaulting to US (+1) made a first-time setup
  // store "+1770…" and every tel:/wa.me link built from it was dead.
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneDialCode, setPhoneDialCode] = useState('+964');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('IQ');

  // WhatsApp input state
  const [waDigits, setWaDigits] = useState('');
  const [waDialCode, setWaDialCode] = useState('+964');
  const [waCountry, setWaCountry] = useState<CountryCode>('IQ');

  // Track which tenant's data has already hydrated the editable form, so that
  // re-focusing the screen never clobbers the admin's unsaved edits (see loadData).
  const hydratedTenantRef = useRef<string | null>(null);

  // Helper: parse a full phone string into { dialCode, digits, countryCode }
  const parsePhoneNumber = (phone: string) => {
    const allC = getAllCountries();
    const sorted = [...allC].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const match = sorted.find(c => phone.startsWith(c.dialCode));
    if (match) {
      return { dialCode: match.dialCode, digits: phone.slice(match.dialCode.length).trim(), countryCode: match.code };
    }
    // Iraqi shop: default unmatched numbers (e.g. local "07701234567") to +964,
    // stripping the local leading zero. Defaulting to +1/US silently rewrote the
    // store's real contact number to a wrong "+1…" value on the next save.
    return { dialCode: '+964', digits: phone.replace(/[^\d]/g, '').replace(/^0+/, ''), countryCode: 'IQ' as CountryCode };
  };

  // Safely parse an "HH:MM" time string into a Date for the time picker.
  // Malformed/garbage values (e.g. '8', 'closed', null) fall back to 08:00
  // instead of producing an Invalid Date, which can crash the iOS inline picker.
  const parseHHMM = (value?: string | null): Date => {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
    const date = new Date();
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      date.setHours(Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0, 0, 0);
    } else {
      date.setHours(8, 0, 0, 0);
    }
    return date;
  };

  // Derived state for UI toggles
  // Derived state for UI toggles
  const useCustomHours = profile.openTime != null || profile.closeTime != null;
  
  const getClosedDaysMode = (): 'default' | 'none' | 'custom' => {
    if (profile.closedDays === null) return 'default';
    if (Array.isArray(profile.closedDays) && profile.closedDays.length === 0) return 'none';
    return 'custom';
  };
  
  // Locations state
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';
  
  // Load profile and locations
  const loadData = useCallback(async () => {
    if (!tenantId || !user?.uid) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Load store profile
      const existingProfile = await storeProfileService.getStoreProfile(tenantId);
      // Only hydrate the editable form the FIRST time we load a given tenant.
      // useFocusEffect re-runs loadData on every focus (e.g. returning from the
      // "Add Location" screen); re-running setProfile()/phone-parse there would
      // silently wipe the admin's unsaved edits. Keyed by tenantId so a tenant
      // switch still re-hydrates for the new tenant. The locations list below is
      // still refreshed on every focus.
      const shouldHydrate = hydratedTenantRef.current !== tenantId;
      if (existingProfile && shouldHydrate) {
        // Migration: ensure coverUrls exists or is populated from legacy coverUrl
        if (existingProfile.coverUrl && (!existingProfile.coverUrls || existingProfile.coverUrls.length === 0)) {
          existingProfile.coverUrls = [existingProfile.coverUrl];
        } else if (!existingProfile.coverUrls) {
          existingProfile.coverUrls = [];
        }

        setProfile(existingProfile);
        setSelectedLocationId(existingProfile.publicLocationId || null);

        // Parse phone numbers
        if (existingProfile.phone) {
          const parsed = parsePhoneNumber(existingProfile.phone);
          setPhoneDialCode(parsed.dialCode);
          setPhoneDigits(parsed.digits);
          setPhoneCountry(parsed.countryCode);
        }
        if (existingProfile.whatsapp) {
          const parsed = parsePhoneNumber(existingProfile.whatsapp);
          setWaDialCode(parsed.dialCode);
          setWaDigits(parsed.digits);
          setWaCountry(parsed.countryCode);
        }

        hydratedTenantRef.current = tenantId;
      }
      
      // Load admin's locations
      const adminLocations = await locationService.getLocationsByAdmin(user.uid);
      // Filter active locations
      const activeLocations = adminLocations.filter(loc => loc.isActive !== false);
      setLocations(activeLocations);

      // SYNC: If profile has a location selected, ensure we display the LATEST data from that location
      // This fixes the issue where editing a location doesn't immediately show up in the Store Profile UI
      if (existingProfile && existingProfile.publicLocationId) {
        const selectedLoc = activeLocations.find(l => l.id === existingProfile.publicLocationId);
        if (selectedLoc) {
          // Update local profile state with fresh location data
          setProfile(prev => ({
            ...prev,
            addressText: selectedLoc.address,
            addressTextAr: selectedLoc.addressAr,
            addressTextKu: selectedLoc.addressKu,
            city: selectedLoc.city,
            location: (selectedLoc.latitude && selectedLoc.longitude) 
              ? { latitude: selectedLoc.latitude, longitude: selectedLoc.longitude }
              : undefined,
          }));
        }
      }
      /* Removed duplicate error handling */
    } catch (error) {
      console.error('Error loading store profile:', error);
      Alert.alert(t('common.error'), t('errors.loadProfileFailed') || 'Failed to load store profile');
    } finally {
      setLoading(false);
    }
  }, [tenantId, user?.uid]);
  
  // Reload data when screen regains focus (after adding location)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );
  
  const handleChange = (field: keyof StoreProfileUpdate, value: string | boolean) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  // --- Store Hours Handlers ---

  const [showOpenPicker, setShowOpenPicker] = useState(false);
  const [showClosePicker, setShowClosePicker] = useState(false);

  const handleTimeChange = (type: 'open' | 'close', event: any, selectedDate?: Date) => {
    const isAndroid = Platform.OS === 'android';
    
    if (type === 'open') setShowOpenPicker(Platform.OS === 'ios');
    else setShowClosePicker(Platform.OS === 'ios');

    if (selectedDate) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      setProfile(prev => {
        // When setting a custom time, ensure we have both times set (if one was null)
        // Default to 08:00 / 18:00 if filling in a missing side
        const newOpen = type === 'open' ? timeString : (prev.openTime || '08:00');
        const newClose = type === 'close' ? timeString : (prev.closeTime || '18:00');
        
        // Validation: No overnight (close < open)
        if (newClose <= newOpen) {
             Alert.alert(t('common.invalidTime'), t('errors.overnightNotSupported', 'Closing time must be after opening time'));
             return prev; 
        }

        return { 
          ...prev, 
          openTime: newOpen,
          closeTime: newClose
        };
      });
    }
  };

  const handleClosedDaysModeChange = (mode: 'default' | 'none' | 'custom') => {
    setProfile(prev => {
      if (mode === 'default') return { ...prev, closedDays: null };
      if (mode === 'none') return { ...prev, closedDays: [] };
      // If switching to custom, start with Friday (5) pre-selected if coming from null/empty
      return { ...prev, closedDays: [5] };
    });
  };

  const toggleClosedDay = (dayIndex: number) => {
    setProfile(prev => {
      // Safety: Only works if we are in 'custom' mode (array exists)
      // Note: We avoid null checks by initializing logic in mode switch, but safety first
      const currentDays = prev.closedDays || [];
      
      if (currentDays.includes(dayIndex)) {
        return { ...prev, closedDays: currentDays.filter(d => d !== dayIndex) };
      } else {
        return { ...prev, closedDays: [...currentDays, dayIndex].sort() };
      }
    });
  };

  const toggleDefaultHours = (value: boolean) => {
    // value = true -> Use Defaults (set nulls)
    // value = false -> Use Custom (set defaults 08:00-18:00)
    if (value) {
      setProfile(prev => ({
        ...prev,
        openTime: null,
        closeTime: null
      }));
    } else {
      setProfile(prev => ({
        ...prev,
        openTime: '08:00',
        closeTime: '18:00'
      }));
    }
  };

  // Logo upload handler
  const handleLogoUpload = async () => {
    try {
      const imageUri = await ImageService.showImagePicker();
      if (!imageUri) return;
      
      setSaving(true);
      const result = await ImageService.uploadImage(imageUri);
      if (result.success && result.url) {
        setProfile(prev => ({ ...prev, logoUrl: result.url }));
        Alert.alert(t('common.success'), t('admin.storeProfile.logoUploaded', { defaultValue: 'Logo uploaded successfully' }));
      } else {
        Alert.alert(t('common.error'), result.error || t('alerts.failedUpload'));
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('alerts.failedUpload'));
    } finally {
      setSaving(false);
    }
  };

  // Cover banner upload handler
  // Cover banner upload handler
  const handleCoverUpload = async () => {
    // Limit check (max 10)
    const currentImages = profile.coverUrls || [];
    if (currentImages.length >= 10) {
      Alert.alert(t('common.error'), t('admin.storeProfile.maxImages', { defaultValue: 'Maximum 10 cover images allowed' }));
      return;
    }

    try {
      const imageUri = await ImageService.showImagePicker();
      if (!imageUri) return;
      
      setSaving(true);
      const result = await ImageService.uploadImage(imageUri);
      if (result.success && result.url) {
        setProfile(prev => {
          const newUrls = [...(prev.coverUrls || []), result.url!];
          return { 
            ...prev, 
            coverUrls: newUrls,
            // Keep legacy coverUrl in sync with the first image
            coverUrl: newUrls[0] || '' 
          };
        });
        Alert.alert(t('common.success'), t('admin.storeProfile.coverUploaded', { defaultValue: 'Image uploaded successfully' }));
      } else {
        Alert.alert(t('common.error'), result.error || t('alerts.failedUpload'));
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('alerts.failedUpload'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCoverImage = (index: number) => {
    Alert.alert(
      t('common.confirm'),
      t('admin.storeProfile.confirmRemoveImage', { defaultValue: 'Remove this image?' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('common.delete'), 
          style: 'destructive',
          onPress: () => {
            setProfile(prev => {
              const newUrls = [...(prev.coverUrls || [])];
              newUrls.splice(index, 1);
              return {
                ...prev,
                coverUrls: newUrls,
                // Update legacy coverUrl
                coverUrl: newUrls.length > 0 ? newUrls[0] : ''
              };
            });
          }
        }
      ]
    );
  };
  
  const handleSelectLocation = async (locationId: string) => {
    if (!tenantId || !user?.uid) return;
    
    try {
      // Find selected location
      const location = locations.find(l => l.id === locationId);
      if (!location) return;
      
      setSelectedLocationId(locationId);
      setShowLocationPicker(false);
      
      // Update profile with location data
      setProfile(prev => ({
        ...prev,
        publicLocationId: locationId,
        addressText: location.address || '',
        addressTextAr: location.addressAr || '',
        addressTextKu: location.addressKu || '',
        city: location.city || '',
        location: (location.latitude && location.longitude) 
          ? { latitude: location.latitude, longitude: location.longitude }
          : undefined,
      }));
    } catch (error) {
      console.error('Error selecting location:', error);
    }
  };
  
  const handleSave = async () => {
    if (!tenantId || !user?.uid) {
      Alert.alert(t('common.error'), t('admin.storeProfile.tenantNotFound', { defaultValue: 'Your store is still loading. Please go back and try again.' }));
      return;
    }
    
    if (!profile.storeName?.trim()) {
      Alert.alert(t('common.error'), t('validation.required', { field: t('admin.storeProfile.storeName') }));
      return;
    }
    
    try {
      setSaving(true);
      
      // Update store profile with all fields including logo, cover, and social
      // Use ?? null to preserve explicit "empty array" (No Closed Days) vs "null" (Default)
      // If we used ||, [] would become null because [] is truthy but we want to be explicit.
      // Actually [] is truthy in JS, but user said "Because [] is falsy". 
      // User is mistaken about [] being falsy in JS (it's truthy). 
      // BUT if the previous code was: closedDays: profile.closedDays || null
      // And profile.closedDays was [], then [] || null -> []. So that technically works for [].
      // However, if logic elsewhere treated [] loosely, maybe. 
      // Let's strictly follow user request: "Change these to ??"
      
      const updateData: any = {
        storeName: profile.storeName,
        storeNameAr: profile.storeNameAr,
        storeNameKu: profile.storeNameKu,
        logoUrl: profile.logoUrl, // Added back as it was in original
        coverUrl: profile.coverUrl, // Added back as it was in original
        coverUrls: profile.coverUrls, // Persist the array
        about: profile.about,
        aboutAr: profile.aboutAr,
        aboutKu: profile.aboutKu,
        phone: phoneDigits ? `${phoneDialCode}${phoneDigits}` : '',
        whatsapp: waDigits ? `${waDialCode}${waDigits}` : '',
        tiktok: profile.tiktok,
        wechat: profile.wechat,
        wechatId: profile.wechatId,
        email: profile.email,
        website: profile.website,
        instagram: profile.instagram,
        facebook: profile.facebook,
        addressText: profile.addressText,
        addressTextAr: profile.addressTextAr,
        addressTextKu: profile.addressTextKu,
        city: profile.city,
        publicLocationId: profile.publicLocationId,
        location: profile.location,
        isActive: profile.isActive,
        // Store Hours - Strict Null Handling
        openTime: profile.openTime ?? null,
        closeTime: profile.closeTime ?? null,
        closedDays: profile.closedDays ?? null, 
        timeZone: profile.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      
      // Location first: it is the write most likely to fail (permission check +
      // lookup). Running it last meant a location failure reported "Failed to save
      // store profile" after every other field had already committed.
      if (selectedLocationId) {
        await storeProfileService.setDefaultLocation(tenantId, selectedLocationId, user.uid);
      }

      await storeProfileService.updateStoreProfile(tenantId, updateData);

      Alert.alert(
        t('common.success'), 
        t('admin.storeProfile.saveSuccess', { defaultValue: 'Store profile saved successfully' })
      );
      navigation.goBack();
    } catch (error: any) {
      console.error('Error saving store profile:', error);
      Alert.alert(t('common.error'), error.message || t('admin.storeProfile.saveFailed', { defaultValue: 'Failed to save store profile' }));
    } finally {
      setSaving(false);
    }
  };
  
  const getLocalizedLocationName = (location: StoreLocation): string => {
    if (i18n.language === 'ar' && location.nameAr) return location.nameAr;
    if (i18n.language === 'ku' && location.nameKu) return location.nameKu;
    return location.name || location.address || t('admin.storeProfile.unnamedLocation', { defaultValue: 'Unnamed location' });
  };
  
  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <AppText style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
            {t('common.loading')}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <AppText style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('admin.storeProfile.title', { defaultValue: 'Store Profile' })}
          </AppText>
          <View style={styles.headerButton} />
        </View>
        
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Store Identity Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="store" size={20} color={theme.colors.primary} />
              <AppText style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('admin.storeProfile.storeIdentity', { defaultValue: 'Store Identity' })}
              </AppText>
            </View>
            
            {/* Logo Upload */}
            <View style={styles.logoSection}>
              <TouchableOpacity 
                style={[styles.logoContainer, { borderColor: theme.colors.border }]}
                onPress={handleLogoUpload}
                disabled={saving}
              >
                {profile.logoUrl ? (
                  <ExpoImage 
                    source={{ uri: profile.logoUrl }} 
                    style={styles.logoImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.logoPlaceholder, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="add-a-photo" size={32} color={theme.colors.primary} />
                  </View>
                )}
                <View style={[styles.logoEditBadge, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="camera" size={14} color="white" />
                </View>
              </TouchableOpacity>
              <AppText style={[styles.logoHint, { color: theme.colors.textSecondary }]}>
                {t('admin.storeProfile.uploadLogo', { defaultValue: 'Tap to upload store logo' })}
              </AppText>
            </View>
            
            <Input
              label={t('admin.storeProfile.storeName', { defaultValue: 'Store Name (English)' }) + ' *'}
              value={profile.storeName}
              onChangeText={(text) => handleChange('storeName', text)}
              placeholder="e.g., Asankary"
              containerStyle={styles.input}
            />
            
            <Input
              label={t('admin.storeProfile.storeNameAr', { defaultValue: 'Store Name (Arabic)' })}
              value={profile.storeNameAr}
              onChangeText={(text) => handleChange('storeNameAr', text)}
              placeholder="مثال: Asankary"
              containerStyle={styles.input}
            />
            
            <Input
              label={t('admin.storeProfile.storeNameKu', { defaultValue: 'Store Name (Kurdish)' })}
              value={profile.storeNameKu}
              onChangeText={(text) => handleChange('storeNameKu', text)}
              placeholder="نموونە: Asankary"
              containerStyle={styles.input}
            />
          </View>
          
          {/* Cover Banner Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                <MaterialIcons name="panorama" size={20} color={theme.colors.primary} />
                <AppText style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {t('admin.storeProfile.coverBanner', { defaultValue: 'Cover Banners' })} ({profile.coverUrls?.length || 0}/10)
                </AppText>
              </View>
              
              {(!profile.coverUrls || profile.coverUrls.length < 10) && (
                <TouchableOpacity 
                   onPress={handleCoverUpload}
                   disabled={saving}
                   style={{ 
                     flexDirection: 'row', 
                     alignItems: 'center', 
                     padding: 4 
                   }}
                >
                  <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
                  <AppText style={{ color: theme.colors.primary, marginLeft: 4, fontWeight: '600' }}>
                    {t('common.add', 'Add')}
                  </AppText>
                </TouchableOpacity>
              )}
            </View>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 4 }}
            >
              {(profile.coverUrls && profile.coverUrls.length > 0) ? (
                profile.coverUrls.map((url, index) => (
                  <View key={`${url}-${index}`} style={{ marginRight: 12, position: 'relative' }}>
                    <ExpoImage 
                      source={{ uri: url }} 
                      style={{ 
                        width: 200, 
                        height: 112, // 16:9 ratio
                        borderRadius: 8,
                        backgroundColor: theme.colors.background
                      }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <TouchableOpacity
                      onPress={() => handleRemoveCoverImage(index)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        borderRadius: 12,
                        padding: 4
                      }}
                    >
                      <Ionicons name="close" size={16} color="white" />
                    </TouchableOpacity>
                    {index === 0 && (
                      <View style={{
                        position: 'absolute',
                        bottom: 4,
                        left: 4,
                        backgroundColor: theme.colors.primary,
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 2
                      }}>
                        <AppText style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{t('admin.storeProfile.mainImage', { defaultValue: 'MAIN' })}</AppText>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <TouchableOpacity 
                  style={[styles.coverContainer, { borderColor: theme.colors.border, width: '100%', height: 150 }]}
                  onPress={handleCoverUpload}
                  disabled={saving}
                >
                  <View style={[styles.coverPlaceholder, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="add-photo-alternate" size={40} color={theme.colors.primary} />
                    <AppText style={[styles.coverHint, { color: theme.colors.textSecondary }]}>
                      {t('admin.storeProfile.uploadCover', { defaultValue: 'Tap to upload cover banner (16:9)' })}
                    </AppText>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
          
          {/* About Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="info" size={20} color={theme.colors.primary} />
              <AppText style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('admin.storeProfile.aboutStore', { defaultValue: 'About Store' })}
              </AppText>
            </View>
            
            <Input
              label={t('admin.storeProfile.about', { defaultValue: 'About (English)' })}
              value={profile.about}
              onChangeText={(text) => handleChange('about', text)}
              placeholder="Tell customers about your store..."
              multiline
              numberOfLines={3}
              containerStyle={styles.input}
            />
            
            <Input
              label={t('admin.storeProfile.aboutAr', { defaultValue: 'About (Arabic)' })}
              value={profile.aboutAr}
              onChangeText={(text) => handleChange('aboutAr', text)}
              placeholder="أخبر العملاء عن متجرك..."
              multiline
              numberOfLines={3}
              containerStyle={styles.input}
            />
            
            <Input
              label={t('admin.storeProfile.aboutKu', { defaultValue: 'About (Kurdish)' })}
              value={profile.aboutKu}
              onChangeText={(text) => handleChange('aboutKu', text)}
              placeholder="کڕیاران لەبارەی فرۆشگاکەت ئاگادار بکە..."
              multiline
              numberOfLines={3}
              containerStyle={styles.input}
            />
          </View>
          
          {/* Social Links Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="globe-outline" size={20} color={theme.colors.primary} />
              <AppText style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('admin.storeProfile.socialLinks', { defaultValue: 'Social Links' })}
              </AppText>
            </View>
            
            <Input
              label={t('admin.storeProfile.website', { defaultValue: 'Website URL' })}
              value={profile.website}
              onChangeText={(text) => handleChange('website', text)}
              placeholder="https://www.example.com"
              keyboardType="url"
              autoCapitalize="none"
              containerStyle={styles.input}
            />

            <Input
              label={t('admin.storeProfile.tiktok', { defaultValue: 'TikTok Username/URL' })}
              value={profile.tiktok}
              onChangeText={(text) => handleChange('tiktok', text)}
              placeholder="@username or https://tiktok.com/@username"
              autoCapitalize="none"
              containerStyle={styles.input}
            />
            
            <Input
              label={t('admin.storeProfile.instagram', { defaultValue: 'Instagram Handle' })}
              value={profile.instagram}
              onChangeText={(text) => handleChange('instagram', text)}
              placeholder="@yourstorename"
              autoCapitalize="none"
              containerStyle={styles.input}
            />
            
            <Input
              label={t('admin.storeProfile.facebook', { defaultValue: 'Facebook URL' })}
              value={profile.facebook}
              onChangeText={(text) => handleChange('facebook', text)}
              placeholder="https://facebook.com/yourpage"
              keyboardType="url"
              autoCapitalize="none"
              containerStyle={styles.input}
            />

            {/* WeChat ID/Link Input */}
            <Input
              label={t('admin.storeProfile.wechatId', { defaultValue: 'WeChat ID / Link' })}
              value={profile.wechatId}
              onChangeText={(text) => handleChange('wechatId', text)}
              placeholder={t('admin.storeProfile.wechatIdPlaceholder', { defaultValue: 'WeChat ID or profile link' })}
              autoCapitalize="none"
              containerStyle={styles.input}
            />

            {/* WeChat QR Code Upload */}
            <View style={styles.wechatSection}>
              <AppText style={[styles.label, { color: theme.colors.textSecondary }]}>
                {t('admin.storeProfile.wechatQr', { defaultValue: 'WeChat QR Code' })}
              </AppText>
              <TouchableOpacity 
                style={[styles.wechatUploadContainer, { borderColor: theme.colors.border }]}
                onPress={async () => {
                  try {
                    const imageUri = await ImageService.showImagePicker();
                    if (!imageUri) return;
                    
                    setSaving(true);
                    const result = await ImageService.uploadImage(imageUri);
                    if (result.success && result.url) {
                      setProfile(prev => ({ ...prev, wechat: result.url }));
                      Alert.alert(t('common.success'), t('admin.storeProfile.wechatUploaded', { defaultValue: 'WeChat QR code uploaded successfully' }));
                    } else {
                      Alert.alert(t('common.error'), result.error || t('alerts.failedUpload'));
                    }
                  } catch (error: any) {
                    Alert.alert(t('common.error'), error.message || t('alerts.failedUpload'));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                {profile.wechat ? (
                  <View style={styles.wechatImageWrapper}>
                    <ExpoImage 
                      source={{ uri: profile.wechat }} 
                      style={styles.wechatQrImage}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <TouchableOpacity
                      style={styles.wechatRemoveBtn}
                      onPress={() => {
                        Alert.alert(
                          t('common.confirm'),
                          t('admin.storeProfile.removeWechatQr', { defaultValue: 'Remove WeChat QR code?' }),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            { 
                              text: t('common.delete'), 
                              style: 'destructive',
                              onPress: () => setProfile(prev => ({ ...prev, wechat: '' }))
                            }
                          ]
                        );
                      }}
                    >
                      <Ionicons name="close-circle" size={24} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.wechatPlaceholder, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="qr-code-2" size={40} color={theme.colors.primary} />
                    <AppText style={[styles.wechatHint, { color: theme.colors.textSecondary }]}>
                      {t('admin.storeProfile.uploadWechatQr', { defaultValue: 'Tap to upload WeChat QR code' })}
                    </AppText>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Store Hours Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
                <AppText 
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.storeProfile.operatingHours', { defaultValue: 'Store Hours' })}
                </AppText>
              </View>
            </View>

            {/* Default Hours Toggle */}
            <View style={[styles.toggleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }]}>
              <AppText 
                adjustsFontSizeToFit 
                numberOfLines={1} 
                minimumFontScale={0.85}
                style={{ color: theme.colors.text, fontSize: 16, flex: 1, marginRight: 8, flexWrap: 'wrap' }}
              >
                {t('admin.storeProfile.useDefaultHours', 'Use Default Hours (8am - 6pm)')}
              </AppText>
              <Switch
                value={!useCustomHours}
                onValueChange={toggleDefaultHours}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>

            {useCustomHours && (
              <>
                {/* Open Time */}
                <View style={[styles.timeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <AppText style={[styles.label, { color: theme.colors.textSecondary }]}>
                    {t('common.openTime', { defaultValue: 'Open Time' })}
                  </AppText>
                  {Platform.OS === 'android' ? (
                    <TouchableOpacity 
                       style={[styles.timeButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                       onPress={() => setShowOpenPicker(true)}
                    >
                      <AppText style={{ color: theme.colors.text }}>
                        {profile.openTime}
                      </AppText>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={profile.openTime ? parseHHMM(profile.openTime) : new Date()}
                      mode="time"
                      display="default"
                      onChange={(e, d) => handleTimeChange('open', e, d)}
                      style={{ width: 100 }}
                    />
                  )}
                </View>
                {Platform.OS === 'android' && showOpenPicker && (
                   <DateTimePicker
                     value={profile.openTime ? parseHHMM(profile.openTime) : new Date()}
                     mode="time"
                     is24Hour={true}
                     display="default"
                     onChange={(e, d) => {
                       setShowOpenPicker(false);
                       handleTimeChange('open', e, d);
                     }}
                   />
                )}

                {/* Close Time */}
                <View style={[styles.timeRow, { flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 12 }]}>
                  <AppText style={[styles.label, { color: theme.colors.textSecondary }]}>
                    {t('common.closeTime', { defaultValue: 'Close Time' })}
                  </AppText>
                  {Platform.OS === 'android' ? (
                    <TouchableOpacity 
                       style={[styles.timeButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                       onPress={() => setShowClosePicker(true)}
                    >
                      <AppText style={{ color: theme.colors.text }}>
                        {profile.closeTime}
                      </AppText>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={profile.closeTime ? parseHHMM(profile.closeTime) : new Date()}
                      mode="time"
                      display="default"
                      onChange={(e, d) => handleTimeChange('close', e, d)}
                      style={{ width: 100 }}
                    />
                  )}
                </View>
                {Platform.OS === 'android' && showClosePicker && (
                   <DateTimePicker
                     value={profile.closeTime ? parseHHMM(profile.closeTime) : new Date()}
                     mode="time"
                     is24Hour={true}
                     display="default"
                     onChange={(e, d) => {
                       setShowClosePicker(false);
                       handleTimeChange('close', e, d);
                     }}
                   />
                )}
              </>
            )}

            {/* Closed Days Section */}
            <AppText style={[styles.label, { color: theme.colors.text, marginTop: 24, marginBottom: 8, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('admin.storeProfile.closedDays', 'Closed Days')}
            </AppText>

            {/* Mode Selectors */}
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
               <TouchableOpacity 
                 style={[
                   styles.modeButton, 
                   { 
                     backgroundColor: getClosedDaysMode() === 'default' ? theme.colors.primary : theme.colors.background,
                     borderColor: theme.colors.border 
                   }
                 ]}
                 onPress={() => handleClosedDaysModeChange('default')}
               >
                 <AppText 
                   adjustsFontSizeToFit
                   numberOfLines={1}
                   minimumFontScale={0.85}
                   style={{ color: getClosedDaysMode() === 'default' ? 'white' : theme.colors.text }}
                 >
                   {t('common.default', 'Default (Fri)')}
                 </AppText>
               </TouchableOpacity>

               <TouchableOpacity 
                 style={[
                   styles.modeButton, 
                   { 
                     backgroundColor: getClosedDaysMode() === 'none' ? theme.colors.primary : theme.colors.background,
                     borderColor: theme.colors.border 
                   }
                 ]}
                 onPress={() => handleClosedDaysModeChange('none')}
               >
                 <AppText 
                   adjustsFontSizeToFit
                   numberOfLines={1}
                   minimumFontScale={0.85}
                   style={{ color: getClosedDaysMode() === 'none' ? 'white' : theme.colors.text }}
                 >
                   {t('common.none', 'None (Open 7 days)')}
                 </AppText>
               </TouchableOpacity>

               <TouchableOpacity 
                 style={[
                   styles.modeButton, 
                   { 
                     backgroundColor: getClosedDaysMode() === 'custom' ? theme.colors.primary : theme.colors.background,
                     borderColor: theme.colors.border 
                   }
                 ]}
                 onPress={() => handleClosedDaysModeChange('custom')}
               >
                 <AppText 
                   adjustsFontSizeToFit
                   numberOfLines={1}
                   minimumFontScale={0.85}
                   style={{ color: getClosedDaysMode() === 'custom' ? 'white' : theme.colors.text }}
                 >
                   {t('common.custom', 'Custom')}
                 </AppText>
               </TouchableOpacity>
            </View>
            
            {/* Custom Day Selector */}
            {getClosedDaysMode() === 'custom' && (
              <View style={[styles.daysContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day, index) => {
                  const isSelected = (profile.closedDays || []).includes(index);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayButton,
                        { 
                          backgroundColor: isSelected ? theme.colors.error : theme.colors.background,
                          borderColor: isSelected ? theme.colors.error : theme.colors.border
                        }
                      ]}
                      onPress={() => toggleClosedDay(index)}
                    >
                      <AppText 
                        adjustsFontSizeToFit
                        numberOfLines={1}
                        minimumFontScale={0.7}
                        style={{ 
                          color: isSelected ? 'white' : theme.colors.text,
                          fontWeight: 'bold'
                        }}>
                        {t(`admin.days.short.${day}`)}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            
            {getClosedDaysMode() === 'custom' && (
              <AppText style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>
                {t('admin.storeProfile.selectClosedDays', 'Select days when store is closed')}
              </AppText>
            )}

            {/* Timezone (Advanced) - Display only for now or editable if needed later */}
             <View style={{ marginTop: 24, padding: 12, backgroundColor: theme.colors.background, borderRadius: 8 }}>
                <AppText style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{t('common.timezone', 'Timezone')}:</AppText>
                <AppText style={{ color: theme.colors.text, fontFamily: 'monospace' }}>
                  {profile.timeZone || DateTime.local().zoneName} {profile.timeZone ? t('admin.storeProfile.customTimezone', { defaultValue: '(Custom)' }) : t('admin.storeProfile.deviceDefaultTimezone', { defaultValue: '(Device Default)' })}
                </AppText>
             </View>

          </View>
          
          {/* Contact Info Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="call" size={20} color={theme.colors.primary} />
              <AppText style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('admin.storeProfile.contactInfo', { defaultValue: 'Contact Information' })}
              </AppText>
            </View>
            
            <View style={styles.input}>
              <AppText style={[styles.label, { color: theme.colors.textSecondary }]}>
                {t('admin.storeProfile.phone', { defaultValue: 'Phone Number' })}
              </AppText>
              <PhoneInput
                value={phoneDigits}
                onChangeText={setPhoneDigits}
                onCountryChange={(country: CountryInfo) => {
                  setPhoneDialCode(country.dialCode);
                  // phoneCountry feeds defaultCountry (the flag). Leaving it stale made
                  // the picker snap back on re-render/refocus: admin sees +964, stores +1.
                  setPhoneCountry(country.code);
                }}
                defaultCountry={phoneCountry}
                label=""
              />
            </View>
            
            <View style={styles.input}>
              <AppText style={[styles.label, { color: theme.colors.textSecondary }]}>
                {t('admin.storeProfile.whatsapp', { defaultValue: 'WhatsApp Number' })}
              </AppText>
              <PhoneInput
                value={waDigits}
                onChangeText={setWaDigits}
                onCountryChange={(country: CountryInfo) => {
                  setWaDialCode(country.dialCode);
                  setWaCountry(country.code);
                }}
                defaultCountry={waCountry}
                label=""
              />
            </View>
            <AppText style={[styles.hintText, { color: theme.colors.textSecondary }]}>
              {t('admin.storeProfile.whatsappHint', { defaultValue: 'Include country code for WhatsApp to work' })}
            </AppText>


            
            <Input
              label={t('admin.storeProfile.email', { defaultValue: 'Email Address' })}
              value={profile.email}
              onChangeText={(text) => handleChange('email', text)}
              placeholder="store@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              containerStyle={styles.input}
            />
          </View>
          
          {/* Default Location Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="location" size={20} color={theme.colors.primary} />
              <AppText style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('admin.storeProfile.defaultLocation', { defaultValue: 'Default Store Location' })}
              </AppText>
            </View>
            
            <AppText style={[styles.descriptionText, { color: theme.colors.textSecondary }]}>
              {t('admin.storeProfile.locationDescription', { 
                defaultValue: 'Select a location to show on product pages. Users can tap "Directions" to navigate.' 
              })}
            </AppText>
            
            {/* Location Selector */}
            <TouchableOpacity
              style={[styles.locationSelector, { 
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
              }]}
              onPress={() => setShowLocationPicker(!showLocationPicker)}
            >
              <View style={[styles.locationSelectorContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.locationIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                  <MaterialIcons 
                    name={selectedLocation ? 'storefront' : 'add-location'} 
                    size={24} 
                    color={theme.colors.primary} 
                  />
                </View>
                <View style={[styles.locationInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <AppText style={[styles.locationName, { color: theme.colors.text }]}>
                    {selectedLocation 
                      ? getLocalizedLocationName(selectedLocation)
                      : t('admin.storeProfile.selectLocation', { defaultValue: 'Select a location...' })
                    }
                  </AppText>
                  {selectedLocation?.city && (
                    <AppText style={[styles.locationCity, { color: theme.colors.textSecondary }]}>
                      {selectedLocation.city}
                    </AppText>
                  )}
                </View>
                <Ionicons 
                  name={showLocationPicker ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color={theme.colors.textSecondary} 
                />
              </View>
            </TouchableOpacity>
            
            {/* Location Options */}
            {showLocationPicker && (
              <View style={[styles.locationOptions, { borderColor: theme.colors.border }]}>
                {locations.length === 0 ? (
                  <View style={styles.noLocations}>
                    <Ionicons name="location-outline" size={32} color={theme.colors.textSecondary} />
                    <AppText style={[styles.noLocationsText, { color: theme.colors.textSecondary }]}>
                      {t('admin.storeProfile.noLocations', { defaultValue: 'No locations added yet' })}
                    </AppText>
                    <TouchableOpacity
                      style={[styles.addLocationButton, { backgroundColor: theme.colors.primary }]}
                      onPress={() => navigation.navigate('AdminEditStoreLocation', {})}
                    >
                      <Ionicons name="add" size={16} color="white" />
                      <AppText style={styles.addLocationButtonText}>
                        {t('admin.storeProfile.addLocation', { defaultValue: 'Add Location' })}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  locations.map((location) => (
                    <TouchableOpacity
                      key={location.id}
                      style={[
                        styles.locationOption,
                        { 
                          borderBottomColor: theme.colors.border,
                          backgroundColor: location.id === selectedLocationId 
                            ? theme.colors.primary + '10' 
                            : 'transparent',
                        },
                      ]}
                      onPress={() => handleSelectLocation(location.id)}
                    >
                      <View style={[styles.locationOptionContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        <View style={{ flex: 1 }}>
                          <AppText style={[styles.locationOptionName, { 
                            color: theme.colors.text,
                            textAlign: isRTL ? 'right' : 'left',
                          }]}>
                            {getLocalizedLocationName(location)}
                          </AppText>
                          {location.city && (
                            <AppText style={[styles.locationOptionCity, { 
                              color: theme.colors.textSecondary,
                              textAlign: isRTL ? 'right' : 'left',
                            }]}>
                              {location.city}
                            </AppText>
                          )}
                        </View>
                        {location.id === selectedLocationId && (
                          <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
            
            {/* Current Location Preview */}
            {selectedLocation && profile.location && (
              <View style={[styles.locationPreview, { backgroundColor: theme.colors.background }]}>
                <AppText style={[styles.locationPreviewLabel, { color: theme.colors.textSecondary }]}>
                  {t('admin.storeProfile.coordinates', { defaultValue: 'Coordinates' })}:
                </AppText>
                <AppText style={[styles.locationPreviewText, { color: theme.colors.text }]}>
                  {profile.location.latitude.toFixed(6)}, {profile.location.longitude.toFixed(6)}
                </AppText>
              </View>
            )}
          </View>
        </ScrollView>
        
        {/* Save Button */}
        <View style={[styles.footer, { 
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: insets.bottom || SPACING.md,
        }]}>
          <Button
            title={t('admin.storeProfile.save', { defaultValue: 'Save Store Profile' })}
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
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: SPACING.md,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    borderRadius: 12,
    margin: SPACING.md,
    marginBottom: 0,
    padding: SPACING.md,
  },
  sectionHeader: {
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    marginBottom: SPACING.md,
  },
  hintText: {
    fontSize: 12,
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  locationSelector: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
  },
  locationSelectorContent: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  locationIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '500',
  },
  locationCity: {
    fontSize: 13,
    marginTop: 2,
  },
  locationOptions: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: SPACING.md,
    overflow: 'hidden',
  },
  noLocations: {
    alignItems: 'center',
    padding: SPACING.lg,
  },
  noLocationsText: {
    fontSize: 14,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  addLocationButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  addLocationButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  locationOption: {
    borderBottomWidth: 1,
    padding: SPACING.md,
  },
  locationOptionContent: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  locationOptionName: {
    fontSize: 15,
    fontWeight: '500',
  },
  locationOptionCity: {
    fontSize: 13,
    marginTop: 2,
  },
  locationPreview: {
    borderRadius: 8,
    marginTop: SPACING.md,
    padding: SPACING.sm,
  },
  locationPreviewLabel: {
    fontSize: 12,
  },
  locationPreviewText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  footer: {
    borderTopWidth: 1,
    padding: SPACING.md,
  },
  saveButton: {
    width: '100%',
  },
  // Logo picker styles
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  logoContainer: {
    alignItems: 'center',
    borderRadius: 50,
    borderWidth: 2,
    height: 100,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 100,
  },
  logoImage: {
    borderRadius: 50,
    height: 100,
    width: 100,
  },
  logoPlaceholder: {
    alignItems: 'center',
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    width: 100,
  },
  logoEditBadge: {
    alignItems: 'center',
    borderRadius: 12,
    bottom: 0,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 24,
  },
  logoHint: {
    fontSize: 13,
    marginTop: SPACING.sm,
  },
  // Cover banner styles
  coverContainer: {
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 2,
    height: 140,
    overflow: 'hidden',
    width: '100%',
  },
  coverImage: {
    borderRadius: 10,
    height: 140,
    width: '100%',
  },
  coverPlaceholder: {
    alignItems: 'center',
    borderRadius: 10,
    height: 140,
    justifyContent: 'center',
    width: '100%',
  },
  coverHint: {
    fontSize: 13,
    marginTop: SPACING.sm,
  },
  timeRow: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  timeButton: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  modeButton: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    marginRight: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  // WeChat QR Code styles
  wechatSection: {
    marginTop: SPACING.md,
  },
  wechatUploadContainer: {
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 2,
    marginTop: SPACING.xs,
    overflow: 'hidden',
  },
  wechatImageWrapper: {
    alignItems: 'center',
    padding: SPACING.md,
    position: 'relative',
  },
  wechatQrImage: {
    borderRadius: 8,
    height: 180,
    width: 180,
  },
  wechatRemoveBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
  },
  wechatPlaceholder: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  wechatHint: {
    fontSize: 13,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
});

export default AdminStoreProfileScreen;
