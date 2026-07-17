import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { AuthService } from '../../services/authService';

const BUTTON_TEXT_COLOR = '#FFFFFF';

const AdminChangePasswordScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(t('admin.common.error'), t('validation.required'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('admin.common.error'), t('admin.changePassword.mismatch'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('admin.common.error'), t('admin.changePassword.tooShort'));
      return;
    }

    setLoading(true);
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      Alert.alert(t('admin.common.success'), t('admin.changePassword.success'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      // AuthService.changePassword is Supabase-backed and throws
      // Error('Current password is incorrect') on a bad current password — never
      // a Firebase 'auth/wrong-password' code. Match the real message and always
      // surface a localized string so ar/ku admins don't get raw English errors.
      const msg = (error?.message || '').toLowerCase();
      if (
        msg.includes('wrong-password') ||
        msg.includes('invalid-credential') ||
        msg.includes('current password is incorrect')
      ) {
        Alert.alert(t('admin.common.error'), t('admin.changePassword.wrongPassword'));
      } else {
        Alert.alert(t('admin.common.error'), t('admin.changePassword.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordInput = (
    label: string,
    value: string,
    setValue: (text: string) => void,
    showPass: boolean,
    setShowPass: (show: boolean) => void,
    placeholder: string
  ) => (
    <View style={styles.inputContainer}>
      <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={[styles.passwordContainer, { 
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border 
      }]}>
        <TextInput allowFontScaling={false}
          style={[styles.input, { color: theme.colors.text }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry={!showPass}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowPass(!showPass)}
        >
          <Ionicons
            name={showPass ? 'eye-off-outline' : 'eye-outline'}
            size={24}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.changePassword.title')}</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            {renderPasswordInput(
              t('admin.changePassword.currentPassword'),
              currentPassword,
              setCurrentPassword,
              showCurrentPassword,
              setShowCurrentPassword,
              t('admin.changePassword.currentPassword')
            )}
            
            {renderPasswordInput(
              t('admin.changePassword.newPassword'),
              newPassword,
              setNewPassword,
              showNewPassword,
              setShowNewPassword,
              t('admin.changePassword.newPassword')
            )}

            {renderPasswordInput(
              t('admin.changePassword.confirmPassword'),
              confirmPassword,
              setConfirmPassword,
              showConfirmPassword,
              setShowConfirmPassword,
              t('admin.changePassword.confirmPassword')
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { 
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border
        }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text allowFontScaling={false} style={styles.saveButtonText}>{t('admin.changePassword.updatePassword')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 4,
  },
  card: {
    borderRadius: 12,
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  eyeIcon: {
    padding: 10,
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
  input: {
    flex: 1,
    fontSize: 16,
    padding: 12,
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
    marginBottom: 8,
  },
  passwordContainer: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
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
});

export default AdminChangePasswordScreen;
