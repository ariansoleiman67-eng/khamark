// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  AppState,
  Keyboard,
  Modal,
  Animated as RNAnimated,
  Pressable,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { AuthService } from '../../services/authService';
import { ImageService } from '../../services/imageService';
import { formatPhone, validatePhone } from '../../utils/phoneUtils';

// ========================
// LUXURY EDIT PROFILE
// ========================

// ---- Helpers ----

const maskPhone = (phone: string): string => {
  if (!phone) return '';
  const clean = phone.replace(/\s/g, '');
  if (clean.length < 4) return phone;
  return `${clean.slice(0, 4)} ••• ••• ${clean.slice(-2)}`;
};

const getMonogram = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name[0].toUpperCase();
};

// ---- Custom Bottom Sheet ----
interface LuxurySheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  isDark: boolean;
  surfaceColor: string;
}

const LuxurySheet: React.FC<LuxurySheetProps> = ({ visible, onClose, children, isDark, surfaceColor }) => {
  const translateY = useRef(new RNAnimated.Value(400)).current;
  const backdropOpacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      RNAnimated.parallel([
        RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 200 }),
        RNAnimated.timing(backdropOpacity, { toValue: 1, useNativeDriver: true, duration: 250 }),
      ]).start();
    } else {
      RNAnimated.parallel([
        RNAnimated.timing(translateY, { toValue: 400, useNativeDriver: true, duration: 200 }),
        RNAnimated.timing(backdropOpacity, { toValue: 0, useNativeDriver: true, duration: 200 }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop */}
        <Pressable style={{ flex: 1 }} onPress={() => { Keyboard.dismiss(); onClose(); }}>
          <RNAnimated.View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            opacity: backdropOpacity,
          }} />
        </Pressable>

        {/* Sheet */}
        <RNAnimated.View style={{
          backgroundColor: surfaceColor,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 40 : 24,
          transform: [{ translateY }],
        }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              width: 40, height: 5, borderRadius: 3,
              backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
            }} />
          </View>
          {children}
        </RNAnimated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ---- Types ----
type SheetMode = 'name' | null;

// ---- Validation Schemas ----
const nameSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100)
});
type NameFormData = z.infer<typeof nameSchema>;

const vehicleSchema = z.object({
  make: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  year: z.string().refine(val => !val || /^\d{4}$/.test(val), 'Must be a valid 4-digit year').optional(),
  vin: z.string().max(17, 'VIN cannot exceed 17 characters').optional()
});
type VehicleFormData = z.infer<typeof vehicleSchema>;

// ========================
// MAIN COMPONENT
// ========================
const EditProfileScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();

  // Data
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [vehicleSummary, setVehicleSummary] = useState({ make: '', model: '', year: '' });
  const [showVehicle, setShowVehicle] = useState(false);

  // Forms
  const {
    control: nameControl,
    handleSubmit: handleNameSubmit,
    reset: resetNameForm,
    formState: { errors: nameErrors, isValid: isNameValid }
  } = useForm<NameFormData>({ resolver: zodResolver(nameSchema), mode: 'onChange' });

  const {
    control: vehicleControl,
    handleSubmit: handleVehicleSubmit,
    reset: resetVehicleForm,
    formState: { errors: vehicleErrors }
  } = useForm<VehicleFormData>({ resolver: zodResolver(vehicleSchema) });

  // UI
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);

  // Colors
  const cardBg = isDark ? theme.colors.surface : '#FFFFFF';
  const pageBg = isDark ? theme.colors.background : '#F5F5F7';
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';
  const chipBg = isDark ? 'rgba(76,175,80,0.15)' : '#E8F5E9';
  const chipColor = '#4CAF50';
  const surfaceSheet = isDark ? theme.colors.surface : '#FFFFFF';

  // ---- Load ----
  useEffect(() => { loadProfile(); }, [user]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'active') {
        try { await refreshUser(); } catch {}
      }
    });
    return () => sub.remove();
  }, [refreshUser]);

  const loadProfile = async () => {
    try {
      const data = await AuthService.getCurrentUserFresh() as any;
      if (data) {
        setFullName(data.name || data.fullName || '');
        setPhone(data.phone || '');
        setProfileImage(data.profileImageUrl || null);
        const vInfo = {
          make: data.vehicleInfo?.make || '',
          model: data.vehicleInfo?.model || '',
          year: data.vehicleInfo?.year || '',
          vin: data.vehicleInfo?.vin || '',
        };
        resetVehicleForm(vInfo);
        setVehicleSummary({ make: vInfo.make, model: vInfo.model, year: vInfo.year });
        setShowVehicle(!!(vInfo.make));
      } else if (user) {
        setFullName((user as any).displayName || '');
        setPhone((user as any).phoneNumber || '');
        setProfileImage((user as any).photoURL || null);
      }
    } catch {}
  };

  // ---- Image ----
  const handleImagePicker = async () => {
    try {
      const result = await ImageService.pickImage({ quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        setUploadingImage(true);
        const upload = await ImageService.uploadImage(result.assets[0].uri);
        if (upload.success && upload.url) {
          setProfileImage(upload.url);
          if (user?.uid) {
            await AuthService.updateUserProfile(user.uid, { profileImageUrl: upload.url } as any);
            await refreshUser();
          }
        } else {
          Alert.alert(t('common.error'), upload.error || 'Upload failed');
        }
        setUploadingImage(false);
      }
    } catch (e: any) {
      setUploadingImage(false);
      Alert.alert(t('common.error'), e.message);
    }
  };

  // ---- Sheet ----
  const openSheet = (mode: SheetMode) => {
    if (mode === 'name') resetNameForm({ fullName: fullName });
    setSheetMode(mode);
  };

  const closeSheet = () => { Keyboard.dismiss(); setSheetMode(null); };

  const onNameSave = async (data: NameFormData) => {
    try {
      setSaving(true);
      if (user?.uid) {
        await AuthService.updateUserProfile(user.uid, { name: data.fullName, fullName: data.fullName } as any);
        setFullName(data.fullName);
        await refreshUser();
      }
      closeSheet();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally { setSaving(false); }
  };

  // ---- Vehicle ----
  const onVehicleSave = async (data: VehicleFormData) => {
    try {
      setSaving(true);
      if (user?.uid) {
        const make = (data.make || '').trim();
        const model = (data.model || '').trim();
        const year = (data.year || '').trim();
        const vin = (data.vin || '').trim().toUpperCase();

        await AuthService.updateUserProfile(user.uid, {
          vehicleInfo: { make, model, year, vin },
        } as any);
        setVehicleSummary({ make, model, year });
        await refreshUser();
        Alert.alert(t('common.success'), 'Vehicle info updated.');
      }
    } catch (e: any) { Alert.alert(t('common.error'), e.message); }
    finally { setSaving(false); }
  };

  // ========================
  // RENDER
  // ========================

  // Shared card style
  const cardStyle = {
    backgroundColor: cardBg,
    borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
  };

  const editBadge = (color: string, icon: string) => (
    <View style={{
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: color, justifyContent: 'center', alignItems: 'center',
    }}>
      <Ionicons name={icon as any} size={16}
        color={icon === 'lock-closed' ? chipColor : theme.colors.primary} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Profile' as never)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }}>
            {t('profile.editProfile') || 'Profile'}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* ---- Avatar Hero ---- */}
          <Animated.View entering={FadeInDown.delay(80).duration(450)}
            style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 28 }}>
            <TouchableOpacity onPress={handleImagePicker} disabled={uploadingImage} activeOpacity={0.8}
              style={{
                width: 100, height: 100, borderRadius: 50,
                backgroundColor: theme.colors.primary + '18',
                justifyContent: 'center', alignItems: 'center', marginBottom: 16,
                shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
              }}>
              {uploadingImage ? (
                <ActivityIndicator size="large" color={theme.colors.primary} />
              ) : profileImage ? (
                <Image source={{ uri: profileImage }}
                  style={{ width: 100, height: 100, borderRadius: 50 }}
                  contentFit="cover" transition={200} />
              ) : (
                <Text allowFontScaling={false} style={{ fontSize: 36, fontWeight: '700', color: theme.colors.primary }}>
                  {getMonogram(fullName)}
                </Text>
              )}
              <View style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: theme.colors.primary,
                justifyContent: 'center', alignItems: 'center',
                borderWidth: 3, borderColor: pageBg,
              }}>
                <Ionicons name="camera" size={15} color="white" />
              </View>
            </TouchableOpacity>

            <Text allowFontScaling={false} style={{ fontSize: 26, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3, textAlign: 'center' }}>
              {fullName || t('profile.yourName', { defaultValue: 'Your Name' })}
            </Text>
            {user?.createdAt && (
              <Text allowFontScaling={false} style={{ fontSize: 13, color: labelColor, marginTop: 4 }}>
                {t('profile.memberSince', { defaultValue: 'Member since {{year}}', year: new Date(user.createdAt).getFullYear() })}
              </Text>
            )}
          </Animated.View>

          {/* ---- Cards ---- */}
          <View style={{ paddingHorizontal: 20, gap: 12 }}>

            {/* Name */}
            <Animated.View entering={FadeInDown.delay(180).duration(400)}>
              <TouchableOpacity onPress={() => openSheet('name')} activeOpacity={0.7} style={cardStyle}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={{ fontSize: 13, fontWeight: '500', color: labelColor, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: isRTL ? 'right' : 'left' }}>
                      {t('profile.fullName') || 'Full Name'}
                    </Text>
                    <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }}>
                      {fullName || '—'}
                    </Text>
                  </View>
                  {editBadge(theme.colors.primary + '12', 'pencil')}
                </View>
              </TouchableOpacity>
            </Animated.View>


          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ======================== BOTTOM SHEET ======================== */}
      <LuxurySheet visible={sheetMode !== null} onClose={closeSheet} isDark={isDark} surfaceColor={surfaceSheet}>
        <View style={{ paddingHorizontal: 24 }}>
          <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 4, textAlign: isRTL ? 'right' : 'left' }}>
            {t('profile.updateName', { defaultValue: 'Update name' })}
          </Text>
          <Text allowFontScaling={false} style={{ fontSize: 14, color: labelColor, marginBottom: 24, textAlign: isRTL ? 'right' : 'left' }}>
            {t('profile.enterFullName') || 'Enter your full name'}
          </Text>

          <Controller
            control={nameControl}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput allowFontScaling={false}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('profile.fullName', { defaultValue: 'Full name' })}
                placeholderTextColor={labelColor}
                keyboardType='default'
                autoCapitalize='words'
                autoFocus
                scrollEnabled={false}
                textAlign={isRTL ? 'right' : 'left'}
                style={{
                  borderWidth: 1, borderColor: (nameErrors.fullName ? theme.colors.error : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')),
                  borderRadius: 14, paddingHorizontal: 18, paddingVertical: 0,
                  fontSize: 17, color: theme.colors.text,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  includeFontPadding: false,
                  textAlignVertical: 'center',
                  height: 52,
                }}
              />
            )}
          />
          {nameErrors.fullName && (
            <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 13, marginTop: 6, marginLeft: 4, textAlign: isRTL ? 'right' : 'left' }}>
              {nameErrors.fullName.message}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleNameSubmit(onNameSave)}
            disabled={saving || !isNameValid}
            activeOpacity={0.8}
            style={{
              backgroundColor: (saving || !isNameValid)
                ? (theme.colors.primary + '60') : theme.colors.primary,
              borderRadius: 16, height: 52,
              justifyContent: 'center', alignItems: 'center', marginTop: 20,
            }}>
            {saving ? <ActivityIndicator color="white" /> : (
              <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: 'white' }}>
                {t('common.save') || 'Save'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </LuxurySheet>
    </View>
  );
};

export default EditProfileScreen;
