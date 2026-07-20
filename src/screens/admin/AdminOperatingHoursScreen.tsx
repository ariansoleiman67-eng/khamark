import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import Button from '../../components/Button';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import settingsService from '../../services/settingsService';
import { OperatingHours, DaySchedule } from '../../types';

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const AdminOperatingHoursScreen = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  // Directional icons must follow the reading direction. Global auto-RTL is
  // disabled in App.tsx, so I18nManager.isRTL alone is always false here — the
  // language check is what actually does the work.
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Default Initial State
  const defaultSchedule: DaySchedule = {
    isOpen: true,
    openTime: '09:00',
    closeTime: '18:00',
  };

  const [schedule, setSchedule] = useState<OperatingHours>({
    monday: { ...defaultSchedule },
    tuesday: { ...defaultSchedule },
    wednesday: { ...defaultSchedule },
    thursday: { ...defaultSchedule },
    friday: { ...defaultSchedule },
    saturday: { ...defaultSchedule, openTime: '10:00', closeTime: '16:00' },
    sunday: { ...defaultSchedule, isOpen: false },
    updatedAt: { seconds: 0, nanoseconds: 0 } as any,
  });

  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'open' | 'close'>('open');
  const [pickerDay, setPickerDay] = useState<typeof DAYS[number] | null>(null);
  const [pickerValue, setPickerValue] = useState(new Date());

  useEffect(() => {
    fetchOperatingHours();
  }, []);

  const fetchOperatingHours = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getOperatingHours();
      if (data) {
        // The stored value is a raw JSONB blob (`data.data as OperatingHours`)
        // with no runtime validation. Normalize per-day so a partial/malformed
        // row (missing day keys, non-object/non-string fields) can't crash the
        // render or the time picker.
        const raw = data as any;
        setSchedule(prev => {
          const normalized: OperatingHours = { ...prev };
          DAYS.forEach(d => {
            const dayRaw = raw[d];
            const base = prev[d] ?? defaultSchedule;
            normalized[d] = {
              isOpen: typeof dayRaw?.isOpen === 'boolean' ? dayRaw.isOpen : base.isOpen,
              openTime: typeof dayRaw?.openTime === 'string' && dayRaw.openTime ? dayRaw.openTime : base.openTime,
              closeTime: typeof dayRaw?.closeTime === 'string' && dayRaw.closeTime ? dayRaw.closeTime : base.closeTime,
            };
          });
          if (raw.updatedAt) normalized.updatedAt = raw.updatedAt;
          return normalized;
        });
      }
    } catch (error) {
      console.error('Error fetching operating hours:', error);
      Alert.alert(t('admin.common.error'), t('admin.operatingHours.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await settingsService.updateOperatingHours(schedule);
      Alert.alert(t('admin.common.success'), t('admin.operatingHours.success'));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving operating hours:', error);
      Alert.alert(t('admin.common.error'), t('admin.operatingHours.failed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: typeof DAYS[number]) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        isOpen: !prev[day].isOpen,
      },
    }));
  };

  const openTimePicker = (day: typeof DAYS[number], mode: 'open' | 'close') => {
    const daySchedule = schedule[day] ?? defaultSchedule;
    const currentWaitTime =
      (mode === 'open' ? daySchedule.openTime : daySchedule.closeTime) || '09:00';

    const [hours, minutes] = String(currentWaitTime).split(':').map(Number);
    const date = new Date();
    date.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);

    setPickerDay(day);
    setPickerMode(mode);
    setPickerValue(date);
    setShowPicker(true);
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }

    if (selectedDate && pickerDay) {
      // Keep the (controlled) picker value in sync so the iOS inline spinner
      // tracks the user's selection instead of snapping back on re-render.
      setPickerValue(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      setSchedule(prev => ({
        ...prev,
        [pickerDay]: {
          ...prev[pickerDay],
          [pickerMode === 'open' ? 'openTime' : 'closeTime']: timeString,
        },
      }));
    }
  };

  const renderDayRow = (day: typeof DAYS[number]) => {
    const daySchedule = schedule[day] ?? defaultSchedule;
    const isClosed = !daySchedule.isOpen;

    return (
      <View key={day} style={[styles.dayRow, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.dayInfo}>
          <Text allowFontScaling={false} style={[styles.dayName, { color: theme.colors.text }]}>
            {t(`admin.days.${day}`)}
          </Text>
          <Switch
            value={daySchedule.isOpen}
            onValueChange={() => toggleDay(day)}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
            thumbColor={daySchedule.isOpen ? theme.colors.primary : '#f4f3f4'}
          />
        </View>

        <View style={styles.hoursContainer}>
          {isClosed ? (
            <Text allowFontScaling={false} style={[styles.closedText, { color: theme.colors.textSecondary }]}>
              {t('admin.operatingHours.closed')}
            </Text>
          ) : (
            <View style={styles.timeSelection}>
              <TouchableOpacity
                style={[styles.timeButton, { backgroundColor: theme.colors.surface }]}
                onPress={() => openTimePicker(day, 'open')}
              >
                <Text allowFontScaling={false} style={[styles.timeText, { color: '#000000', fontWeight: '600' }]}>
                  {daySchedule.openTime}
                </Text>
              </TouchableOpacity>
              <Text allowFontScaling={false} style={[styles.separator, { color: theme.colors.textSecondary }]}>-</Text>
              <TouchableOpacity
                style={[styles.timeButton, { backgroundColor: theme.colors.surface }]}
                onPress={() => openTimePicker(day, 'close')}
              >
                <Text allowFontScaling={false} style={[styles.timeText, { color: '#000000', fontWeight: '600' }]}>
                  {daySchedule.closeTime}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
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
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Ionicons 
          name={isRTL ? 'arrow-forward' : 'arrow-back'} 
          size={24} 
          color={theme.colors.text} 
          onPress={() => navigation.goBack()}
        />
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.operatingHours.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          {DAYS.map(day => renderDayRow(day))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { 
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.border 
      }]}>
        <Button
          title={t('admin.businessInfo.saveChanges')}
          onPress={handleSave}
          loading={saving}
          style={styles.saveButton}
        />
      </View>

      {showPicker && (
        Platform.OS === 'ios' ? (
          <Modal
            transparent
            animationType="fade"
            visible={showPicker}
            onRequestClose={() => setShowPicker(false)}
          >
            <TouchableOpacity
              style={styles.pickerOverlay}
              activeOpacity={1}
              onPress={() => setShowPicker(false)}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}
              >
                <View style={[styles.pickerHeader, { borderBottomColor: theme.colors.border }]}>
                  <TouchableOpacity onPress={() => setShowPicker(false)}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.pickerDone, { color: theme.colors.primary }]}
                    >
                      {t('common.done')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerValue}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={handleTimeChange}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        ) : (
          <DateTimePicker
            value={pickerValue}
            mode="time"
            is24Hour={true}
            display="default"
            onChange={handleTimeChange}
          />
        )
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    ...SHADOW_STYLES.small,
    overflow: 'hidden',
  },
  closedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  dayInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
  dayName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  dayRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.md,
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
  hoursContainer: {
    alignItems: 'flex-end',
    flex: 1.5,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  pickerDone: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerHeader: {
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    padding: SPACING.md,
  },
  pickerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  saveButton: {
    width: '100%',
  },
  separator: {
    marginHorizontal: 8,
  },
  timeButton: {
    borderColor: '#999',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeSelection: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default AdminOperatingHoursScreen;
