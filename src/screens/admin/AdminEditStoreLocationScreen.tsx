import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_MAPS_API_KEY } from '../../constants/config';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Image as RNImage,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
// iOS CRASH FIX: react-native-maps crashes on iOS with newArchEnabled (Fabric).
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;
if (Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default || maps.MapView;
    Marker = maps.Marker;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch {}
}
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext'; // OWNERSHIP: Get current admin
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { locationService } from '../../services/locationService';
import * as Location from 'expo-location';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import DateTimePicker from '@react-native-community/datetimepicker'; // cspell:disable-line
import PhoneInput from '../../components/PhoneInput';
import { getAllCountries, CountryInfo, CountryCode } from '../../utils/phoneUtils';

type RouteParams = {
  AdminEditStoreLocation: { locationId?: string };
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DEFAULT_WORKING_HOURS = DAYS.reduce((acc, day) => ({
  ...acc,
  [day]: { open: '09:00', close: '18:00', isOpen: true }
}), {} as Record<string, { open: string; close: string; isOpen: boolean }>);

const AdminEditStoreLocationScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'AdminEditStoreLocation'>>();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { user } = useAuth(); // OWNERSHIP: Get current admin
  const currentAdminId = user?.uid || '';
  const locationId = route.params?.locationId;
  const isEditing = !!locationId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const mapRef = useRef<any>(null);
  // Alert.alert is a native global modal with no lifecycle binding, and the header
  // back button is not disabled during a write. getCurrentPositionAsync at High
  // accuracy routinely runs 10-30s indoors, so backing out mid-request left its
  // success/failure alert to fire over the store-locations list with no context —
  // and after a save, announcing a write the admin never saw complete.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Form state
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameKu, setNameKu] = useState('');
  const [address, setAddress] = useState('');
  const [addressAr, setAddressAr] = useState('');
  const [addressKu, setAddressKu] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  // Stores are Iraqi: defaulting to US (+1) silently prefixed local numbers with the wrong
  // dial code ("07701234567" → "+107701234567"), breaking every customer tel:/WhatsApp link.
  const [phoneDialCode, setPhoneDialCode] = useState('+964');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('IQ');
  const [phoneValid, setPhoneValid] = useState(false);
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [latitude, setLatitude] = useState(36.1911);
  const [longitude, setLongitude] = useState(44.0094);
  const [latitudeText, setLatitudeText] = useState('36.1911');
  const [longitudeText, setLongitudeText] = useState('44.0094');
  // The lat/lng above are a hard-coded Erbil placeholder. On iOS the map is a static image
  // (react-native-maps crashes under Fabric), so without this flag every new branch would be
  // saved at that placeholder and customer "Directions" would route to the wrong place.
  const [coordsSet, setCoordsSet] = useState(false);
  const [type, setType] = useState<'main' | 'branch' | 'service'>('branch');
  const [isActive, setIsActive] = useState(true);
  const [workingHours, setWorkingHours] = useState(DEFAULT_WORKING_HOURS);

  // Helper: parse a full phone string into { dialCode, digits, countryCode }
  const parsePhoneNumber = (phone: string) => {
    const allC = getAllCountries();
    const sorted = [...allC].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const match = sorted.find(c => phone.startsWith(c.dialCode));
    if (match) {
      return { dialCode: match.dialCode, digits: phone.slice(match.dialCode.length).trim(), countryCode: match.code };
    }
    return { dialCode: '+964', digits: phone.replace(/[^\d]/g, ''), countryCode: 'IQ' as CountryCode };
  };
  
  // Time picker state
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<{ day: string; field: 'open' | 'close' } | null>(null);

  useEffect(() => {
    // RACE FIX: defer the load until the admin id is known and re-run once auth rehydrates,
    // so a cold-start / stale-closure currentAdminId ('') can't false-fail the ownership check.
    if (isEditing && locationId && currentAdminId) {
      loadLocation();
    }
  }, [locationId, currentAdminId]);

  const loadLocation = async () => {
    try {
      const location = await locationService.getLocationById(locationId!);
      if (location) {
        // OWNERSHIP CHECK: Block editing if not owner
        if (location.createdByAdminId && currentAdminId && location.createdByAdminId !== currentAdminId) {
          mountedRef.current && Alert.alert(
            t('admin.common.error'),
            t('admin.storeLocations.noPermission') || 'You do not have permission to edit this location'
          );
          navigation.goBack();
          return;
        }
        
        setName(location.name || '');
        setNameAr(location.nameAr || '');
        setNameKu(location.nameKu || '');
        setAddress(location.address || '');
        setAddressAr(location.addressAr || '');
        setAddressKu(location.addressKu || '');
        if (location.phone) {
          const parsed = parsePhoneNumber(location.phone);
          setPhoneDialCode(parsed.dialCode);
          setPhoneDigits(parsed.digits);
          setPhoneCountry(parsed.countryCode);
        }
        setEmail(location.email || '');
        setCity(location.city || '');
        setLatitude(location.latitude);
        setLongitude(location.longitude);
        setLatitudeText(String(location.latitude));
        setLongitudeText(String(location.longitude));
        setCoordsSet(true);
        setType(location.type);
        setIsActive(location.isActive);
        if (location.workingHours) {
          setWorkingHours(location.workingHours);
        }
      } else {
        // The row is genuinely gone (the service now rethrows read failures). Presenting the
        // blank form here would let the admin re-create it as a new, unrelated location.
        mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.notFound'));
        navigation.goBack();
        return;
      }
    } catch (error) {
      mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.loadFailed'));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = (e: any) => {
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setLatitude(lat);
    setLongitude(lng);
    setLatitudeText(String(lat));
    setLongitudeText(String(lng));
    setCoordsSet(true);
  };

  // Cross-platform coordinate entry: the only way to set a location on iOS, where the map is
  // a non-interactive static image. Out-of-range text is kept visible but not committed, so
  // handleSave's range check is what actually blocks the save.
  const handleLatitudeChange = (text: string) => {
    setLatitudeText(text);
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed) && parsed >= -90 && parsed <= 90) {
      setLatitude(parsed);
      setCoordsSet(true);
    }
  };

  const handleLongitudeChange = (text: string) => {
    setLongitudeText(text);
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed) && parsed >= -180 && parsed <= 180) {
      setLongitude(parsed);
      setCoordsSet(true);
    }
  };

  // Auto-pick current location using GPS
  const handleGetCurrentLocation = async () => {
    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        mountedRef.current && Alert.alert(
          t('location.permissionDenied'),
          t('location.permissionRequired')
        );
        return;
      }

      setGettingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newLat = location.coords.latitude;
      const newLng = location.coords.longitude;
      
      setLatitude(newLat);
      setLongitude(newLng);
      setLatitudeText(String(newLat));
      setLongitudeText(String(newLng));
      setCoordsSet(true);

      // Animate map to new location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: newLat,
          longitude: newLng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 500);
      }

      mountedRef.current && Alert.alert(
        t('admin.common.success'),
        t('admin.storeLocations.locationAutoSet')
      );
    } catch (error) {
      console.error('Error getting location:', error);
      mountedRef.current && Alert.alert(
        t('location.error'),
        t('location.failedToGetLocation')
      );
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSave = async () => {
    // Local numbers are written with a trunk "0" that is dropped in E.164 — keeping it
    // produces "+96407701234567", which no dialer or WhatsApp link resolves.
    const subscriberDigits = phoneDigits.replace(/\D/g, '').replace(/^0+/, '');
    const fullPhone = subscriberDigits ? `${phoneDialCode}${subscriberDigits}` : '';
    if (!name.trim() || !address.trim() || !fullPhone.trim() || !city.trim()) {
      mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.requiredFields'));
      return;
    }

    if (!phoneValid) {
      mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.invalidPhone'));
      return;
    }

    const latNum = parseFloat(latitudeText);
    const lngNum = parseFloat(longitudeText);
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90 || !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.invalidCoordinates'));
      return;
    }

    if (!coordsSet) {
      mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.coordinatesRequired'));
      return;
    }

    if (!currentAdminId) {
      mountedRef.current && Alert.alert(t('admin.common.error'), t('admin.storeLocations.mustBeLoggedIn', { defaultValue: 'You must be logged in to save locations' }));
      return;
    }

    setSaving(true);
    try {
      const locationData = {
        name: name.trim(),
        nameAr: nameAr.trim(),
        nameKu: nameKu.trim(),
        address: address.trim(),
        addressAr: addressAr.trim(),
        addressKu: addressKu.trim(),
        phone: fullPhone.trim(),
        email: email.trim(),
        city: city.trim(),
        latitude: latNum,
        longitude: lngNum,
        type,
        isActive,
        workingHours,
      };

      if (isEditing && locationId) {
        // OWNERSHIP: Pass adminId for ownership verification
        await locationService.updateLocation(locationId, locationData, currentAdminId);
        mountedRef.current && Alert.alert(t('admin.common.success'), t('admin.storeLocations.updateSuccess'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() }
        ]);
      } else {
        // OWNERSHIP: Pass adminId to bind createdByAdminId on creation
      // @ts-ignore - extended location properties
        await locationService.addLocation(locationData, currentAdminId);
        mountedRef.current && Alert.alert(t('admin.common.success'), t('admin.storeLocations.addSuccess'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      mountedRef.current && Alert.alert(t('admin.common.error'), error.message || t('admin.storeLocations.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateWorkingHour = (day: string, field: 'open' | 'close' | 'isOpen', value: string | boolean) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  const openTimePicker = (day: string, field: 'open' | 'close') => {
    setActiveTimeField({ day, field });
    setShowTimePicker(true);
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    
    if (selectedDate && activeTimeField) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      updateWorkingHour(activeTimeField.day, activeTimeField.field, timeString);
    }
    
    if (Platform.OS === 'ios') {
      // Keep picker open on iOS for easier selection
    }
  };

  const getTimeAsDate = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 9, minutes || 0, 0, 0);
    return date;
  };

  const closeTimePicker = () => {
    setShowTimePicker(false);
    setActiveTimeField(null);
  };

  const renderInput = (label: string, value: string, onChangeText: (text: string) => void, placeholder?: string, keyboardType?: any) => (
    <View style={styles.inputContainer}>
      <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <TextInput allowFontScaling={false}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            borderColor: theme.colors.border,
            textAlign: isRTL ? 'right' : 'left',
          }
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType={keyboardType}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          onPress={() => { if (!saving) navigation.goBack(); }}
          disabled={saving}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          accessibilityState={{ disabled: saving }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {isEditing ? t('admin.storeLocations.editLocation') : t('admin.storeLocations.addLocation')}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Basic Info */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.storeLocations.basicInfo')}</Text>
            {renderInput(t('admin.storeLocations.nameEnglish') + ' *', name, setName)}
            {renderInput(t('admin.storeLocations.nameArabic'), nameAr, setNameAr)}
            {renderInput(t('admin.storeLocations.nameKurdish'), nameKu, setNameKu)}
            {renderInput(t('admin.storeLocations.city') + ' *', city, setCity)}
            <View style={styles.inputContainer}>
              <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.text }]}>{t('admin.storeLocations.phone') + ' *'}</Text>
              <PhoneInput
                value={phoneDigits}
                onChangeText={setPhoneDigits}
                onValidChange={setPhoneValid}
                onCountryChange={(country: CountryInfo) => setPhoneDialCode(country.dialCode)}
                defaultCountry={phoneCountry}
                label=""
              />
            </View>
            {renderInput(t('admin.storeLocations.email'), email, setEmail, 'email@example.com', 'email-address')}
          </View>

          {/* Address */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.storeLocations.address')}</Text>
            {renderInput(t('admin.storeLocations.addressEnglish') + ' *', address, setAddress)}
            {renderInput(t('admin.storeLocations.addressArabic'), addressAr, setAddressAr)}
            {renderInput(t('admin.storeLocations.addressKurdish'), addressKu, setAddressKu)}
          </View>

          {/* Type */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.storeLocations.locationType')}</Text>
            <View style={styles.typeContainer}>
              {(['main', 'branch', 'service'] as const).map((locType) => (
                <TouchableOpacity
                  key={locType}
                  style={[
                    styles.typeButton,
                    { borderColor: type === locType ? theme.colors.primary : theme.colors.border },
                    type === locType && { backgroundColor: theme.colors.primary + '20' }
                  ]}
                  onPress={() => setType(locType)}
                >
                  <Ionicons
                    name={locType === 'main' ? 'business' : locType === 'branch' ? 'storefront' : 'construct'}
                    size={20}
                    color={type === locType ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text allowFontScaling={false} style={[
                    styles.typeText,
                    { color: type === locType ? theme.colors.primary : theme.colors.textSecondary }
                  ]}>
                    {t(`admin.storeLocations.${locType}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Map Location */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.storeLocations.mapLocation')}</Text>
            <Text allowFontScaling={false} style={[styles.mapHint, { color: theme.colors.textSecondary }]}>
              {t('admin.storeLocations.tapToSetLocation')}
            </Text>
            
            {/* Use Current Location Button */}
            <TouchableOpacity
              style={[styles.currentLocationButton, { backgroundColor: theme.colors.primary }]}
              onPress={handleGetCurrentLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="locate" size={20} color="#fff" />
              )}
              <Text allowFontScaling={false} style={styles.currentLocationText}>
                {gettingLocation ? t('location.gettingLocation') : t('admin.storeLocations.useMyLocation')}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.mapContainer}>
              {Platform.OS === 'ios' || !MapView ? (
                // iOS: Show static map image (native MapView crashes with Fabric)
                <TouchableOpacity
                  onPress={() => {
                    const url = `https://maps.apple.com/?ll=${latitude},${longitude}&q=Store+Location&z=15`;
                    Linking.openURL(url).catch(() => {});
                  }}
                  activeOpacity={0.8}
                  style={{ borderRadius: 12, overflow: 'hidden', height: 200 }}
                >
                  <RNImage
                    source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=600x400&maptype=roadmap&markers=color:red%7C${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}` }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="open-outline" size={14} color="#fff" />
                    <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t('admin.storeLocations.openInMaps', { defaultValue: 'Open in Maps' })}</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  provider={PROVIDER_GOOGLE}
                  region={{
                    latitude,
                    longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  onPress={handleMapPress}
                >
                  <Marker
                    coordinate={{ latitude, longitude }}
                    pinColor={locationService.getStoreTypeColor(type)}
                  />
                </MapView>
              )}
            </View>
            {/* Manual entry is the only way to set coordinates on iOS, where the map above
                is a static image that merely deep-links into Apple Maps. */}
            <View style={[styles.coordsInputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.coordsInputField}>
                <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('admin.storeLocations.latitude')}
                </Text>
                <TextInput allowFontScaling={false}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.background,
                      color: theme.colors.text,
                      borderColor: theme.colors.border,
                    }
                  ]}
                  value={latitudeText}
                  onChangeText={handleLatitudeChange}
                  placeholder="36.1911"
                  placeholderTextColor={theme.colors.textSecondary}
                  // iOS 'numeric' has no minus key, so southern-hemisphere coordinates
                  // would be impossible to type.
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                />
              </View>
              <View style={styles.coordsInputField}>
                <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('admin.storeLocations.longitude')}
                </Text>
                <TextInput allowFontScaling={false}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.background,
                      color: theme.colors.text,
                      borderColor: theme.colors.border,
                    }
                  ]}
                  value={longitudeText}
                  onChangeText={handleLongitudeChange}
                  placeholder="44.0094"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                />
              </View>
            </View>
            <View style={styles.coordsRow}>
              <Text allowFontScaling={false} style={[styles.coordsText, { color: theme.colors.textSecondary }]}>
                {t('admin.storeLocations.latitude')}: {latitude.toFixed(6)} | {t('admin.storeLocations.longitude')}: {longitude.toFixed(6)}
              </Text>
            </View>
          </View>

          {/* Active Status */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View>
                <Text allowFontScaling={false} style={[styles.switchLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{t('admin.storeLocations.activeStatus')}</Text>
                <Text allowFontScaling={false} style={[styles.switchHint, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('admin.storeLocations.visibleToCustomers')}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
                thumbColor={isActive ? theme.colors.primary : '#f4f3f4'}
              />
            </View>
          </View>



          {/* Working Hours */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.storeLocations.workingHours', { defaultValue: 'Working Hours' })}</Text>
            {DAYS.map((day) => {
              const dh = workingHours[day] ?? DEFAULT_WORKING_HOURS[day];
              return (
                <View key={day} style={[styles.hoursRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.dayInfo, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Switch
                      value={dh.isOpen}
                      onValueChange={(v) => updateWorkingHour(day, 'isOpen', v)}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
                      thumbColor={dh.isOpen ? theme.colors.primary : '#f4f3f4'}
                    />
                    <Text allowFontScaling={false} style={[styles.dayLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t(`admin.days.${day}`, { defaultValue: day.charAt(0).toUpperCase() + day.slice(1) })}
                    </Text>
                  </View>
                  {dh.isOpen ? (
                    <View style={[styles.hoursInputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <TouchableOpacity
                        style={[styles.timeButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                        onPress={() => openTimePicker(day, 'open')}
                      >
                        <Text allowFontScaling={false} style={[styles.timeButtonText, { color: theme.colors.text }]}>{dh.open}</Text>
                      </TouchableOpacity>
                      <Text allowFontScaling={false} style={[styles.hoursTo, { color: theme.colors.textSecondary }]}>-</Text>
                      <TouchableOpacity
                        style={[styles.timeButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                        onPress={() => openTimePicker(day, 'close')}
                      >
                        <Text allowFontScaling={false} style={[styles.timeButtonText, { color: theme.colors.text }]}>{dh.close}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text allowFontScaling={false} style={[styles.timeButtonText, { color: theme.colors.textSecondary }]}>
                      {t('admin.operatingHours.closed', { defaultValue: 'Closed' })}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save Button */}
      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text allowFontScaling={false} style={styles.saveButtonText}>{isEditing ? t('admin.storeLocations.updateLocation') : t('admin.storeLocations.addLocation')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Time Picker Modal */}
      {showTimePicker && activeTimeField && (
        <>
          {Platform.OS === 'ios' ? (
            <View style={[styles.timePickerOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <View style={[styles.timePickerContainer, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.timePickerHeader}>
                  <Text allowFontScaling={false} style={[styles.timePickerTitle, { color: theme.colors.text }]}>
                    {activeTimeField.field === 'open'
                      ? t('admin.storeLocations.selectOpeningTime', { defaultValue: 'Select Opening Time' })
                      : t('admin.storeLocations.selectClosingTime', { defaultValue: 'Select Closing Time' })}
                  </Text>
                  <TouchableOpacity onPress={closeTimePicker}>
                    <Text allowFontScaling={false} style={[styles.timePickerDone, { color: theme.colors.primary }]}>{t('common.done', { defaultValue: 'Done' })}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={getTimeAsDate(workingHours[activeTimeField.day]?.[activeTimeField.field] ?? '09:00')}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.timePicker}
                />
              </View>
            </View>
          ) : (
            <DateTimePicker
              value={getTimeAsDate(workingHours[activeTimeField.day]?.[activeTimeField.field] ?? '09:00')}
              mode="time"
              is24Hour={true}
              display="spinner"
              onChange={handleTimeChange}
            />
          )}
        </>
      )}
    </View>
  );
};

const BUTTON_TEXT_COLOR = '#FFFFFF';

const styles = StyleSheet.create({
  backButton: {
    padding: 4,
  },
  bottomSpacing: {
    height: 100,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  coordsInputField: {
    flex: 1,
    marginHorizontal: 4,
  },
  coordsInputRow: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
  },
  coordsRow: {
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  coordsText: {
    fontSize: 12,
  },
  currentLocationButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
    paddingVertical: 12,
  },
  currentLocationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  dayInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    width: 130,
  },
  dayLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  footer: {
    borderTopWidth: 1,
    padding: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.md,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingTop: 50,
  },
  headerPlaceholder: {
    width: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  hoursInput: {
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
    width: 70,
  },
  hoursInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  hoursRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    paddingVertical: 4,
  },
  hoursTo: {
    fontSize: 12,
    marginHorizontal: 6,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    height: 40,
    includeFontPadding: false,
    paddingHorizontal: 12,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  inputContainer: {
    marginBottom: SPACING.md,
  },
  keyboardAvoid: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  map: {
    borderRadius: 12,
    height: 200,
    width: '100%',
  },
  mapContainer: {
    borderRadius: 12,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  mapHint: {
    fontSize: 12,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    padding: 16,
  },
  saveButtonText: {
    color: BUTTON_TEXT_COLOR,
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    borderRadius: 12,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  switchHint: {
    fontSize: 12,
    marginTop: 2,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 75,
  },
  timeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  timePicker: {
    height: 200,
  },
  timePickerContainer: {
    borderRadius: 16,
    margin: SPACING.lg,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  timePickerDone: {
    fontSize: 16,
    fontWeight: '600',
  },
  timePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  timePickerOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  timePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: SPACING.sm,
  },
  typeContainer: {
    flexDirection: 'row',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});

export default AdminEditStoreLocationScreen;
