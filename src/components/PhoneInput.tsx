import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  FadeIn,
  SlideInUp,
} from 'react-native-reanimated';
import { useTheme } from './ThemeProvider';
import { 
  validatePhone, 
  getAllCountries,
  getCountriesByRegion,
  getPlaceholderForCountry,
  CountryCode,
  CountryInfo,
  DEFAULT_COUNTRY 
} from '../utils/phoneUtils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  success: '#22C55E',
  error: '#EF4444',
  overlay: 'rgba(0,0,0,0.5)',
};

interface PhoneInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onValidChange?: (isValid: boolean) => void;
  onCountryChange?: (country: CountryInfo) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  error?: string;
  label?: string;
  placeholder?: string;
  defaultCountry?: CountryCode;
  style?: object;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChangeText,
  onValidChange,
  onCountryChange,
  onFocus,
  onBlur,
  error,
  label,
  placeholder,
  defaultCountry = DEFAULT_COUNTRY,
  style,
}) => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  
  // Get all countries and find default
  const allCountries = useMemo(() => getAllCountries(), []);
  const countriesByRegion = useMemo(() => getCountriesByRegion(), []);
  
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(() => {
    const found = allCountries.find(c => c.code === defaultCountry);
    return found || allCountries[0];
  });
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'regions'>('list');

  // React to changes in defaultCountry prop (e.g. when loaded async from onboarding)
  useEffect(() => {
    const found = allCountries.find(c => c.code === defaultCountry);
    if (found && found.code !== selectedCountry.code) {
      setSelectedCountry(found);
      onCountryChange?.(found);
    }
  }, [defaultCountry]);

  // Dynamic placeholder based on selected country
  const dynamicPlaceholder = placeholder || getPlaceholderForCountry(selectedCountry.code);

  // Animation values
  const buttonScale = useSharedValue(1);

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!searchQuery) return allCountries;
    const query = searchQuery.toLowerCase();
    return allCountries.filter(country =>
      country.name.toLowerCase().includes(query) ||
      country.dialCode.includes(query) ||
      country.code.toLowerCase().includes(query)
    );
  }, [searchQuery, allCountries]);

  // Validate phone number on change
  useEffect(() => {
    if (value) {
      const valid = validatePhone(value, selectedCountry.code);
      setIsValid(valid);
      onValidChange?.(valid);
    } else {
      setIsValid(false);
      onValidChange?.(false);
    }
  }, [value, selectedCountry, onValidChange]);

  const handleTextChange = (text: string) => {
    // Remove non-digit characters
    const cleaned = text.replace(/[^\d]/g, '');
    onChangeText(cleaned);
  };

  const handleCountrySelect = (country: CountryInfo) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setSearchQuery('');
    onCountryChange?.(country);
  };

  const openPicker = () => {
    buttonScale.value = withSpring(0.95, {}, () => {
      buttonScale.value = withSpring(1);
    });
    setShowCountryPicker(true);
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const renderCountryItem = ({ item }: { item: CountryInfo }) => (
    <TouchableOpacity
      style={styles.countryItem}
      onPress={() => handleCountrySelect(item)}
      activeOpacity={0.7}
    >
      <Text allowFontScaling={false} style={styles.countryFlag}>{item.flag}</Text>
      <View style={styles.countryInfo}>
        <Text allowFontScaling={false} style={styles.countryName} numberOfLines={1} adjustsFontSizeToFit>
          {item.name}
        </Text>
        <Text allowFontScaling={false} style={styles.countryCode} adjustsFontSizeToFit numberOfLines={1}>
          {item.dialCode}
        </Text>
      </View>
      {selectedCountry.code === item.code && (
        <Ionicons name="checkmark-circle" size={20} color={COLORS.orange} />
      )}
    </TouchableOpacity>
  );

  const renderRegionSection = ({ item }: { item: [string, CountryInfo[]] }) => {
    const [region, countries] = item;
    return (
      <View style={styles.regionSection}>
        <Text allowFontScaling={false} style={styles.regionTitle} adjustsFontSizeToFit numberOfLines={1}>{region}</Text>
        {countries.map(country => (
          <TouchableOpacity
            key={country.code}
            style={styles.countryItem}
            onPress={() => handleCountrySelect(country)}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={styles.countryFlag}>{country.flag}</Text>
            <View style={styles.countryInfo}>
              <Text allowFontScaling={false} style={styles.countryName} numberOfLines={1} adjustsFontSizeToFit>
                {country.name}
              </Text>
              <Text allowFontScaling={false} style={styles.countryCode} adjustsFontSizeToFit numberOfLines={1}>
                {country.dialCode}
              </Text>
            </View>
            {selectedCountry.code === country.code && (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.orange} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const regionData = useMemo(() => 
    Object.entries(countriesByRegion).filter(([, countries]) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return countries.some(c => 
        c.name.toLowerCase().includes(query) ||
        c.dialCode.includes(query)
      );
    }),
    [countriesByRegion, searchQuery]
  );

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.textSecondary }]} adjustsFontSizeToFit numberOfLines={1}>
          {label}
        </Text>
      )}
      
      <View style={[{
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: error ? COLORS.error : theme.colors.border,
        flexDirection: 'row',
        height: 58,
        paddingHorizontal: 8,
      }, style]}>
        {/* Country Selector Button */}
        <Animated.View style={buttonAnimatedStyle}>
          <TouchableOpacity
            style={styles.countryButton}
            onPress={openPicker}
            activeOpacity={0.8}
          >
            <Text allowFontScaling={false} style={styles.flagEmoji}>{selectedCountry.flag}</Text>
            <Text allowFontScaling={false} style={[styles.dialCode, { color: theme.colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
              {selectedCountry.dialCode}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

        {/* Phone Number Input */}
        <TextInput allowFontScaling={false}
          style={[styles.input, { color: theme.colors.text }]}
          placeholder={dynamicPlaceholder}
          placeholderTextColor={theme.colors.textSecondary}
          value={value}
          onChangeText={handleTextChange}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        {/* Validation Indicator */}
        {value.length > 0 && (
          <Animated.View 
            entering={FadeIn.duration(200)}
            style={styles.validationIcon}
          >
            <Ionicons
              name={isValid ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={isValid ? COLORS.success : COLORS.error}
            />
          </Animated.View>
        )}
      </View>

      {error && (
        <Text allowFontScaling={false} style={styles.errorText} adjustsFontSizeToFit numberOfLines={1}>
          {error}
        </Text>
      )}

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            entering={SlideInUp.duration(350)}
            style={[
              styles.modalContainer,
              { paddingBottom: insets.bottom + 20 },
            ]}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <View style={styles.headerRow}>
                <Text allowFontScaling={false} style={styles.modalTitle} adjustsFontSizeToFit numberOfLines={1}>
                  Select Country
                </Text>
                <TouchableOpacity 
                  onPress={() => setShowCountryPicker(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={COLORS.textGray} />
              <TextInput allowFontScaling={false}
                style={styles.searchInput}
                placeholder="Search country or code..."
                placeholderTextColor={COLORS.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textGray} />
                </TouchableOpacity>
              )}
            </View>

            {/* View Mode Toggle */}
            <View style={styles.viewModeContainer}>
              <TouchableOpacity
                style={[
                  styles.viewModeButton,
                  viewMode === 'list' && styles.viewModeButtonActive,
                ]}
                onPress={() => setViewMode('list')}
              >
                <Ionicons 
                  name="list" 
                  size={16} 
                  color={viewMode === 'list' ? COLORS.white : COLORS.textGray} 
                />
                <Text allowFontScaling={false} style={[
                  styles.viewModeText,
                  viewMode === 'list' && styles.viewModeTextActive,
                ]} adjustsFontSizeToFit numberOfLines={1}>
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.viewModeButton,
                  viewMode === 'regions' && styles.viewModeButtonActive,
                ]}
                onPress={() => setViewMode('regions')}
              >
                <Ionicons 
                  name="globe-outline" 
                  size={16} 
                  color={viewMode === 'regions' ? COLORS.white : COLORS.textGray} 
                />
                <Text allowFontScaling={false} style={[
                  styles.viewModeText,
                  viewMode === 'regions' && styles.viewModeTextActive,
                ]} adjustsFontSizeToFit numberOfLines={1}>
                  By Region
                </Text>
              </TouchableOpacity>
            </View>

            {/* Country Count */}
            <Text allowFontScaling={false} style={styles.countryCount} adjustsFontSizeToFit numberOfLines={1}>
              {filteredCountries.length} countries
            </Text>

            {/* Country List */}
            {viewMode === 'list' ? (
              <FlatList
                data={filteredCountries}
                renderItem={renderCountryItem}
                keyExtractor={(item) => item.code}
                style={styles.countryList}
                showsVerticalScrollIndicator={false}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={10}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <FlatList
                data={regionData}
                renderItem={renderRegionSection}
                keyExtractor={(item) => item[0]}
                style={styles.countryList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  container: {
    width: '100%',
  },
  countryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countryCode: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: '600',
  },
  countryCount: {
    color: COLORS.textGray,
    fontSize: 12,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  countryFlag: {
    fontSize: 28,
    marginRight: 12,
  },
  countryInfo: {
    flex: 1,
  },
  countryItem: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 8,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  countryList: {
    flex: 1,
  },
  countryName: {
    color: COLORS.textDark,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  dialCode: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    height: 30,
    width: 1,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
  },
  flagEmoji: {
    fontSize: 22,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  input: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 16,
    height: 62,
    includeFontPadding: false,
    paddingHorizontal: 12,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  inputContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 0,
    flexDirection: 'row',
    height: 58,
    paddingHorizontal: 8,
  },
  inputError: {
    borderColor: COLORS.error,
    borderWidth: 1,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  modalContainer: {
    backgroundColor: COLORS.inputBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SCREEN_HEIGHT * 0.85,
    paddingTop: 12,
  },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    height: 5,
    width: 40,
  },
  modalHeader: {
    marginBottom: 16,
  },
  modalOverlay: {
    backgroundColor: COLORS.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalTitle: {
    color: COLORS.textDark,
    fontSize: 20,
    fontWeight: 'bold',
  },
  regionSection: {
    marginBottom: 16,
  },
  regionTitle: {
    color: COLORS.textGray,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 20,
    textTransform: 'uppercase',
  },
  searchContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 12,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    color: COLORS.textDark,
    flex: 1,
    fontSize: 15,
    height: 40,
    includeFontPadding: false,
    marginLeft: 10,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  validationIcon: {
    marginRight: 12,
  },
  viewModeButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  viewModeButtonActive: {
    backgroundColor: COLORS.orange,
  },
  viewModeContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 12,
    marginHorizontal: 20,
    padding: 4,
  },
  viewModeText: {
    color: COLORS.textGray,
    fontSize: 13,
    fontWeight: '500',
  },
  viewModeTextActive: {
    color: COLORS.white,
  },
});

export default PhoneInput;
