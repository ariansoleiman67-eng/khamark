import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  TextInput,
  Dimensions,
  I18nManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../components/ThemeProvider';
import ColorPicker from '../components/ColorPicker';
import { THEME_PRESETS } from '../constants/themePresets';
import { CustomTheme, ThemePreset, ColorPickerConfig } from '../types/theme';

const { width: screenWidth } = Dimensions.get('window');

interface ColorCustomizationItem {
  key: keyof CustomTheme['colors'];
  title: string;
  description: string;
  icon: string;
}


export const ThemeCustomizationScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  // Directional icons must follow the reading direction. Global auto-RTL is
  // disabled in App.tsx, so I18nManager.isRTL alone is always false here — the
  // language check is what actually does the work.
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { theme, setCustomTheme, currentCustomTheme } = useTheme();
  
  const COLOR_CUSTOMIZATION_ITEMS: ColorCustomizationItem[] = [
    {
      key: 'primary',
      title: t('theme.colors.primary'),
      description: t('theme.colors.primaryDescription'),
      icon: 'color-palette-outline',
    },
    {
      key: 'secondary',
      title: t('theme.colors.secondary'),
      description: t('theme.colors.secondaryDescription'),
      icon: 'color-filter-outline',
    },
    {
      key: 'background',
      title: t('theme.colors.background'),
      description: t('theme.colors.backgroundDescription'),
      icon: 'layers-outline',
    },
    {
      key: 'surface',
      title: t('theme.colors.surface'),
      description: t('theme.colors.surfaceDescription'),
      icon: 'square-outline',
    },
    {
      key: 'text',
      title: t('theme.colors.text'),
      description: t('theme.colors.textDescription'),
      icon: 'text-outline',
    },
    {
      key: 'accent',
      title: t('theme.colors.accent'),
      description: t('theme.colors.accentDescription'),
      icon: 'star-outline',
    },
  ];
  
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customTheme, setCustomThemeState] = useState<CustomTheme | null>(currentCustomTheme);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerConfig, setColorPickerConfig] = useState<ColorPickerConfig | null>(null);
  const [currentColorKey, setCurrentColorKey] = useState<keyof CustomTheme['colors'] | null>(null);
  const [themeName, setThemeName] = useState('');
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);

  // Animation values
  const presetScale = useSharedValue(1);
  const customScale = useSharedValue(1);

  useEffect(() => {
    // Initialize with current theme or default
    if (currentCustomTheme) {
      setCustomThemeState(currentCustomTheme);
      setThemeName(currentCustomTheme.name);
      if (!currentCustomTheme.isCustom) {
        setSelectedPreset(currentCustomTheme.id);
      }
    } else {
      setSelectedPreset(THEME_PRESETS[0].id);
      setCustomThemeState(THEME_PRESETS[0].theme);
    }
  }, [currentCustomTheme]);

  const handlePresetSelect = (preset: ThemePreset) => {
    setSelectedPreset(preset.id);
    setCustomThemeState(preset.theme);
    setIsCreatingCustom(false);
    setCustomTheme(preset.theme);
    
    // Animate selection
    presetScale.value = withSpring(0.95, { duration: 100 }, () => {
      presetScale.value = withSpring(1);
    });
  };

  const handleColorChange = (colorKey: keyof CustomTheme['colors'], newColor: string) => {
    if (!customTheme) return;

    const updatedTheme: CustomTheme = {
      ...customTheme,
      colors: {
        ...customTheme.colors,
        [colorKey]: newColor,
      },
      isCustom: true,
      name: themeName || 'Custom Theme',
      updatedAt: new Date().toISOString(),
    };

    setCustomThemeState(updatedTheme);
    setCustomTheme(updatedTheme);
    setSelectedPreset(null);
    setIsCreatingCustom(true);
  };

  const openColorPicker = (colorKey: keyof CustomTheme['colors']) => {
    if (!customTheme) return;

    const item = COLOR_CUSTOMIZATION_ITEMS.find(item => item.key === colorKey);
    if (!item) return;

    const config: ColorPickerConfig = {
      title: t('theme.selectColor', { colorName: item.title }),
      description: item.description,
      defaultColor: customTheme.colors[colorKey],
      presets: THEME_PRESETS.map(preset => preset.theme.colors[colorKey]),
    };

    setColorPickerConfig(config);
    setCurrentColorKey(colorKey);
    setShowColorPicker(true);
  };

  const handleColorPickerClose = () => {
    setShowColorPicker(false);
    setColorPickerConfig(null);
    setCurrentColorKey(null);
  };

  const handleColorPickerSelect = (color: string) => {
    if (currentColorKey) {
      handleColorChange(currentColorKey, color);
    }
  };

  const createCustomTheme = () => {
    if (!themeName.trim()) {
      Alert.alert(t('theme.themeNameRequired'), t('theme.themeNameRequiredMessage'));
      return;
    }

    if (!customTheme) return;

    const newCustomTheme: CustomTheme = {
      ...customTheme,
      id: `custom-${Date.now()}`,
      name: themeName,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCustomThemeState(newCustomTheme);
    setCustomTheme(newCustomTheme);
    setIsCreatingCustom(false);
    
    Alert.alert(
      t('theme.themeCreated'),
      t('theme.themeCreatedMessage', { themeName }),
      [{ text: t('common.ok') }]
    );
  };

  const resetToDefault = () => {
    Alert.alert(
      t('theme.resetTitle'),
      t('theme.resetMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('theme.resetConfirm'),
          style: 'destructive',
          onPress: () => {
            const defaultPreset = THEME_PRESETS[0];
            setSelectedPreset(defaultPreset.id);
            setCustomThemeState(defaultPreset.theme);
            setCustomTheme(defaultPreset.theme);
            setIsCreatingCustom(false);
            setThemeName('');
          },
        },
      ]
    );
  };

  const renderPresetCard = (preset: ThemePreset) => {
    const isSelected = selectedPreset === preset.id;
    
    return (
      <TouchableOpacity
        key={preset.id}
        style={[
          styles.presetCard,
          {
            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: theme.colors.surface,
          },
        ]}
        onPress={() => handlePresetSelect(preset)}
      >
        <View style={styles.presetPreview}>
          <View style={[styles.previewColor, { backgroundColor: preset.preview.primary }]} />
          <View style={[styles.previewColor, { backgroundColor: preset.preview.secondary }]} />
          <View style={[styles.previewColor, { backgroundColor: preset.preview.background }]} />
          <View style={[styles.previewColor, { backgroundColor: preset.preview.surface }]} />
        </View>
        <Text allowFontScaling={false} style={[styles.presetName, { color: theme.colors.text }]}>
          {preset.name}
        </Text>
        <Text allowFontScaling={false} style={[styles.presetDescription, { color: theme.colors.textSecondary }]}>
          {preset.description}
        </Text>
        {isSelected && (
          <View style={[styles.selectedIndicator, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderColorCustomization = () => {
    if (!customTheme) return null;

    return (
      <Animated.View entering={FadeInUp.delay(200)} style={styles.customizationSection}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
          {t('theme.customizeColors')}
        </Text>
        <Text allowFontScaling={false} style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
          {t('theme.customizeColorsDescription')}
        </Text>

        <View style={styles.colorGrid}>
          {COLOR_CUSTOMIZATION_ITEMS.map((item, index) => (
            <Animated.View
              key={item.key}
              entering={FadeInDown.delay(100 * index)}
            >
              <TouchableOpacity
                style={[styles.colorItem, { backgroundColor: theme.colors.surface }]}
                onPress={() => openColorPicker(item.key)}
              >
                <View style={styles.colorItemHeader}>
                  <View style={styles.colorIcon}>
                    <Ionicons name={item.icon as any} size={20} color={theme.colors.text} />
                  </View>
                  <View
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: customTheme.colors[item.key] },
                    ]}
                  />
                </View>
                <Text allowFontScaling={false} style={[styles.colorItemTitle, { color: theme.colors.text }]}>
                  {item.title}
                </Text>
                <Text allowFontScaling={false} style={[styles.colorItemDescription, { color: theme.colors.textSecondary }]}>
                  {item.description}
                </Text>
                <Text allowFontScaling={false} style={[styles.colorValue, { color: theme.colors.textSecondary }]}>
                  {customTheme.colors[item.key]}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {isCreatingCustom && (
          <Animated.View entering={FadeInUp.delay(300)} style={styles.customThemeCreation}>
            <Text allowFontScaling={false} style={[styles.customThemeTitle, { color: theme.colors.text }]}>
              {t('theme.createCustomTheme')}
            </Text>
            <TextInput allowFontScaling={false}
              style={[
                styles.themeNameInput,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                },
              ]}
              placeholder={t('theme.enterThemeName')}
              placeholderTextColor={theme.colors.placeholder}
              value={themeName}
              onChangeText={setThemeName}
            />
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: theme.colors.primary }]}
              onPress={createCustomTheme}
            >
              <Text allowFontScaling={false} style={styles.createButtonText}>{t('theme.createTheme')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('theme.title')}
        </Text>
        <TouchableOpacity onPress={resetToDefault} style={styles.resetButton}>
          <Text allowFontScaling={false} style={[styles.resetText, { color: theme.colors.primary }]}>
            {t('theme.reset')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Without keyboardShouldPersistTaps the first tap on a colour swatch or Save
          while the hex input is focused only dismisses the keyboard. */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Theme Presets */}
        <Animated.View entering={FadeInUp} style={styles.presetsSection}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('theme.chooseTheme')}
          </Text>
          <Text allowFontScaling={false} style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
            {t('theme.chooseThemeDescription')}
          </Text>
          
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetsContainer}
          >
            {THEME_PRESETS.map(renderPresetCard)}
          </ScrollView>
        </Animated.View>

        {/* Color Customization */}
        {renderColorCustomization()}

        {/* Preview Section */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.previewSection}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('theme.preview')}
          </Text>
          <View style={[styles.previewCard, { backgroundColor: theme.colors.surface }]}>
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryDark || theme.colors.primary]}
              style={styles.previewHeader}
            >
              <Text allowFontScaling={false} style={styles.previewHeaderText}>{t('theme.sampleHeader')}</Text>
            </LinearGradient>
            <View style={styles.previewContent}>
              <Text allowFontScaling={false} style={[styles.previewTitle, { color: theme.colors.text }]}>
                {t('theme.sampleContent')}
              </Text>
              <Text allowFontScaling={false} style={[styles.previewText, { color: theme.colors.textSecondary }]}>
                {t('theme.sampleText')}
              </Text>
              <TouchableOpacity
                style={[styles.previewButton, { backgroundColor: theme.colors.accent }]}
              >
                <Text allowFontScaling={false} style={styles.previewButtonText}>{t('theme.sampleButton')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Color Picker Modal */}
      {showColorPicker && colorPickerConfig && (
        <ColorPicker
          config={colorPickerConfig}
          visible={showColorPicker}
          onClose={handleColorPickerClose}
          onColorSelect={handleColorPickerSelect}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  colorItem: {
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    width: (screenWidth - 48) / 2,
  },
  colorItemDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  colorItemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  colorItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  colorSwatch: {
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    width: 24,
  },
  colorValue: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  createButton: {
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 12,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  customThemeCreation: {
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 24,
    padding: 16,
  },
  customThemeTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  customizationSection: {
    marginVertical: 20,
  },
  header: {
    alignItems: 'center',
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  presetCard: {
    borderRadius: 16,
    marginRight: 16,
    padding: 16,
    position: 'relative',
    width: 160,
  },
  presetDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  presetName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  presetPreview: {
    borderRadius: 8,
    flexDirection: 'row',
    height: 32,
    marginBottom: 12,
    overflow: 'hidden',
  },
  presetsContainer: {
    flexDirection: 'row',
  },
  presetsSection: {
    marginVertical: 20,
  },
  previewButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  previewButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: 16,
    elevation: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  previewColor: {
    flex: 1,
  },
  previewContent: {
    padding: 16,
  },
  previewHeader: {
    alignItems: 'center',
    padding: 16,
  },
  previewHeaderText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  previewSection: {
    marginBottom: 40,
    marginVertical: 20,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 16,
    fontWeight: '500',
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  selectedIndicator: {
    alignItems: 'center',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
  },
  themeNameInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

export default ThemeCustomizationScreen;