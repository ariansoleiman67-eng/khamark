import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { safeCallFunction } from '../services/safeCallFunction';
import { useTheme } from '../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { SPACING, SHADOW_STYLES } from '../constants/theme';

interface PasswordPromptModalProps {
  visible: boolean;
  action: 'assign_vip_role' | 'unlock_wholesale_settings';
  targetUserId?: string;
  newRole?: 'customer' | 'vip';
  onClose: () => void;
  onSuccess: (resultMessage: string, verifiedPassword: string) => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  visible,
  action,
  targetUserId,
  newRole,
  onClose,
  onSuccess,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Guard against double-tap (GTMSessionFetcher crash when called twice)
  const isVerifyingRef = React.useRef(false);

  const handleVerify = async () => {
    if (!password.trim()) {
      setErrorText(t('auth.errors.passwordRequired') || 'Password required');
      return;
    }

    // Prevent double-tap — native Firebase will crash if called while already running
    if (isVerifyingRef.current || loading) return;
    isVerifyingRef.current = true;

    setLoading(true);
    setErrorText('');

    try {
      const response = await safeCallFunction('verifyAdminActionPassword', {
        password,
        action,
        targetUserId: targetUserId || '',
        newRole: newRole || '',
      });

      // CRITICAL iOS FIX: Firebase native SDK on iOS crashes in Release mode when
      // response contains null values (NSNull cannot be converted to NSString).
      // We must extract data defensively and convert nulls to safe defaults.
      const rawData = response.data;
      const data = (typeof rawData === 'object' && rawData !== null) ? rawData : {} as any;
      
      const success = data.success === true;
      const actionResult = (typeof data.actionResult === 'string') ? data.actionResult : 'Success';
      const message = (typeof data.message === 'string') ? data.message : 'Verification failed';

      if (success) {
        onSuccess(actionResult, password);
        setPassword(''); // Reset for next time
      } else {
        setErrorText(message);
      }
    } catch (error: any) {
      console.error('Password verification error:', error);
      const errMsg = (typeof error?.message === 'string') ? error.message : 'Verification failed';
      setErrorText(errMsg);
    } finally {
      setLoading(false);
      isVerifyingRef.current = false;
    }
  };

  const currentStyles = styles(theme);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={currentStyles.overlay}
      >
        <View style={currentStyles.modalContainer}>
          <View style={currentStyles.header}>
            <Text allowFontScaling={false} style={currentStyles.title}>
              {action === 'assign_vip_role' 
                ? t('admin.common.assignVipRole', { defaultValue: 'Assign VIP Role' }) 
                : t('admin.common.unlockSettings', { defaultValue: 'Unlock Settings' })}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text allowFontScaling={false} style={currentStyles.description}>
            {t('admin.common.masterPasswordRequired', { defaultValue: 'This requires the master admin password.' })}
          </Text>

          <View style={currentStyles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} style={currentStyles.inputIcon} />
            <TextInput allowFontScaling={false}
              style={currentStyles.input}
              placeholder={t('admin.common.enterAdminPassword', { defaultValue: 'Enter admin password' })}
              placeholderTextColor={theme.colors.placeholder}
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setErrorText('');
              }}
              autoFocus
              editable={!loading}
            />
          </View>

          {errorText ? (
            <Text allowFontScaling={false} style={currentStyles.errorText}>{errorText}</Text>
          ) : null}

          <TouchableOpacity 
            style={[currentStyles.verifyButton, loading && currentStyles.verifyButtonDisabled]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Text allowFontScaling={false} style={currentStyles.verifyButtonText}>
                {t('admin.common.verifyAndProceed', { defaultValue: 'Verify & Proceed' })}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 400,
    ...SHADOW_STYLES.medium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  description: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: SPACING.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: theme.colors.background,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: theme.colors.text,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: SPACING.sm,
  },
  verifyButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  verifyButtonDisabled: {
    opacity: 0.7,
  },
  verifyButtonText: {
    color: theme.colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
