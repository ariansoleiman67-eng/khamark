import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextStyle
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeProvider';

// ----------------------------------------------------------------------
// ANDROID FIX LOGIC
// ----------------------------------------------------------------------
function defaultLineHeight(fontSize: number) {
  return Math.ceil(fontSize * (Platform.OS === 'android' ? 1.55 : 1.30));
}

// ----------------------------------------------------------------------

type Props = TextInputProps & {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  showPasswordToggle?: boolean;
  minHeight?: number;
  containerStyle?: any;
  required?: boolean;
};

export default function AppTextInput({
  label,
  error,
  leftIcon,
  rightIcon,
  showPasswordToggle,
  secureTextEntry,
  style,
  allowFontScaling = false,
  scrollEnabled,
  multiline,
  minHeight,
  containerStyle,
  onFocus,
  onBlur,
  required,
  ...props
}: Props) {
  const { theme } = useTheme();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Calculate generic fix styles
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fs = flat?.fontSize ?? 16;
  const lh = flat?.lineHeight ?? defaultLineHeight(fs);

  // Determine actual secure state
  const isSecure = secureTextEntry && !isPasswordVisible;

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text allowFontScaling={false} style={[
          styles.label, 
          { color: theme.colors.textSecondary } // Usually secondary color for labels
        ]}>
          {label} {required && <Text allowFontScaling={false} style={{ color: theme.colors.error }}>*</Text>}
        </Text>
      )}

      <View style={[
        styles.inputWrapper,
        {
          backgroundColor: theme.colors.surface,
          borderColor: error 
            ? theme.colors.error 
            : (isFocused ? theme.colors.primary : theme.colors.border),
          borderWidth: 1,
          borderRadius: 12, // Standardizing radius
          minHeight: minHeight ?? (multiline ? 96 : 48), // Ensure touch target
        }
      ]}>
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            {leftIcon}
          </View>
        )}

        <TextInput
          {...props}
          secureTextEntry={isSecure}
          allowFontScaling={allowFontScaling}
          multiline={multiline}
          // KEY: lets ScrollView take the gesture instead of the input
          scrollEnabled={scrollEnabled ?? false}
          underlineColorAndroid="transparent"
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={theme.colors.textSecondary + '80'} // fade it a bit
          style={[
            styles.input,
            { color: theme.colors.text },
            Platform.OS === 'android'
              ? { includeFontPadding: true, paddingVertical: multiline ? 12 : 0 }
              : { paddingVertical: multiline ? 12 : 0 },
            { lineHeight: lh },
            style,
          ]}
        />

        {(showPasswordToggle || rightIcon) && (
          <View style={styles.rightIconContainer}>
            {rightIcon}
            {showPasswordToggle && (
              <TouchableOpacity
                onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                accessibilityState={{ selected: isPasswordVisible }}
              >
                <Ionicons 
                  name={isPasswordVisible ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color={theme.colors.textSecondary} 
                />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {error && (
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.error }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  input: {
    flex: 1,
    height: '100%',
    // Remove padding that might conflict with wrapper
    paddingHorizontal: 0, 
  },
  inputWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  leftIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rightIconContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    marginLeft: 8,
  },
});
