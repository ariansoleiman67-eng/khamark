import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Animated,
  I18nManager,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';

type AlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
};
type AlertData = {
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  cancelable?: boolean;
};

/**
 * Renders a single, modern, theme-aware dialog and globally overrides
 * `Alert.alert` so EVERY existing `Alert.alert(...)` call in the app shows this
 * styled dialog instead of the default system one — no per-call-site changes.
 * Mount once, high in the tree (inside ThemeProvider). Alerts are queued so
 * overlapping calls show one after another.
 */
export default function AppAlertHost() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const [current, setCurrent] = useState<AlertData | null>(null);
  const queueRef = useRef<AlertData[]>([]);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  // Override Alert.alert app-wide. Alert is a shared singleton, so reassigning
  // its method affects every module that imported { Alert }.
  useEffect(() => {
    const original = Alert.alert;
    (Alert as any).alert = (
      title?: string,
      message?: string,
      buttons?: AlertButton[],
      options?: { cancelable?: boolean },
    ) => {
      queueRef.current.push({ title, message, buttons, cancelable: options?.cancelable });
      setCurrent((prev) => (prev ? prev : queueRef.current.shift() || null));
    };
    return () => {
      (Alert as any).alert = original;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    opacity.setValue(0);
    scale.setValue(0.92);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [current, opacity, scale]);

  const close = useCallback(
    (btn?: AlertButton) => {
      try {
        btn?.onPress?.();
      } catch {
        /* swallow handler errors so the dialog still closes */
      }
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
        setCurrent(null);
        // Show the next queued alert (if any) on the next tick.
        setTimeout(() => {
          const next = queueRef.current.shift();
          if (next) setCurrent(next);
        }, 50);
      });
    },
    [opacity],
  );

  if (!current) return null;

  const buttons: AlertButton[] =
    current.buttons && current.buttons.length > 0
      ? current.buttons
      : [{ text: t('common.ok', { defaultValue: 'OK' }) }];

  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const onBackdrop = () => {
    if (current.cancelable === false) return;
    close(cancelBtn);
  };

  // The last non-cancel button is the "primary" action (filled).
  let primaryIdx = -1;
  buttons.forEach((b, i) => {
    if (b.style !== 'cancel') primaryIdx = i;
  });

  const stacked = buttons.length > 2;
  const isRTL = I18nManager.isRTL;
  const align = isRTL ? 'right' : 'left';

  const surface = isDark ? theme.colors.surface : '#FFFFFF';

  const renderButton = (b: AlertButton, i: number) => {
    const isPrimary = i === primaryIdx && b.style !== 'destructive';
    const isDestructive = b.style === 'destructive';
    const isCancel = b.style === 'cancel';

    let bg = 'transparent';
    let color = theme.colors.primary;
    let borderColor = 'transparent';
    if (isDestructive) {
      bg = '#EF4444';
      color = '#FFFFFF';
    } else if (isPrimary) {
      bg = theme.colors.primary;
      color = (theme.colors as any).textOnPrimary || '#FFFFFF';
    } else if (isCancel) {
      color = theme.colors.textSecondary;
      borderColor = theme.colors.border;
    } else {
      color = theme.colors.primary;
      borderColor = theme.colors.border;
    }

    return (
      <TouchableOpacity
        key={`${b.text}-${i}`}
        activeOpacity={0.75}
        onPress={() => close(b)}
        style={[
          styles.button,
          {
            backgroundColor: bg,
            borderColor,
            borderWidth: bg === 'transparent' ? 1 : 0,
            flex: stacked ? undefined : 1,
            marginTop: stacked ? 8 : 0,
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={{ color, fontSize: 15, fontWeight: isPrimary || isDestructive ? '700' : '600' }}
        >
          {b.text || t('common.ok', { defaultValue: 'OK' })}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onBackdrop} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onBackdrop}>
        <Animated.View style={{ opacity }} pointerEvents="box-none">
          <Pressable onPress={() => {}} style={styles.center} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.card,
                {
                  backgroundColor: surface,
                  transform: [{ scale }],
                  shadowColor: '#000',
                },
              ]}
            >
              {!!current.title && (
                <Text
                  allowFontScaling={false}
                  style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text, textAlign: align, marginBottom: current.message ? 8 : 16 }}
                >
                  {current.title}
                </Text>
              )}
              {!!current.message && (
                <Text
                  allowFontScaling={false}
                  style={{ fontSize: 14.5, lineHeight: 21, color: theme.colors.textSecondary, textAlign: align, marginBottom: 20 }}
                >
                  {current.message}
                </Text>
              )}
              <View
                style={{
                  flexDirection: stacked ? 'column' : isRTL ? 'row-reverse' : 'row',
                  ...(stacked ? {} : { gap: 10 }),
                }}
              >
                {buttons.map(renderButton)}
              </View>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  center: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 22,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  button: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
