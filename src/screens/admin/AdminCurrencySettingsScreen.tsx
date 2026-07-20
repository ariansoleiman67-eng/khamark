import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { SPACING } from '../../constants/theme';
import settingsService from '../../services/settingsService';
import { useTenant } from '../../contexts/TenantContext';

const AdminCurrencySettingsScreen = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { tenantId } = useTenant();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exchangeRateIQD, setExchangeRateIQD] = useState<number | undefined>(undefined);

  const fetchSettings = async () => {
    try {
      setLoading(true);

      // Exchange rate lives in global settings — this is the rate buyers see.
      const data = await settingsService.getBusinessInfo();
      if (data) {
        setExchangeRateIQD(data.exchangeRateIQD || undefined);
      }
    } catch (error) {
      console.error('Error fetching currency settings:', error);
      Alert.alert(t('admin.common.error'), t('admin.currency.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [tenantId]);

  const handleSave = async () => {
    // Reject empty/invalid rates BEFORE saving. An undefined/zero rate would be
    // serialized away (JSON drops undefined keys), silently deleting the stored
    // exchange rate and reverting every buyer to the hardcoded fallback. The sane
    // range also catches fat-fingered ~10x values (e.g. 13105 instead of 1310).
    if (
      exchangeRateIQD === undefined ||
      exchangeRateIQD < 100 ||
      exchangeRateIQD > 100000
    ) {
      Alert.alert(
        t('admin.common.error'),
        t('admin.currency.invalidRate', {
          defaultValue: 'Please enter a valid exchange rate.',
        })
      );
      return;
    }

    try {
      setSaving(true);

      // ALWAYS save to global settings so regular buyers get the updated exchange rate.
      // To preserve existing business info, fetch it first.
      const existingInfo = await settingsService.getBusinessInfo() || {};
      await settingsService.updateBusinessInfo({
        ...existingInfo,
        exchangeRateIQD,
      });
      
      Alert.alert(t('admin.common.success'), t('admin.currency.successMessage'));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving currency settings:', error);
      Alert.alert(t('admin.common.error'), t('admin.currency.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={theme.colors.text} 
            onPress={() => navigation.goBack()}
          />
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('admin.currency.title')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Without keyboardShouldPersistTaps the first tap on Save while the
            exchange-rate input is focused only dismisses the keyboard. */}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('admin.currency.exchangeRates')}
            </Text>

            <Input
              label={t('admin.currency.usdToIqdRate')}
              value={exchangeRateIQD?.toString() || ''}
              onChangeText={(text) => {
                const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
                setExchangeRateIQD(isNaN(num) ? undefined : num);
              }}
              placeholder={t('admin.currency.ratePlaceholder')}
              keyboardType="number-pad"
              containerStyle={styles.input}
            />
            <Text allowFontScaling={false} style={[styles.hintText, { color: theme.colors.textSecondary }]}>
              {t('admin.currency.rateHint')}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { 
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border 
        }]}>
          <Button
            title={t('common.save') || 'Save Changes'}
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    elevation: 2,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  flex: {
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    padding: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? 30 : SPACING.md,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  hintText: {
    fontSize: 12,
    marginTop: -SPACING.sm,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  input: {
    marginBottom: SPACING.md,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  saveButton: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
});

export default AdminCurrencySettingsScreen;
