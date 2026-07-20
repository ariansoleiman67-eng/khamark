import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeProvider';
import Button from './Button';
import { SPACING } from '../constants/theme';
interface VerificationCodeModalProps {
  visible: boolean;
  onClose: () => void;
  phoneNumber: string;
  confirmationResult?: any | null;
  onCodeSubmit: (code: string) => Promise<void>;
  onResendCode: () => Promise<void>;
}

export const VerificationCodeModal: React.FC<VerificationCodeModalProps> = ({
  visible,
  onClose,
  phoneNumber,
  confirmationResult,
  onCodeSubmit,
  onResendCode,
}) => {
  const { theme } = useTheme();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Verifying an OTP is a write: it consumes the code and counts against the
  // provider's attempt limits. `loading` cannot guard it — a state update only
  // lands on the next render, so two calls in the same frame both get through.
  // That is the normal case here, not an edge case: the auto-submit effect fires
  // the moment the sixth digit lands, which is the same moment the Verify button
  // stops being disabled.
  const submittingRef = useRef(false);

  // One owner for the countdown. Previously the open-effect and handleResend each
  // created their own interval and only the open-effect's was ever cleaned up, so a
  // resend left two intervals decrementing the same state (countdown ticking twice
  // per second) and closing the modal mid-countdown leaked one that went on calling
  // setCountdown after unmount.
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const startCountdown = () => {
    clearCountdown(); // never stack a second interval on top of a running one
    setCountdown(60);
    setCanResend(false);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearCountdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      setCode(['', '', '', '', '', '']);
      setError('');
      submittingRef.current = false;
      startCountdown();

      return () => clearCountdown();
    }
  }, [visible]);

  // Belt-and-braces: the effect above only cleans up while `visible` is true, so an
  // unmount that races the visibility flag would otherwise strand the interval.
  useEffect(() => () => clearCountdown(), []);

  useEffect(() => {
    // Auto-submit when all fields are filled
    if (code.every(digit => digit !== '')) {
      handleSubmit();
    }
  }, [code]);

  const handleCodeChange = (value: string, index: number) => {
    if (value.length > 1) {
      // Handle paste scenario
      const pastedCode = value.slice(0, 6).split('');
      const newCode = [...code];
      pastedCode.forEach((digit, i) => {
        if (i < 6) {
          newCode[i] = digit;
        }
      });
      setCode(newCode);
      
      // Focus the next empty input or the last one
      const nextIndex = Math.min(pastedCode.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Move to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    const verificationCode = code.join('');

    if (verificationCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    // Set synchronously, before the first await, so a second caller in the same
    // frame is turned away.
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setLoading(true);
      setError('');
      await onCodeSubmit(verificationCode);
    } catch (error: any) {
      setError(error.message || 'Invalid verification code');
      // Clear the code for retry
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleResend = async () => {
    try {
      setResendLoading(true);
      await onResendCode();

      // Restarts the single shared interval rather than adding another one.
      startCountdown();

      Alert.alert('Success', 'Verification code sent successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend code');
    } finally {
      setResendLoading(false);
    }
  };

  const handleClose = () => {
    // Every dismissal path (close button, hardware back / onRequestClose) is gated
    // on the same ref: tearing the modal down mid-verification loses the result of a
    // code that has already been consumed.
    if (submittingRef.current) return;
    clearCountdown();
    setCode(['', '', '', '', '', '']);
    setError('');
    onClose();
  };

  const formatPhoneNumber = (phone: string) => {
    if (phone.startsWith('+964')) {
      const number = phone.replace('+964', '');
      return `+964 ${number.slice(0, 2)} ${number.slice(2, 5)} ${number.slice(5)}`;
    }
    return phone;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        style={styles.modalOverlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 80}
      >
        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityState={{ disabled: loading }}
            >
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.colors.text }]}>
              Verify Phone Number
            </Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Content */}
          <View style={styles.modalBody}>
            {/* Icon */}
            <View style={styles.phoneIcon}>
              <Ionicons name="chatbox-ellipses" size={32} color="#3B82F6" />
            </View>

            {/* Description */}
            <Text allowFontScaling={false} style={[styles.description, { color: theme.colors.text }]}>
              We sent a 6-digit verification code to
            </Text>
            
            <Text allowFontScaling={false} style={[styles.phoneNumber, { color: theme.colors.text }]}>
              {formatPhoneNumber(phoneNumber)}
            </Text>

            {/* Code Input Container */}
            <View style={styles.codeContainer}>
              <TextInput allowFontScaling={false}
                key={0}
                ref={(ref) => { inputRefs.current[0] = ref; }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: error ? theme.colors.error : (code[0] ? theme.colors.primary : theme.colors.border),
                    color: theme.colors.text,
                  },
                ]}
                value={code[0]}
                onChangeText={(value) => handleCodeChange(value, 0)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, 0)}
                keyboardType="number-pad"
                // First box accepts the full code so iOS/Android SMS autofill can drop all 6
                // digits in at once; handleCodeChange then distributes them across the boxes.
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
              />
              <TextInput allowFontScaling={false}
                key={1}
                ref={(ref) => { inputRefs.current[1] = ref; }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: error ? theme.colors.error : (code[1] ? theme.colors.primary : theme.colors.border),
                    color: theme.colors.text,
                  },
                ]}
                value={code[1]}
                onChangeText={(value) => handleCodeChange(value, 1)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, 1)}
                keyboardType="number-pad"
                maxLength={1}
              />
              <TextInput allowFontScaling={false}
                key={2}
                ref={(ref) => { inputRefs.current[2] = ref; }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: error ? theme.colors.error : (code[2] ? theme.colors.primary : theme.colors.border),
                    color: theme.colors.text,
                  },
                ]}
                value={code[2]}
                onChangeText={(value) => handleCodeChange(value, 2)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, 2)}
                keyboardType="number-pad"
                maxLength={1}
              />
              <TextInput allowFontScaling={false}
                key={3}
                ref={(ref) => { inputRefs.current[3] = ref; }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: error ? theme.colors.error : (code[3] ? theme.colors.primary : theme.colors.border),
                    color: theme.colors.text,
                  },
                ]}
                value={code[3]}
                onChangeText={(value) => handleCodeChange(value, 3)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, 3)}
                keyboardType="number-pad"
                maxLength={1}
              />
              <TextInput allowFontScaling={false}
                key={4}
                ref={(ref) => { inputRefs.current[4] = ref; }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: error ? theme.colors.error : (code[4] ? theme.colors.primary : theme.colors.border),
                    color: theme.colors.text,
                  },
                ]}
                value={code[4]}
                onChangeText={(value) => handleCodeChange(value, 4)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, 4)}
                keyboardType="number-pad"
                maxLength={1}
              />
              <TextInput allowFontScaling={false}
                key={5}
                ref={(ref) => { inputRefs.current[5] = ref; }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: error ? theme.colors.error : (code[5] ? theme.colors.primary : theme.colors.border),
                    color: theme.colors.text,
                  },
                ]}
                value={code[5]}
                onChangeText={(value) => handleCodeChange(value, 5)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, 5)}
                keyboardType="number-pad"
                maxLength={1}
              />
            </View>

            {error ? (
              <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.error }]}>
                {error}
              </Text>
            ) : null}

            {/* Resend Code */}
            <View style={styles.resendContainer}>
              <Text allowFontScaling={false} style={[styles.resendText, { color: theme.colors.textSecondary }]}>
                Didn't receive the code?{' '}
              </Text>
              {canResend ? (
                <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
                  <Text allowFontScaling={false} style={[styles.resendLink, { color: theme.colors.primary }]}>
                    {resendLoading ? 'Sending...' : 'Resend'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text allowFontScaling={false} style={[styles.countdown, { color: theme.colors.textSecondary }]}>
                  Resend in {countdown}s
                </Text>
              )}
            </View>

            {/* Submit Button */}
            <Button
              title="Verify Code"
              onPress={handleSubmit}
              loading={loading}
              fullWidth
              disabled={code.some(digit => digit === '')}
              style={styles.submitButton}
            />

            {/* Footer Note */}
            <Text allowFontScaling={false} style={{
              fontSize: 12,
              textAlign: 'center',
              marginTop: 16,
              opacity: 0.6,
              color: theme.colors.textSecondary,
            }}>
              Enter the 6-digit code sent to your phone
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  codeContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingHorizontal: 8,
    width: '100%',
  },
  codeInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    borderWidth: 2,
    elevation: 2,
    fontSize: 24,
    fontWeight: '700',
    height: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    textAlign: 'center',
    width: 50,
  },
  countdown: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
    opacity: 0.8,
    textAlign: 'center',
  },
  errorText: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 24,
    padding: 12,
    textAlign: 'center',
  },
  modalBody: {
    padding: 24,
    paddingBottom: 80,
    paddingTop: 0,
  },
  modalContent: {
    borderRadius: 20,
    elevation: 10,
    maxWidth: 400,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  phoneIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: 24,
    width: 80,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 32,
    textAlign: 'center',
  },
  resendContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 32,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  resendText: {
    fontSize: 14,
    opacity: 0.8,
  },
  submitButton: {
    marginBottom: 16,
  },
});

export default VerificationCodeModal;
