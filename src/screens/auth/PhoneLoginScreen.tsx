/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useRef, useEffect } from 'react';
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
  I18nManager,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  loginWithPhone, 
  loginWithEmail, 
  signInWithGoogle, 
  isGoogleSignInAvailable,
  signInWithFacebook,
  isFacebookSignInAvailable
} from '../../services/auth';
import { useAuth } from '../../contexts/AuthContext';
import { validatePhone, getCountryInfo, CountryCode } from '../../utils/phoneUtils';
import { useUserRegion } from '../../hooks/useUserRegion';
import { RootStackParamList } from '../../types';
import PhoneInput from '../../components/PhoneInput';
import { CredentialStorage } from '../../services/credentialStorage';
import { useTheme } from '../../components/ThemeProvider';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type LoginMethod = 'phone' | 'email';

// Figma Design Colors
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
  socialFacebook: '#395998',
  socialTwitter: '#169CE8',
  socialApple: '#1B1F2F',
};

const PhoneLoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const userRegion = useUserRegion();
  const { theme, isDark } = useTheme();
  const colors = theme.colors as any;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  // Dark-mode-aware colour tokens. In light mode these resolve to the original
  // Figma constants, so the light design stays pixel-identical.
  const surfaceBg = isDark ? colors.surface : COLORS.white;
  const fieldBg = isDark ? 'rgba(255,255,255,0.06)' : COLORS.inputBg;
  const primaryText = isDark ? colors.text : COLORS.textDark;
  const secondaryText = isDark ? colors.textSecondary : COLORS.textGray;
  const placeholderColor = isDark ? colors.textSecondary : COLORS.placeholder;
  const dividerColor = isDark ? colors.border : COLORS.borderLight;

  const isRequiredAuth = route.params?.requireAuth;
  
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(userRegion);
  const { refreshUser, signInWithApple, isAppleAvailable } = useAuth();
  
  // Secret admin access
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimeout = useRef<NodeJS.Timeout | null>(null);

  // Sync selectedCountry when userRegion loads from AsyncStorage
  useEffect(() => {
    setSelectedCountry(userRegion);
  }, [userRegion]);

  // Load saved credentials when component mounts
  React.useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const credentials = await CredentialStorage.getCredentials();
      if (credentials) {
        if (credentials.email.includes('@')) {
          setLoginMethod('email');
          setEmail(credentials.email);
        } else {
          setLoginMethod('phone');
          setPhone(credentials.email);
        }
        setPassword(credentials.password);
        setRememberMe(true);
      }
    } catch (error) {
      console.log('Failed to load saved credentials:', error);
    }
  };

  const handleSuccessfulLogin = () => {
    const returnReason = route.params?.returnReason;
    
    // If coming from intent-based auth (LoginGate), navigate to the intended destination
    if (isRequiredAuth && returnReason) {
      if (returnReason === 'checkout') {
        navigation.reset({
          index: 1,
          routes: [{ name: 'Main' as any }, { name: 'Checkout' as any }],
        });
      } else if (returnReason === 'orders') {
        navigation.reset({
          index: 1,
          routes: [{ name: 'Main' as any, params: { screen: 'Profile' } }],
        });
      } else {
        navigation.goBack();
        navigation.goBack();
      }
    } else {
      navigation.goBack();
    }
  };

  const handleLogin = async () => {
    try {
      if (loginMethod === 'phone') {
        if (!phone.trim()) {
          Alert.alert(t('auth.error'), t('auth.enterPhone', { defaultValue: 'Please enter your phone number' }));
          return;
        }
        if (!validatePhone(phone, selectedCountry)) {
          Alert.alert(t('auth.error'), t('auth.invalidPhone', { defaultValue: 'Please enter a valid phone number' }));
          return;
        }
      } else {
        if (!email.trim()) {
          Alert.alert(t('auth.error'), t('auth.enterEmail', { defaultValue: 'Please enter your email' }));
          return;
        }
      }

      if (!password.trim()) {
        Alert.alert(t('auth.error'), t('auth.enterPassword', { defaultValue: 'Please enter your password' }));
        return;
      }

      setLoading(true);

      if (loginMethod === 'phone') {
        // Get the dial code for selected country and construct E.164 format directly
        const countryInfo = getCountryInfo(selectedCountry);
        const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
        const formattedPhone = `${countryInfo.dialCode}${cleanPhone}`;
        await loginWithPhone(formattedPhone, password);
      } else {
        await loginWithEmail(email, password);
      }

      // Save or clear credentials based on Remember Me
      try {
        if (rememberMe) {
          const identifier = loginMethod === 'phone' ? phone : email.trim();
          await CredentialStorage.saveCredentials(identifier, password);
        } else {
          await CredentialStorage.clearCredentials();
        }
      } catch (e) {
        console.log('Failed to save/clear credentials:', e);
      }

      await refreshUser();
      handleSuccessfulLogin();
    } catch (error: any) {
      Alert.alert(t('auth.error'), error.message || t('auth.loginFailed', { defaultValue: 'Login failed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  // Passwordless "sign in with a code" — Iraqi numbers go through Supabase OTP (OTPIQ).
  const handleCodeLogin = () => {
    if (loginMethod !== 'phone') { setLoginMethod('phone'); return; }
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (!cleanPhone) {
      Alert.alert(t('auth.error'), t('auth.enterPhone', { defaultValue: 'Please enter your phone number' }));
      return;
    }
    const countryInfo = getCountryInfo(selectedCountry);
    const formattedPhone = `${countryInfo.dialCode}${cleanPhone}`;
    // Iraqi numbers → Supabase/OTPIQ; other countries → Firebase OTP + minted Supabase
    // session. The VerifyPhone screen routes by country automatically.
    navigation.navigate('VerifyPhone', { mode: 'otp-login', phone: formattedPhone });
  };

  const handleRegister = () => {
    navigation.navigate('Register');
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      handleSuccessfulLogin();
    } catch (error: any) {
      if (error.message !== 'Sign in was cancelled') {
        Alert.alert(t('auth.error'), error.message || 'Google sign-in failed');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    try {
      setFacebookLoading(true);
      await signInWithFacebook();
      handleSuccessfulLogin();
    } catch (error: any) {
      if (error.message !== 'User cancelled the login process') {
        Alert.alert(t('auth.error'), error.message || 'Facebook sign-in failed');
      }
    } finally {
      setFacebookLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
      await signInWithApple();
      handleSuccessfulLogin();
    } catch (error: any) {
      if (error.message !== 'Sign in was cancelled') {
        Alert.alert(t('auth.error'), error.message || 'Apple sign-in failed');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  // Secret admin access - tap logo 5 times
  const handleLogoTap = () => {
    if (logoTapTimeout.current) {
      clearTimeout(logoTapTimeout.current);
    }
    
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    
    logoTapTimeout.current = setTimeout(() => {
      setLogoTapCount(0);
    }, 2000);

    if (newCount >= 5) {
      setLogoTapCount(0);
      if (logoTapTimeout.current) {
        clearTimeout(logoTapTimeout.current);
      }
      // 5 taps → choose which kind of account to create.
      Alert.alert(
        t('auth.createAccountTitle', { defaultValue: 'Create account' }),
        t('auth.createAccountMsg', { defaultValue: 'Which type of account do you want to create?' }),
        [
          { text: t('auth.createAdmin', { defaultValue: 'Admin — full store' }), onPress: () => navigation.navigate('AdminSignup' as any) },
          { text: t('auth.createPartner', { defaultValue: 'Partner — view only' }), onPress: () => navigation.navigate('PartnerSignup' as any) },
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        ],
      );
    }
  };

  const handleContinueAsGuest = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' as any }],
    });
  };

  return (
    <View style={styles.container}>
      {/* Dark Header Section */}
      <View style={[styles.darkHeader, { paddingTop: insets.top + 40 }]}>
        {/* Secret tap on title */}
        <TouchableOpacity onPress={handleLogoTap} activeOpacity={1} accessible={false}>
          <AppText style={styles.headerTitle} adjustsFontSizeToFit numberOfLines={1}>
            {t('auth.login', { defaultValue: 'Log In' })}
          </AppText>
        </TouchableOpacity>
        <AppText style={styles.headerSubtitle} adjustsFontSizeToFit numberOfLines={1}>
          {t('auth.welcomeBack', { defaultValue: 'Please sign in to your existing account' })}
        </AppText>
      </View>

      {/* White Card Form Section */}
      <KeyboardAvoidingView
        style={[styles.whiteCard, { backgroundColor: surfaceBg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Login Method Toggle */}
          <View style={[styles.toggleContainer, { backgroundColor: fieldBg }, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                loginMethod === 'phone' && styles.toggleButtonActive,
              ]}
              onPress={() => setLoginMethod('phone')}
            >
              <Ionicons
                name="call-outline"
                size={16}
                color={loginMethod === 'phone' ? COLORS.white : secondaryText}
              />
              <AppText style={[
                styles.toggleText,
                loginMethod === 'phone' ? styles.toggleTextActive : { color: secondaryText },
              ]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.phoneNumber', { defaultValue: 'Phone' })}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                loginMethod === 'email' && styles.toggleButtonActive,
              ]}
              onPress={() => setLoginMethod('email')}
            >
              <Ionicons
                name="mail-outline"
                size={16}
                color={loginMethod === 'email' ? COLORS.white : secondaryText}
              />
              <AppText style={[
                styles.toggleText,
                loginMethod === 'email' ? styles.toggleTextActive : { color: secondaryText },
              ]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.email', { defaultValue: 'Email' })}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Phone/Email Input */}
          {loginMethod === 'phone' ? (
            <View style={{ marginBottom: 20 }}>
              <PhoneInput
                label={t('auth.phoneNumber', { defaultValue: 'Phone Number' })}
                value={phone}
                onChangeText={setPhone}
                onCountryChange={(country) => setSelectedCountry(country.code)}
                defaultCountry={userRegion}
              />
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <AppText style={[styles.label, { color: primaryText }, isRTL && { textAlign: 'right' }]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.email', { defaultValue: 'Email' })}
              </AppText>
              <View style={[styles.inputWrapper, { backgroundColor: fieldBg }]}>
                <TextInput allowFontScaling={false}
                  style={[styles.input, { color: primaryText }]}
                  placeholder="example@gmail.com"
                  placeholderTextColor={placeholderColor}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <AppText style={[styles.label, { color: primaryText }, isRTL && { textAlign: 'right' }]} adjustsFontSizeToFit numberOfLines={1}>
              {t('auth.password', { defaultValue: 'Password' })}
            </AppText>
            <View style={[styles.inputWrapper, { backgroundColor: fieldBg }]}>
              <TextInput allowFontScaling={false}
                style={[styles.input, { color: primaryText }]}
                placeholder="••••••••••"
                placeholderTextColor={placeholderColor}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('common.hidePassword', { defaultValue: 'Hide password' }) : t('common.showPassword', { defaultValue: 'Show password' })}
              accessibilityState={{ selected: showPassword }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={placeholderColor}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember me & Forgot Password Row */}
          <View style={[styles.optionsRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[styles.rememberMe, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.checkbox,
                rememberMe && styles.checkboxChecked,
                isDark && !rememberMe && { backgroundColor: 'transparent', borderColor: colors.border },
                isRTL && { marginRight: 0, marginLeft: 10 },
              ]}>
                {rememberMe && (
                  <Ionicons name="checkmark" size={14} color={COLORS.white} />
                )}
              </View>
              <AppText style={[styles.rememberText, isDark && { color: colors.textSecondary }]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.rememberMe', { defaultValue: 'Remember me' })}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleForgotPassword}>
              <AppText style={styles.forgotText} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.forgotPasswordLabel', { defaultValue: 'Forgot Password' })}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <AppText style={styles.loginButtonText} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.login', { defaultValue: 'Log In' })}
              </AppText>
            )}
          </TouchableOpacity>

          {/* Passwordless code login (Iraqi numbers via OTPIQ) */}
          {loginMethod === 'phone' && (
            <TouchableOpacity onPress={handleCodeLogin} style={[styles.codeLoginButton, isRTL && { flexDirection: 'row-reverse' }]} activeOpacity={0.85}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color={COLORS.orange} style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />
              <AppText style={styles.codeLoginText} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.signInWithCode', { defaultValue: 'Sign in with a code' })}
              </AppText>
            </TouchableOpacity>
          )}

          {/* Register Link */}
          <View style={[styles.registerRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <AppText style={[styles.registerText, { color: secondaryText }]} adjustsFontSizeToFit numberOfLines={1}>
              {t('auth.noAccount', { defaultValue: "Don't have an account?" })}
            </AppText>
            <TouchableOpacity onPress={handleRegister}>
              <AppText style={[styles.registerLink, isRTL && { marginLeft: 0, marginRight: 6 }]} adjustsFontSizeToFit numberOfLines={1}>
                {t('auth.registerAction', { defaultValue: 'Sign Up' })}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: dividerColor }]} />
            <AppText style={[styles.dividerText, { color: secondaryText }]} adjustsFontSizeToFit numberOfLines={1}>
              {t('common.or', { defaultValue: 'Or' })}
            </AppText>
            <View style={[styles.dividerLine, { backgroundColor: dividerColor }]} />
          </View>

          {/* Social Login Buttons */}
          <View style={styles.socialRow}>
            {/* Google Sign In */}
            {isGoogleSignInAvailable() && (
              <TouchableOpacity 
                style={[styles.socialButton, { backgroundColor: '#DB4437' }]}
                onPress={handleGoogleSignIn}
                disabled={googleLoading || facebookLoading}
              >
                {googleLoading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <AppText style={styles.socialIcon} adjustsFontSizeToFit numberOfLines={1}>G</AppText>
                )}
              </TouchableOpacity>
            )}

            {/* Facebook Sign In */}
            {false && isFacebookSignInAvailable() && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: '#1877F2' }]}
                onPress={handleFacebookSignIn}
                disabled={googleLoading || facebookLoading}
              >
                {facebookLoading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Ionicons name="logo-facebook" size={24} color={COLORS.white} />
                )}
              </TouchableOpacity>
            )}

            {/* Apple Sign In */}
            {Platform.OS === 'ios' && isAppleAvailable && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: COLORS.socialApple }]}
                onPress={handleAppleSignIn}
                disabled={googleLoading || facebookLoading || appleLoading}
              >
                {appleLoading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Ionicons name="logo-apple" size={24} color={COLORS.white} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Continue as Guest */}
          <TouchableOpacity 
            style={styles.guestButton}
            onPress={handleContinueAsGuest}
          >
            <AppText style={[styles.guestText, { color: secondaryText }]} adjustsFontSizeToFit numberOfLines={1}>
              {t('auth.continueAsGuest', { defaultValue: 'Continue as Guest' })}
            </AppText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Checkbox
  checkbox: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.borderLight,
    borderRadius: 4,
    borderWidth: 2,
    height: 20,
    marginRight: 10,
    width: 20,
  },
  checkboxChecked: {
    backgroundColor: COLORS.orange,
    borderColor: COLORS.orange,
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
  },
  // Divider
  dividerLine: {
    backgroundColor: COLORS.borderLight,
    flex: 1,
    height: 1,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: 20,
  },
  dividerText: {
    color: COLORS.textGray,
    fontSize: 14,
    marginHorizontal: 16,
  },
  // Eye button for password
  eyeButton: {
    padding: 4,
  },
  // Forgot password
  forgotText: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: '500',
  },
  // Guest button
  guestButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
  },
  guestText: {
    color: COLORS.textGray,
    fontSize: 14,
    fontWeight: '500',
  },
  // Header text
  headerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: 'bold',
  },
  // Input field
  input: {
    color: COLORS.textDark,
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  inputGroup: {
    marginBottom: 20,
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
  // Login button
  loginButton: {
    alignItems: 'center',
    backgroundColor: COLORS.orange,
    borderRadius: 12,
    height: 62,
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeLoginButton: {
    alignItems: 'center',
    borderColor: COLORS.orange,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    height: 54,
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeLoginText: {
    color: COLORS.orange,
    fontSize: 15,
    fontWeight: '600',
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Options row (remember me + forgot)
  optionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  // Register row
  registerLink: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  registerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  registerText: {
    color: COLORS.textGray,
    fontSize: 14,
  },
  // Remember me
  rememberMe: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  rememberText: {
    color: COLORS.textLight,
    fontSize: 13,
  },
  // Scroll content
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  // Social buttons
  socialButton: {
    alignItems: 'center',
    borderRadius: 31,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  socialIcon: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
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

export default PhoneLoginScreen;
