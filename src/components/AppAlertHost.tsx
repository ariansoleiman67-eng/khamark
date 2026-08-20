import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Modal,
  Platform,
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
import { createAlertCloseSequencer } from './alertSequencer';

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
/**
 * ⚠️ NOT MOUNTED. App.tsx no longer renders this, deliberately.
 *
 * It overrode Alert.alert globally and drew the dialog as a react-native <Modal>.
 * On iOS a Modal cannot be presented while another Modal is already presented, so
 * every alert raised from inside a bottom sheet, a picker, or the admin product
 * editor was silently dropped — the shopper tapped and nothing happened.
 *
 * Worse, React Native latches the attempt: RCTModalHostViewComponentView.mm sets
 * _isPresented = YES BEFORE calling presentViewController: and guards re-presenting
 * with !_isPresented. So the FIRST alert iOS refused to show killed EVERY alert for
 * the rest of the session — including "your order failed" and "address saved".
 *
 * Two bugs the shop reported traced back to exactly this: "I tap Buy and nothing
 * happens" and "I add an address and nothing happens" (it saved, silently, twice).
 *
 * HAryad — the working production app this was forked from — has no such override.
 * Before reviving this, it must not be a Modal: render the dialog inline in a host
 * that lives above the navigator, or accept the system alert.
 */
export default function AppAlertHost() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const [current, setCurrent] = useState<AlertData | null>(null);
  const queueRef = useRef<AlertData[]>([]);
  // Holds the pressed button's handler until this dialog's own <Modal> has gone.
  // See alertSequencer.ts for why that ordering is the whole bug.
  const sequencerRef = useRef(createAlertCloseSequencer());
  // While true, a newly-raised alert only QUEUES. Showing it immediately would
  // keep the Modal visible, so iOS would never fire onDismiss and the pending
  // handler would be stranded.
  const dismissingRef = useRef(false);
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
      if (dismissingRef.current) return; // the dismissal handler below will pick it up
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

  // Runs the pressed button's handler and then shows whatever queued up behind
  // it. Called from the Modal's onDismiss on iOS — the platform telling us the
  // view controller has finished going away — and directly on Android, which has
  // no onDismiss and no conflict to avoid.
  const afterDialogGone = useCallback(() => {
    dismissingRef.current = false;
    sequencerRef.current.dialogDismissed();
    const next = queueRef.current.shift();
    if (next) setCurrent(next);
  }, []);

  const close = useCallback(
    (btn?: AlertButton) => {
      // ARMED, NOT RUN. This handler used to be invoked right here, before the
      // fade even started, so it opened its modal while this dialog's <Modal> was
      // still mounted. On iOS that is two view controllers at once and the app
      // freezes; on Android it is two Dialogs and nothing happens. That is the
      // whole platform split in the bug report.
      sequencerRef.current.arm(btn?.onPress ? () => btn.onPress!() : null);
      dismissingRef.current = true;
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
        setCurrent(null);
        // A HANDLER MUST NEVER BE LOST. On iOS the intended trigger is the
        // Modal's onDismiss, which RN emits from UIKit's dismissal completion
        // block (RCTModalHostViewComponentView.mm:183) — but that block only
        // runs if the modal was actually presented in the first place. If it
        // never was, onDismiss never fires and the pressed button would silently
        // do nothing, which for a "Delete" button is far worse than the bug this
        // is fixing. So a timer backs it up. The sequencer runs a handler at most
        // once, so whichever arrives first wins and the other is a no-op.
        // Android has no onDismiss at all and no presentation conflict to avoid,
        // so there the timer IS the mechanism.
        setTimeout(afterDialogGone, Platform.OS === 'ios' ? 350 : 50);
      });
    },
    [opacity, afterDialogGone],
  );

  // THE MODAL STAYS MOUNTED WHEN THERE IS NO ALERT, rendered with visible={false}
  // rather than returning null. Both branches of this component return a <Modal>
  // at the same position, so React reconciles them to ONE instance whose `visible`
  // prop flips — which is what lets iOS fire `onDismiss` on the way down. Return
  // null here and the element unmounts instead of dismissing, no onDismiss ever
  // arrives, and the pressed button's handler would sit in the sequencer forever.
  if (!current) {
    return (
      <Modal
        transparent
        visible={false}
        animationType="none"
        statusBarTranslucent
        onDismiss={afterDialogGone}
      />
    );
  }

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
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={onBackdrop}
      statusBarTranslucent
      // iOS only, and the point of the whole change: it fires once this dialog's
      // view controller has finished dismissing, which is when the pressed
      // button's handler may safely open a modal of its own.
      onDismiss={afterDialogGone}
    >
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
