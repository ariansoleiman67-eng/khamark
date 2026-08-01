import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import AppNumber from './AppNumber';
import { buildScheduleTable, resolveStoreStatus, useOperatingHours } from './CountdownDisplay';

type DayName = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const DAY_NAMES: DayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * StoreHoursCountdown Component
 * Shows live countdown timer for store open/close times, driven by the per-day
 * schedule saved in Admin > Operating Hours (8 AM - 6 PM / closed Friday is only
 * the fallback for a shop that has never configured hours).
 */
const StoreHoursCountdown: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [nextEventDay, setNextEventDay] = useState<string>('');
  const [isStoreOpen, setIsStoreOpen] = useState<boolean>(false);
  const { hours: configuredHours, resolved: hoursResolved } = useOperatingHours();

  // Update countdown every second
  useEffect(() => {
    const table = buildScheduleTable(configuredHours);

    const dayLabels: Record<DayName, string> = {
      sunday: t('days.sunday') || 'Sunday',
      monday: t('days.monday') || 'Monday',
      tuesday: t('days.tuesday') || 'Tuesday',
      wednesday: t('days.wednesday') || 'Wednesday',
      thursday: t('days.thursday') || 'Thursday',
      friday: t('days.friday') || 'Friday',
      saturday: t('days.saturday') || 'Saturday',
    };

    // Status is recomputed on every tick, not memoised: memoising it froze the target
    // at mount, so the badge stuck at 00:00 instead of flipping at opening/closing time.
    const updateCountdown = () => {
      const status = resolveStoreStatus(table);
      setIsStoreOpen(status.isOpen);

      if (!status.target) {
        // Every day is marked closed — there is no next event to count down to.
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        setNextEventDay('');
        return;
      }

      setNextEventDay(
        status.daysAhead === 0
          ? (t('home.today') || 'Today')
          : status.daysAhead === 1
            ? (t('home.tomorrow') || 'Tomorrow')
            : dayLabels[DAY_NAMES[status.targetDayIndex]]
      );

      const diff = status.target.toMillis() - Date.now();

      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setCountdown({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [t, configuredHours]);

  const statusColor = isStoreOpen ? theme.colors.success : theme.colors.error;
  const bgColor = isStoreOpen ? theme.colors.success + '15' : theme.colors.error + '15';
  const borderColor = isStoreOpen ? theme.colors.success + '30' : theme.colors.error + '30';

  // Nothing rather than a guess: this badge states "Open Now" / "Closed" outright,
  // and until the admin schedule is actually read that word would come from the
  // built-in default week.
  if (!hoursResolved) return null;

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text allowFontScaling={false} style={[styles.statusText, { color: statusColor }]}>
          {isStoreOpen ? (t('home.storeOpen') || 'Open Now') : (t('home.storeClosed') || 'Closed')}
        </Text>
        <Ionicons 
          name={isStoreOpen ? 'storefront' : 'time-outline'} 
          size={16} 
          color={statusColor} 
          style={styles.icon}
        />
      </View>

      <View style={styles.countdownRow}>
        <Text allowFontScaling={false} style={[styles.countdownLabel, { color: theme.colors.textSecondary }]}>
          {isStoreOpen 
            ? (t('home.closesIn') || 'Closes in') 
            : `${t('home.opensIn') || 'Opens'} ${nextEventDay}`}
        </Text>
        
        <View style={styles.timeBlocks}>
          {countdown.hours > 0 && (
            <View style={[styles.timeBlock, { backgroundColor: theme.colors.surface }]}>
              <AppNumber value={countdown.hours} style={[styles.timeValue, { color: theme.colors.text }]} />
              <Text allowFontScaling={false} style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
                {t('time.hours') || 'h'}
              </Text>
            </View>
          )}
          <View style={[styles.timeBlock, { backgroundColor: theme.colors.surface }]}>
            <AppNumber value={countdown.minutes} style={[styles.timeValue, { color: theme.colors.text }]} />
            <Text allowFontScaling={false} style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
              {t('time.minutes') || 'm'}
            </Text>
          </View>
          <View style={[styles.timeBlock, { backgroundColor: theme.colors.surface }]}>
            <AppNumber value={countdown.seconds} style={[styles.timeValue, { color: theme.colors.text }]} />
            <Text allowFontScaling={false} style={[styles.timeLabel, { color: theme.colors.textSecondary }]}>
              {t('time.seconds') || 's'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
  },
  countdownLabel: {
    flex: 1,
    fontSize: 13,
    includeFontPadding: Platform.OS === 'android',
    lineHeight: Platform.OS === 'android' ? 20 : 16,
  },
  countdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  icon: {
    marginLeft: 8,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  statusText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  timeBlock: {
    alignItems: 'baseline',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timeBlocks: {
    flexDirection: 'row',
    gap: 6,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 2,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});

export default StoreHoursCountdown;

