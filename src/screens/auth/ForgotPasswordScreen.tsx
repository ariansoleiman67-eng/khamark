import React, { useState, useEffect } from 'react';
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
  Alert,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPhoneRegistered, sendPasswordResetEmail } from '../../services/auth';
import { validatePhone, getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { useUserRegion } from '../../hooks/useUserRegion';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ResetMethod = 'phone' | 'email';

// Figma Design Colors (same as Login)
const COLORS = {
  darkBg: '#121223',
  white: '#FFFFFF',
  orange: '#FF7622',
  inputBg: '#F0F5FA',
  textDark: '#32343E',
  textGray: '#646982',
  textLight: '#7E8A97',
  placeholder: '#A0A5BA',
  borderLight: '#E3EBF2',
};

const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const userRegion = useUserRegion();

  const [resetMethod, setResetMethod] = useState<ResetMethod>('email');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(userRegion);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync selectedCountry when userRegion loads from AsyncStorage
  useEffect(() => {
    setSelectedCountry(userRegion);
  }, [userRegion]);

  const handleContinue = async () => {
    try {
      if (resetMethod === 'phone') {
        if (!phone.trim()) {
          Alert.alert(t('auth.error'), 'Please enter your phone number');
          return;
        }

        if (!validatePhone(phone)) {
          Alert.alert(t('auth.error'), 'Please enter a valid phone number');
          return;
        }

        setLoading(true);
        const countryInfo = getCountryInfo(selectedCountry);
        const formattedPhone = `${countryInfo.dialCode}${phone.replace(/\D/g, '')}`;

        const exists = await isPhoneRegistered(formattedPhone);
        if (!exists) {
          Alert.alert(
            t('auth.error'),
            'This phone number is not registered. Please check your number or register.'
          );
          setLoading(false);
          return;
        }

        navigation.navigate('VerifyPhone', {
          mode: 'forgot_password',
          phone: formattedPhone,
        });
      } else {
        if (!email.trim()) {
          Alert.alert(t('auth.error'), 'Please enter your email address');
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          Alert.alert(t('auth.error'), 'Please enter a valid email address');
          return;
        }

        setLoading(true);
        await sendPasswordResetEmail(email.trim());

        Alert.alert(
          t('auth.success'),
          t('auth.forgotPassword.emailSent', { 
            defaultValue: 'Password reset email sent! Please check your inbox.' 
          }),
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert(t('auth.error'), error.message || 'Failed to process request');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Dark Header Section */}
      <View style={[styles.darkHeader, { paddingTop: insets.top + 20 }]}>
        {/* Back Button */}
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.textGray} />
        </TouchableOpacity>

        <AppText style={styles.headerTitle} adjustsFontSizeToFit numberOfLines={1}>
          {t('auth.forgotPassword.title', { defaultValue: 'Forgot Password' })}
        </AppText>
        <AppText style={styles.headerSubtitle} adjustsFontSizeToFit numberOfLines={1}>
          {t('auth.forgotPassword.subtitle', { defaultValue: 'Please sign in to your existing account' })}
        </AppText>
      </View>

      {/* White Card Form Section */}
      <KeyboardAvoidingView
        style={styles.whiteCard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Method Toggle */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                resetMethod === 'email' && styles.toggleButtonActive,
              ]}
              onPress={() => setResetMethod('email')}
            >
              <Ionicons 
                name="mail-outline" 
                size={16} 
                color={resetMethod === 'email' ? COLORS.white : COLORS.textGray} 
              />
              <AppText style={[
                styles.toggleText,
                resetMethod === 'email' && styles.toggleTextActive,
              ]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.email', { defaultValue: 'Email' })}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                resetMethod === 'phone' && styles.toggleButtonActive,
              ]}
              onPress={() => setResetMethod('phone')}
            >
              <Ionicons 
                name="call-outline" 
                size={16} 
                color={resetMethod === 'phone' ? COLORS.white : COLORS.textGray} 
              />
              <AppText style={[
                styles.toggleText,
                resetMethod === 'phone' && styles.toggleTextActive,
              ]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.phoneNumber', { defaultValue: 'Phone' })}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Email Input */}
          {resetMethod === 'email' && (
            <View style={styles.inputGroup}>
              <AppText style={styles.label} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.email', { defaultValue: 'Email' })}
              </AppText>
              <View style={styles.inputWrapper}>
                <TextInput allowFontScaling={false}
                  style={styles.input}
                  placeholder="example@gmail.com"
                  placeholderTextColor={COLORS.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          {/* Phone Input */}
          {resetMethod === 'phone' && (
            <View style={styles.inputGroup}>
              <PhoneInput
                label={t('auth.phoneNumber', { defaultValue: 'Phone Number' })}
                value={phone}
                onChangeText={(text) => setPhone(text)}
                onCountryChange={(country) => setSelectedCountry(country.code)}
                defaultCountry={userRegion}
              />
            </View>
          )}

          {/* Send Code Button */}
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <AppText style={styles.sendButtonText} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.sendCode', { defaultValue: 'Send Code' })}
              </AppText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Back button
  backButton: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 45,
    height: 45,
    justifyContent: 'center',
    left: 24,
    position: 'absolute',
    top: 50,
    width: 45,
  },
  // Main container
  container: {
    backgroundColor: COLORS.darkBg,
    flex: 1,
  },
  // Dark header section
  darkHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.darkBg,
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  // Header text
  headerSubtitle: {
    color: 'rgba(255,242,224,0.85)',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 40,
    textAlign: 'center',
  },
  // Input field
  input: {
    color: COLORS.textDark,
    flex: 1,
    fontSize: 14,
    height: 40,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    flexDirection: 'row',
    height: 62,
    paddingHorizontal: 19,
  },
  // Labels
  label: {
    color: COLORS.textDark,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  // Scroll content
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  // Send button
  sendButton: {
    alignItems: 'center',
    backgroundColor: COLORS.orange,
    borderRadius: 12,
    height: 62,
    justifyContent: 'center',
    marginTop: 8,
  },
  sendButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Toggle buttons
  toggleButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.orange,
  },
  toggleContainer: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 24,
    padding: 4,
  },
  toggleText: {
    color: COLORS.textGray,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: COLORS.white,
  },
  // White card form section
  whiteCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    marginTop: -24,
  },
});

export default ForgotPasswordScreen;
