/**
 * FormScreenWrapper - Reusable wrapper for all form screens
 * Provides consistent Android keyboard + touch interaction handling:
 * - KeyboardAvoidingView with behavior="padding" on iOS, undefined on Android
 * - TouchableWithoutFeedback+Keyboard.dismiss for dismissing keyboard on tap outside
 * - Works with scrollable content
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface FormScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

const FormScreenWrapper: React.FC<FormScreenWrapperProps> = ({ children, style }) => {
  return (
    <KeyboardAvoidingView
      style={[styles.container, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        {children}
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default FormScreenWrapper;
