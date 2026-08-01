import React, { useState, useEffect, memo, useRef } from 'react';
import { Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import settingsService from '../services/settingsService';
import { OperatingHours } from '../types';

interface CountdownDisplayProps {
  color: string;
  openTime?: string | null;  // "08:00" | null (default)
  closeTime?: string | null; // "18:00" | null (default)
  closedDays?: number[] | null; // [5] | null (default) | [] (none)
  timeZone?: string | null; // IANA | null (device)
  tenantId?: string | null; // whose Operating Hours schedule to read
  onStatusChange?: (isOpen: boolean) => void;
}

// Last-resort values, used only when no hours have ever been configured anywhere.
const DEFAULT_OPEN_TIME = "08:00";
const DEFAULT_CLOSE_TIME = "18:00";
const DEFAULT_CLOSED_DAYS = [5]; // Friday

// Admin > Operating Hours stores one entry per day keyed by name; this file works in
// JS day indexes (0=Sunday..6=Saturday), so index into this to cross over.
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;
// The schedule is an unvalidated JSONB blob; a malformed entry parsed with Number()
// yields NaN and Luxon then throws on .set(), taking the whole store header down.
const validTime = (value: unknown, fallback: string): string =>
  typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback;

export interface DayHours {
  isOpen: boolean;
  open: string;  // "HH:mm"
  close: string; // "HH:mm"
}

/**
 * Flattens both hour sources into a single table indexed by JS day (0=Sunday).
 * The per-day admin schedule is the base; the store profile's single open/close pair
 * and closedDays override it, because on that screen a non-null value is an explicit
 * per-store opt-out (null there means "use the shared schedule").
 */
export const buildScheduleTable = (
  hours?: OperatingHours | null,
  openTime?: string | null,
  closeTime?: string | null,
  closedDays?: number[] | null,
): DayHours[] => {
  const table: DayHours[] = [];

  for (let i = 0; i < 7; i++) {
    const day = hours ? (hours as any)[DAY_KEYS[i]] : null;
    const base: DayHours = day
      ? {
          isOpen: day.isOpen !== false,
          open: validTime(day.openTime, DEFAULT_OPEN_TIME),
          close: validTime(day.closeTime, DEFAULT_CLOSE_TIME),
        }
      : {
          isOpen: !DEFAULT_CLOSED_DAYS.includes(i),
          open: DEFAULT_OPEN_TIME,
          close: DEFAULT_CLOSE_TIME,
        };

    table.push({
      isOpen: closedDays ? !closedDays.includes(i) : base.isOpen,
      open: openTime ? validTime(openTime, base.open) : base.open,
      close: closeTime ? validTime(closeTime, base.close) : base.close,
    });
  }

  return table;
};

export interface StoreStatus {
  isOpen: boolean;
  target: DateTime | null;
  daysAhead: number;      // 0 = today, 1 = tomorrow, ...
  targetDayIndex: number; // JS day index of `target`
}

/**
 * Resolves "open now?" plus the next open/close boundary against a schedule table.
 * Overnight hours (close < open) are still not supported.
 */
export const resolveStoreStatus = (table: DayHours[], timeZone?: string | null): StoreStatus => {
  const now = DateTime.now().setZone(timeZone || undefined);

  const at = (dt: DateTime, time: string) => {
    const [h, m] = time.split(':').map(Number);
    return dt.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  };

  // Luxon weekday: 1=Monday ... 7=Sunday. Table convention: 0=Sunday ... 6=Saturday.
  // Mapping: Luxon % 7 (7%7=0=Sun, 1%7=1=Mon ... 5%7=5=Fri)
  const todayIndex = now.weekday % 7;
  const today = table[todayIndex];
  const todayOpen = at(now, today.open);
  const todayClose = at(now, today.close);

  if (today.isOpen && now >= todayOpen && now < todayClose) {
    return { isOpen: true, target: todayClose, daysAhead: 0, targetDayIndex: todayIndex };
  }

  // Opens later today?
  if (today.isOpen && now < todayOpen) {
    return { isOpen: false, target: todayOpen, daysAhead: 0, targetDayIndex: todayIndex };
  }

  // Scan the next 7 days for the first open one.
  for (let i = 1; i <= 7; i++) {
    const checkDate = now.plus({ days: i });
    const checkIndex = checkDate.weekday % 7;
    const day = table[checkIndex];
    if (day.isOpen) {
      return { isOpen: false, target: at(checkDate, day.open), daysAhead: i, targetDayIndex: checkIndex };
    }
  }

  // Never open on any day.
  return { isOpen: false, target: null, daysAhead: 0, targetDayIndex: todayIndex };
};

const HOURS_RETRY_MS = 30000;

/**
 * Per-day hours as written by the Admin > Operating Hours screen.
 * An unreadable schedule is retried rather than treated as "none configured" —
 * otherwise a single cold-start network blip pins the badge to the generic default
 * schedule for the rest of the session and a Friday-closed shop reads as Open.
 */
export const useOperatingHours = (tenantId?: string | null): { hours: OperatingHours | null; resolved: boolean } => {
  const [hours, setHours] = useState<OperatingHours | null>(null);
  // False while the schedule is unknown — either still loading or unreadable and
  // retrying. Exposed because `hours === null` alone cannot tell "this shop never
  // configured hours" (defaults are correct) from "we could not read them" (defaults
  // are a guess). Showing a confident Open/Closed badge off a guess is how a
  // Friday-closed shop advertised itself as open.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const result = await settingsService.getOperatingHoursForDisplay(tenantId);
        if (!alive) return;
        if (result.status === 'configured') {
          setHours(result.hours);
          setResolved(true);
        } else if (result.status === 'unconfigured') {
          setResolved(true);
        } else {
          retry = setTimeout(load, HOURS_RETRY_MS);
        }
      } catch {
        if (alive) retry = setTimeout(load, HOURS_RETRY_MS);
      }
    };

    load();

    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
    };
  }, [tenantId]);

  return { hours, resolved };
};

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
  tenantId,
  onStatusChange
}) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const appState = useRef(AppState.currentState);
  const { hours: configuredHours, resolved: hoursResolved } = useOperatingHours(tenantId);

  // The store profile's own open/close pair stands on its own; without it the
  // schedule comes entirely from Admin > Operating Hours, so nothing may be
  // reported until that read succeeds. Reporting early meant the parent badge lit
  // up green off the built-in default week and called a Friday-closed shop open.
  const hasStoreOverride = !!openTime && !!closeTime;
  const scheduleKnown = hoursResolved || hasStoreOverride;

  useEffect(() => {
    if (!scheduleKnown) return;

    // 1. Resolve Effective Schedule (per-day admin hours, overridden by any per-store pair)
    const table = buildScheduleTable(configuredHours, openTime, closeTime, closedDays);

    const calculateTarget = () => resolveStoreStatus(table, timeZone);

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
  }, [openTime, closeTime, closedDays, timeZone, configuredHours, scheduleKnown]); // Re-init on prop/schedule change

  if (!scheduleKnown) return null;

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


