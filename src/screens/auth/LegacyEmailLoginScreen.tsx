import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { loginWithEmail } from '../../services/auth';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const LegacyEmailLoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      // Validation
      if (!email.trim()) {
        Alert.alert(t('auth.error'), t('auth.enterEmail', { defaultValue: 'Please enter your email' }));
        return;
      }

      if (!password.trim()) {
        Alert.alert(t('auth.error'), t('auth.enterPassword', { defaultValue: 'Please enter your password' }));
        return;
      }

      setLoading(true);

      // Login
      await loginWithEmail(email, password);

      // Success - AuthContext will handle navigation
      Alert.alert(t('auth.success'), t('auth.welcomeBack', { defaultValue: 'Welcome back!' }));
    } catch (error: any) {
      Alert.alert(t('auth.error'), error.message || t('auth.loginFailed', { defaultValue: 'Login failed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPhoneLogin = () => {
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="mail" size={80} color={theme.colors.primary} />
          <AppText style={[styles.title, { color: theme.colors.text }]}>
            {t('auth.legacyLogin.title', { defaultValue: 'Legacy Email Login' })}
          </AppText>
          <AppText style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {t('auth.legacyLogin.subtitle', { 
              defaultValue: 'For existing admin accounts only' 
            })}
          </AppText>
        </View>

        {/* Warning Box */}
        <View style={[styles.warningBox, { backgroundColor: theme.colors.warning + '10', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="warning-outline" size={20} color={theme.colors.warning} />
          <AppText style={[styles.warningText, { color: theme.colors.warning, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('auth.legacyLogin.warning', { 
              defaultValue: 'This login method is for legacy accounts only. New users should use phone login.' 
            })}
          </AppText>
        </View>

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <AppText style={[styles.label, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('auth.email', { defaultValue: 'Email' })}
          </AppText>
          <View style={[styles.inputWrapper, {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            flexDirection: isRTL ? 'row-reverse' : 'row'
          }]}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} />
            <TextInput allowFontScaling={false}
              style={[styles.input, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}
              placeholder={t('auth.enterEmail', { defaultValue: 'Enter email' })}
              placeholderTextColor={theme.colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <AppText style={[styles.label, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('auth.password', { defaultValue: 'Password' })}
          </AppText>
          <View style={[styles.inputWrapper, {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            flexDirection: isRTL ? 'row-reverse' : 'row'
          }]}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
            <TextInput allowFontScaling={false}
              style={[styles.input, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}
              placeholder={t('auth.enterPassword', { defaultValue: 'Enter password' })}
              placeholderTextColor={theme.colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons 
                name={showPassword ? 'eye-off-outline' : 'eye-outline'} 
                size={20} 
                color={theme.colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.loginButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <AppText style={styles.loginButtonText}>
              {t('auth.login', { defaultValue: 'Login' })}
            </AppText>
          )}
        </TouchableOpacity>

        {/* Back to Phone Login */}
        <TouchableOpacity onPress={handleBackToPhoneLogin} style={[styles.backButton, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color={theme.colors.primary} />
          <AppText style={[styles.backText, { color: theme.colors.primary }]}>
            {t('auth.backToPhoneLogin', { defaultValue: 'Back to Phone Login' })}
          </AppText>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  loginButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
  },
  warningBox: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    padding: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default LegacyEmailLoginScreen;
