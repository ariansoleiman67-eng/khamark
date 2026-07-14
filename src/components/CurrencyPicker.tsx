import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from './ThemeProvider';

import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

const { width: screenWidth } = Dimensions.get('window');

interface Currency {
  code: 'USD' | 'IQD';
  name: string;
  symbol: string;
}

interface CurrencyPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectCurrency: (currencyCode: 'USD' | 'IQD') => void;
  currentCurrency: 'USD' | 'IQD';
}

const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'IQD' },
];

const CurrencyPicker: React.FC<CurrencyPickerProps> = ({
  visible,
  onClose,
  onSelectCurrency,
  currentCurrency,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handleCurrencySelect = (currencyCode: 'USD' | 'IQD') => {
    onSelectCurrency(currencyCode);
    onClose();
  };

  const renderCurrencyOption = (currency: Currency, index: number) => {
    const isSelected = currentCurrency === currency.code;
    const isLast = index === CURRENCIES.length - 1;

    return (
      <Animated.View
        key={currency.code}
        entering={SlideInDown.delay(index * 100).duration(400)}
      >
        <TouchableOpacity
          style={[
            styles.currencyOption,
            {
              backgroundColor: isSelected 
                ? theme.colors.primary + '10' 
                : 'transparent',
              borderBottomWidth: isLast ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }
          ]}
          onPress={() => handleCurrencySelect(currency.code)}
          activeOpacity={0.7}
        >
          <View style={styles.currencyInfo}>
            <Text
              style={[
                styles.nativeName,
                {
                  color: isSelected ? theme.colors.primary : theme.colors.text,
                  fontWeight: isSelected ? '600' : '400',
                }
              ]}
              allowFontScaling={false}
            >
              {currency.code} ({currency.symbol})
            </Text>
            <Text allowFontScaling={false}
              style={[
                styles.englishName,
                {
                  color: isSelected 
                    ? theme.colors.primary + 'CC' 
                    : theme.colors.textSecondary,
                }
              ]}
            >
              {// use translation if available, else fallback to name
                t(`profile.currency.${currency.code}`, { defaultValue: currency.name })
              }
            </Text>
          </View>

          {isSelected && (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={theme.colors.primary}
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={20} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.androidOverlay]} />
        )}

        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />

        <Animated.View
          style={[
            styles.modal,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            }
          ]}
          entering={SlideInDown.springify()}
          exiting={SlideOutDown.springify()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>
              {t('profile.currency.select', { defaultValue: 'Select Currency' })}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Currency Options */}
          <View style={styles.content}>
            {CURRENCIES.map((currency, index) => 
              renderCurrencyOption(currency, index)
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  androidOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    maxHeight: 300,
  },
  currencyInfo: {
    flex: 1,
    marginRight: 12,
  },
  currencyOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    padding: 16,
  },
  englishName: {
    fontSize: 14,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  modal: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    maxWidth: 400,
    overflow: 'hidden',
    width: screenWidth * 0.9,
  },
  nativeName: {
    fontSize: 16,
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
    marginBottom: 2,
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
});

export default CurrencyPicker;
