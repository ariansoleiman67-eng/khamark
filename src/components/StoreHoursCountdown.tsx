import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import AppNumber from './AppNumber';

type DayName = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
const DAY_NAMES: DayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Fixed store hours: 8 AM - 6 PM, closed on Fridays
const FIXED_OPEN_HOUR = 8;  // 8:00 AM
const FIXED_CLOSE_HOUR = 18; // 6:00 PM (18:00)
const CLOSED_DAY = 5; // Friday (0=Sunday, 5=Friday)

/**
 * StoreHoursCountdown Component
 * Shows live countdown timer for store open/close times
 * Fixed hours: 8 AM - 6 PM daily, closed on Fridays
 */
const StoreHoursCountdown: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [nextEventDay, setNextEventDay] = useState<string>('');
  const [isStoreOpen, setIsStoreOpen] = useState<boolean>(false);

  // Calculate if store is currently open and target time
  const calculateStoreStatus = useMemo(() => {
    const now = new Date();
    const currentDayIndex = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    const openTimeMinutes = FIXED_OPEN_HOUR * 60;
    const closeTimeMinutes = FIXED_CLOSE_HOUR * 60;

    // Check if today is Friday (closed)
    const isFriday = currentDayIndex === CLOSED_DAY;
    
    // Store is open if: not Friday AND within operating hours
    const isOpen = !isFriday && 
                   currentTimeMinutes >= openTimeMinutes && 
                   currentTimeMinutes < closeTimeMinutes;

    // Calculate target time
    if (isOpen) {
      // Store is open - countdown to closing time (today at 6 PM)
      const target = new Date(now);
      target.setHours(FIXED_CLOSE_HOUR, 0, 0, 0);
      return { isOpen: true, target, dayLabel: t('home.today') || 'Today' };
    } else {
      // Store is closed - find next opening time
      const dayLabels: Record<DayName, string> = {
        sunday: t('days.sunday') || 'Sunday',
        monday: t('days.monday') || 'Monday',
        tuesday: t('days.tuesday') || 'Tuesday',
        wednesday: t('days.wednesday') || 'Wednesday',
        thursday: t('days.thursday') || 'Thursday',
        friday: t('days.friday') || 'Friday',
        saturday: t('days.saturday') || 'Saturday',
      };

      // If before opening time today and not Friday
      if (!isFriday && currentTimeMinutes < openTimeMinutes) {
        const target = new Date(now);
        target.setHours(FIXED_OPEN_HOUR, 0, 0, 0);
        return { isOpen: false, target, dayLabel: t('home.today') || 'Today' };
      }

      // Find next open day (skip Friday)
      for (let i = 1; i <= 7; i++) {
        const checkDayIndex = (currentDayIndex + i) % 7;
        
        // Skip Friday
        if (checkDayIndex === CLOSED_DAY) continue;
        
        const target = new Date(now);
        target.setDate(target.getDate() + i);
        target.setHours(FIXED_OPEN_HOUR, 0, 0, 0);
        
        const checkDay = DAY_NAMES[checkDayIndex];
        const dayLabel = i === 1 
          ? (t('home.tomorrow') || 'Tomorrow')
          : dayLabels[checkDay];
        
        return { isOpen: false, target, dayLabel };
      }
    }

    return null;
  }, [t]);

  // Update countdown every second
  useEffect(() => {
    if (!calculateStoreStatus) return;

    const updateCountdown = () => {
      const now = new Date();
      const diff = calculateStoreStatus.target.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ hours, minutes, seconds });
      setNextEventDay(calculateStoreStatus.dayLabel);
      setIsStoreOpen(calculateStoreStatus.isOpen);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [calculateStoreStatus]);

  const statusColor = isStoreOpen ? theme.colors.success : theme.colors.error;
  const bgColor = isStoreOpen ? theme.colors.success + '15' : theme.colors.error + '15';
  const borderColor = isStoreOpen ? theme.colors.success + '30' : theme.colors.error + '30';

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

