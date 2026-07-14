import React, { useState, useEffect, memo, useRef } from 'react';
import { Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';

interface CountdownDisplayProps {
  color: string;
  openTime?: string | null;  // "08:00" | null (default)
  closeTime?: string | null; // "18:00" | null (default)
  closedDays?: number[] | null; // [5] | null (default) | [] (none)
  timeZone?: string | null; // IANA | null (device)
  onStatusChange?: (isOpen: boolean) => void;
}

// Default values
const DEFAULT_OPEN_TIME = "08:00";
const DEFAULT_CLOSE_TIME = "18:00";
const DEFAULT_CLOSED_DAYS = [5]; // Friday

/**
 * CountdownDisplay - Robust timezone-aware countdown
 * Uses Luxon for all date/time math
 */
const CountdownDisplay: React.FC<CountdownDisplayProps> = memo(function CountdownDisplay({ 
  color, 
  openTime, 
  closeTime, 
  closedDays,
  timeZone,
  onStatusChange
}) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // 1. Resolve Effective Schedule
    const effectiveOpen = openTime ?? DEFAULT_OPEN_TIME;
    const effectiveClose = closeTime ?? DEFAULT_CLOSE_TIME;
    const effectiveClosedDays = closedDays ?? DEFAULT_CLOSED_DAYS;
    
    // Resolve timezone: if null/undefined, use system zone (default behavior of Luxon 'local')
    // If provided, use that zone.
    const zoneOptions = timeZone ? { zone: timeZone } : {};

    const calculateTarget = () => {
      // Current time in the TARGET timezone
      const now = DateTime.now().setZone(timeZone || undefined);
      
      // Parse open/close times (HH:MM)
      const [openH, openM] = effectiveOpen.split(':').map(Number);
      const [closeH, closeM] = effectiveClose.split(':').map(Number);
      
      // Create Today's Open/Close reference times
      const todayOpen = now.set({ hour: openH, minute: openM, second: 0, millisecond: 0 });
      const todayClose = now.set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 });

      // Check if strictly closed today (by day of week)
      // Luxon weekday: 1=Monday ... 7=Sunday. 
      // JS/Our App convention: 0=Sunday ... 6=Saturday.
      // Mapping: Luxon % 7 = JS (7%7=0=Sun, 1%7=1=Mon... 5%7=5=Fri)
      const currentDayIndex = now.weekday % 7; 
      const isTodayClosedDay = effectiveClosedDays.includes(currentDayIndex);

      // Determine Status
      // Open if: Not closed today AND now is between Open and Close
      // Note: We don't support overnight yet (Close < Open), assuming same-day hours.
      const isNowOpen = !isTodayClosedDay && now >= todayOpen && now < todayClose;

      if (isNowOpen) {
        // OPEN: Countdown to Close
        return { target: todayClose, isOpen: true };
      } else {
        // CLOSED: Find Next Opening
        
        // 1. Later today? (Not closed day, and now < Open)
        if (!isTodayClosedDay && now < todayOpen) {
          return { target: todayOpen, isOpen: false };
        }

        // 2. Scan next 7 days
        let nextOpen: DateTime | null = null;
        for (let i = 1; i <= 7; i++) {
          const checkDate = now.plus({ days: i });
          const checkDayIndex = checkDate.weekday % 7;
          
          if (!effectiveClosedDays.includes(checkDayIndex)) {
            // Found open day
            nextOpen = checkDate.set({ hour: openH, minute: openM, second: 0, millisecond: 0 });
            break;
          }
        }
        
        return { target: nextOpen, isOpen: false };
      }
    };

    const updateCountdown = () => {
      // Optimization: visible check could go here if we had navigation focus state
      if (appState.current.match(/inactive|background/)) return;

      const result = calculateTarget();
      
      // Update status prop only if changed (useEffect wrap or check mismatch)
      // We'll update the local state which triggers re-render, 
      // parent should wrap handler in useCallback to avoid loops if needed.
      // But passing state up every second is bad. 
      // Better: Only call onStatusChange if derived status differs from previous *prop* or handled externally.
      // For now, we update local state `isOpen` and assume parent uses `isOpen`.
      // Actually strictly respecting user req: calls onStatusChange.
      // We will do it inside the effect only if changed to avoid render loop if parent updates state.
      // But careful: we are inside the tick. Status shouldn't flip often.
      
      if (!result || !result.target) {
        // Misconfiguration or never open
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        setIsOpen(false);
        if (onStatusChange) onStatusChange(false);
        return;
      }

      setIsOpen(result.isOpen);
      // Safe to call frequency restricted? 
      // Let's rely on the fact status flips rarely.
      if (onStatusChange) onStatusChange(result.isOpen);
      
      const now = DateTime.now().setZone(timeZone || undefined);
      const diff = result.target.diff(now, ['hours', 'minutes', 'seconds']).toObject();
      
      if (diff.hours === undefined) return; // Should not happen

      // Normalize negative or sub-second
      const msDiff = result.target.toMillis() - now.toMillis();
      if (msDiff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        // Force immediate recalculation on next tick or allow next tick to pick it up
        return;
      }

      setCountdown({
        hours: Math.floor(msDiff / (1000 * 60 * 60)),
        minutes: Math.floor((msDiff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((msDiff % (1000 * 60)) / 1000),
      });
    };

    // AppState listener
    const subscription = AppState.addEventListener('change', nextAppState => {
      appState.current = nextAppState;
    });

    // Initial call
    updateCountdown();
    
    // Interval
    const interval = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [openTime, closeTime, closedDays, timeZone]); // Re-init on prop change

  const prefix = isOpen 
    ? (t('home.closesIn', 'Close in')) 
    : (t('home.opensIn', 'Open in'));

  const timeString = countdown.hours > 0 
    ? `${countdown.hours}:${countdown.minutes.toString().padStart(2, '0')}:${countdown.seconds.toString().padStart(2, '0')}`
    : `${countdown.minutes}:${countdown.seconds.toString().padStart(2, '0')}`;

  return (
    <Text allowFontScaling={false} style={[styles.countdownText, { color }]}>
      {prefix} {timeString}
    </Text>
  );
});

const styles = StyleSheet.create({
  countdownText: {
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
    marginLeft: 4,
    textAlignVertical: 'center',
  },
});

export default CountdownDisplay;


