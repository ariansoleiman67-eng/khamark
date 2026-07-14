import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeProvider';
import Button from './Button';
import { SPACING } from '../constants/theme';
import { VALIDATION } from '../constants/config';

interface PhoneAuthModalProps {
  visible: boolean;
  onClose: () => void;
  onPhoneSubmit: (phoneNumber: string) => Promise<void>;
}

export const PhoneAuthModal: React.FC<PhoneAuthModalProps> = ({
  visible,
  onClose,
  onPhoneSubmit,
}) => {
  const { theme } = useTheme();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhoneNumber = (text: string) => {
    // Remove all non-digits
    const cleaned = text.replace(/\D/g, '');
    
    // Format as Iraqi phone number
    if (cleaned.startsWith('964')) {
      // Already has country code
      return '+' + cleaned;
    } else if (cleaned.startsWith('07')) {
      // Iraqi mobile number without country code
      return '+964' + cleaned.substring(1);
    } else if (cleaned.length <= 10) {
      // Assume it's a local number
      return '+964' + cleaned;
    }
    
    return '+' + cleaned;
  };

  const validatePhoneNumber = (phone: string): boolean => {
    const phoneRegex = /^\+964[0-9]{10}$/;
    return phoneRegex.test(phone);
  };

  const handleSubmit = async () => {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    if (!validatePhoneNumber(formattedPhone)) {
      setError('Please enter a valid Iraqi phone number (07XXXXXXXX)');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onPhoneSubmit(formattedPhone);
    } catch (error: any) {
      setError(error.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhoneNumber('');
    setError('');
    onClose();
  };

  // Debug logging
  // Production: console.log removed
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <KeyboardAvoidingView 
        style={styles.modalOverlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.colors.text }]}>
              Phone Login
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Content */}
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.modalBody}>
            <View style={styles.phoneIcon}>
              <Ionicons name="call" size={32} color={theme.colors.primary} />
            </View>

            <Text allowFontScaling={false} style={[styles.description, { color: theme.colors.textSecondary }]}>
              Enter your phone number and we'll send you a verification code to sign in.
            </Text>

            {/* Phone Input */}
            <View style={styles.inputContainer}>
              <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.text }]}>
                Phone Number
              </Text>
              
              <View style={[
                styles.phoneInputContainer,
                { 
                  backgroundColor: theme.colors.background,
                  borderColor: error ? theme.colors.error : (phoneNumber ? theme.colors.primary : theme.colors.border),
                  borderWidth: error ? 2 : 1,
                }
              ]}>
                <View style={styles.countryCode}>
                  <Text allowFontScaling={false} style={[styles.countryCodeText, { color: theme.colors.textSecondary }]}>
                    🇮🇶 +964
                  </Text>
                </View>
                
                <TextInput allowFontScaling={false}
                  style={[
                    styles.phoneInput, 
                    { 
                      color: theme.colors.text,
                      backgroundColor: 'transparent',
                    }
                  ]}
                  placeholder="770 123 4567"
                  placeholderTextColor={theme.colors.placeholder}
                  value={phoneNumber}
                  onChangeText={(text) => {
                    setPhoneNumber(text);
                    setError(''); // Clear error when user types
                  }}
                  keyboardType="phone-pad"
                  autoFocus
                  maxLength={15}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>

              {error ? (
                <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.error }]}>
                  {error}
                </Text>
              ) : null}
            </View>

            <Text allowFontScaling={false} style={[styles.note, { color: theme.colors.textSecondary }]}>
              Standard message and data rates may apply.
            </Text>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <Button
                title="Send Verification Code"
                onPress={handleSubmit}
                loading={loading}
                fullWidth
                style={styles.submitButton}
              />
              
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.cancelButton, { backgroundColor: theme.colors.border + '20' }]}
              >
                <Text allowFontScaling={false} style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    gap: SPACING.md,
  },
  cancelButton: {
    alignItems: 'center',
    borderRadius: 12,
    padding: SPACING.md,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  closeButton: {
    padding: SPACING.xs,
  },
  countryCode: {
    borderRightColor: 'rgba(0, 0, 0, 0.1)',
    borderRightWidth: 1,
    justifyContent: 'center',
    minWidth: 80,
    padding: SPACING.md,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    marginTop: SPACING.xs,
  },
  inputContainer: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  modalBody: {
    flexGrow: 1,
    padding: SPACING.lg,
  },
  modalContent: {
    borderRadius: 20,
    elevation: 5,
    maxHeight: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)', // Make it darker to be more visible
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  phoneIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 80,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    padding: SPACING.md,
    textAlignVertical: 'center',
  },
  phoneInputContainer: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 50,
    overflow: 'hidden',
  },
  scrollView: {
    maxHeight: '80%',
  },
  submitButton: {
    marginBottom: SPACING.md,
  },
});

export default PhoneAuthModal;
