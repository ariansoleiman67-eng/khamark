import React, { useState, forwardRef } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useTheme } from './ThemeProvider';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
  variant?: 'default' | 'outlined' | 'filled';
  size?: 'small' | 'medium' | 'large';
  required?: boolean;
  showPasswordToggle?: boolean;
}

const Input = forwardRef<TextInput, InputProps>(({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  labelStyle,
  errorStyle,
  variant = 'outlined',
  size = 'medium',
  required = false,
  showPasswordToggle = false,
  secureTextEntry,
  multiline,
  numberOfLines,
  ...props
}, ref) => {
  const { theme } = useTheme();
  const [isSecure, setIsSecure] = useState(!!secureTextEntry);
  const [isFocused, setIsFocused] = useState(false);
  const isPasswordField = showPasswordToggle && !!secureTextEntry;

  const isMultiline = !!multiline;

  const getSizeStyles = () => {
    const sizes = {
      small: {
        minHeight: 40,
        fontSize: 14,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 10,
      },
      medium: {
        minHeight: 48,
        fontSize: 16,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 12,
      },
      large: {
        minHeight: 56,
        fontSize: 18,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: 14,
      },
    } as const;
    return sizes[size];
  };

  const getVariantStyles = () => {
    const variants = {
      default: {
        borderBottomWidth: 1,
        borderBottomColor: error
          ? theme.colors.error
          : isFocused
            ? theme.colors.primary
            : theme.colors.border,
        backgroundColor: 'transparent',
      },
      outlined: {
        borderWidth: 1,
        borderColor: error
          ? theme.colors.error
          : isFocused
            ? theme.colors.primary
            : theme.colors.border,
        borderRadius: theme.borderRadius.md,
        backgroundColor: 'transparent',
      },
      filled: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: error
          ? theme.colors.error
          : isFocused
            ? theme.colors.primary
            : 'transparent',
      },
    } as const;
    return variants[variant];
  };

  const sizeStyles = getSizeStyles();
  const variantStyles = getVariantStyles();

  const containerStyles: ViewStyle = {
    marginBottom: theme.spacing.md,
    ...containerStyle,
  };

  const inputContainerStyles: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    ...variantStyles,
    ...(leftIcon && { paddingLeft: theme.spacing.sm }),
    ...(rightIcon && { paddingRight: theme.spacing.sm }),
  };

  const computedLineHeight = Math.round(sizeStyles.fontSize * 1.35);

  const textInputStyles: TextStyle = {
    flex: 1,
    minHeight: sizeStyles.minHeight,
    fontSize: sizeStyles.fontSize,
    lineHeight: computedLineHeight,

    color: theme.colors.text,
    paddingHorizontal: leftIcon || rightIcon ? theme.spacing.sm : sizeStyles.paddingHorizontal,
    paddingVertical: sizeStyles.paddingVertical,

    // ✅ Fix Arabic / bold clipping on Android
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),

    // Multiline alignment
    textAlignVertical: isMultiline ? 'top' : 'center',

    ...inputStyle,
  };

  const labelStyles: TextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    lineHeight: 18,
    ...labelStyle,
  };

  const errorStyles: TextStyle = {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    lineHeight: 16,
    ...errorStyle,
  };

  const handleFocus = (e: any) => {
    setIsFocused(true);
    props.onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    props.onBlur?.(e);
  };

  const togglePasswordVisibility = () => {
    setIsSecure(!isSecure);
  };

  const renderRightIcon = () => {
    if (isPasswordField) {
      return (
        <TouchableOpacity onPress={togglePasswordVisibility} style={styles.iconButton}>
          <Ionicons
            name={isSecure ? 'eye-off' : 'eye'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      );
    }
    return rightIcon;
  };

  return (
    <View style={containerStyles}>
      {label && (
        <Text allowFontScaling={false} style={labelStyles}>
          {label}
          {required && <Text allowFontScaling={false} style={{ color: theme.colors.error }}> *</Text>}
        </Text>
      )}

      <View style={inputContainerStyles}>
        {leftIcon && (
          <View style={styles.leftIcon}>
            {leftIcon}
          </View>
        )}

        <TextInput allowFontScaling={false}
          ref={ref}
          style={textInputStyles}
          placeholderTextColor={theme.colors.placeholder}
          secureTextEntry={isPasswordField ? isSecure : !!secureTextEntry}
          onFocus={handleFocus}
          onBlur={handleBlur}

          // ✅ Stop Samsung "field scroll / sticky"
          scrollEnabled={isMultiline} // only scroll when multiline

          multiline={isMultiline}
          numberOfLines={numberOfLines ?? (isMultiline ? 4 : 1)}

          // Better submit behavior
          blurOnSubmit={!isMultiline}
          returnKeyType={isMultiline ? 'default' : (props.returnKeyType ?? 'done')}

          {...props}
        />

        {renderRightIcon() && (
          <View style={styles.rightIcon}>
            {renderRightIcon()}
          </View>
        )}
      </View>

      {error && (
        <Text allowFontScaling={false} style={errorStyles}>
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  iconButton: {
    padding: 4,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
});

Input.displayName = 'Input';

export default Input;
