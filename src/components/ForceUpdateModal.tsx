import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import appConfigService, { AppConfig } from '../services/appConfigService';

interface ForceUpdateModalProps {
  onCheckComplete?: () => void;
}

const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({ onCheckComplete }) => {
  const { t, i18n } = useTranslation();

  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);
  const [openingStore, setOpeningStore] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [mode, setMode] = useState<'force' | 'soft'>('force');

  const isMountedRef = useRef(true);

  const currentVersion = useMemo(() => {
    try {
      return appConfigService.getCurrentVersion();
    } catch {
      return '—';
    }
  }, []);

  const getLocalizedMessage = useCallback(
    (cfg: AppConfig | null | undefined) => {
      if (!cfg) {
        return t('update.message', {
          defaultValue:
            'A critical update is required to continue using the app. Please update to the latest version.',
        });
      }

      const lang = i18n.language?.toLowerCase?.() || 'en';

      if (lang.startsWith('ar') && cfg.updateMessageAr?.trim()) {
        return cfg.updateMessageAr;
      }

      if ((lang.startsWith('ku') || lang.startsWith('ckb')) && cfg.updateMessageKu?.trim()) {
        return cfg.updateMessageKu;
      }

      if (cfg.updateMessage?.trim()) {
        return cfg.updateMessage;
      }

      return t('update.message', {
        defaultValue:
          'A critical update is required to continue using the app. Please update to the latest version.',
      });
    },
    [i18n.language, t]
  );

  const finishCheck = useCallback(() => {
    onCheckComplete?.();
  }, [onCheckComplete]);

  const checkForUpdate = useCallback(async () => {
    try {
      setChecking(true);

      const { mode: updateMode, config: cfg } = await appConfigService.evaluateUpdate();

      if (!isMountedRef.current) return;

      if (updateMode === 'none') {
        setVisible(false);
        finishCheck();
        return;
      }

      // SOFT: respect a prior "Later" until the next newer build ships
      if (updateMode === 'soft') {
        const latestCode = Platform.OS === 'ios' ? cfg.latestBuildNumber : cfg.latestVersionCode;
        if (await appConfigService.wasSoftDismissed(latestCode)) {
          if (!isMountedRef.current) return;
          setVisible(false);
          finishCheck();
          return;
        }
      }

      setMode(updateMode);
      setConfig(cfg);
      setUpdateMessage(
        updateMode === 'soft'
          ? (appConfigService.getLocalizedSoftMessage(cfg, i18n.language) ||
             t('update.softMessage', { defaultValue: 'A new version of Haryad Auto Part is available with improvements and fixes.' }))
          : getLocalizedMessage(cfg)
      );
      setVisible(true);
    } catch (error) {
      console.error('Error checking for update:', error);

      if (!isMountedRef.current) return;

      setVisible(false);
      finishCheck();
    } finally {
      if (isMountedRef.current) {
        setChecking(false);
      }
    }
  }, [finishCheck, getLocalizedMessage, i18n.language, t]);

  useEffect(() => {
    isMountedRef.current = true;

    // Auto-sync current app version to Firestore (fire-and-forget)
    appConfigService.syncVersionToFirestore().catch(() => {});

    checkForUpdate();

    return () => {
      isMountedRef.current = false;
    };
  }, [checkForUpdate]);

  const handleUpdate = useCallback(async () => {
    if (!config || openingStore) return;

    try {
      setOpeningStore(true);
      await appConfigService.openStore(config);
    } catch (error) {
      console.error('Error opening store:', error);
    } finally {
      if (isMountedRef.current) {
        setOpeningStore(false);
      }
    }
  }, [config, openingStore]);

  const storeIconName = Platform.OS === 'ios' ? 'apple' : 'google-play';
  const storeName =
    Platform.OS === 'ios'
      ? t('update.appStore', { defaultValue: 'App Store' })
      : t('update.playStore', { defaultValue: 'Google Play' });

  const updateButtonLabel =
    Platform.OS === 'ios'
      ? t('update.buttonIos', { defaultValue: 'Update on App Store' })
      : t('update.buttonAndroid', { defaultValue: 'Update on Google Play' });

  if (checking) {
    return null;
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.backdrop}>
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />

        <View style={styles.card}>
          <View style={styles.iconShell}>
            <View style={styles.iconRing}>
              <MaterialCommunityIcons
                name="cellphone-arrow-down"
                size={42}
                color="#F4C16C"
              />
            </View>
          </View>

          <View style={styles.badge}>
            <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {mode === 'soft'
                ? t('update.available', { defaultValue: 'Update Available' })
                : t('update.required', { defaultValue: 'Mandatory Update' })}
            </Text>
          </View>

          <Text allowFontScaling={false} style={styles.title}>
            {mode === 'soft'
              ? t('update.softTitle', { defaultValue: 'Update Available' })
              : t('update.title', { defaultValue: 'Update Required' })}
          </Text>

          <Text allowFontScaling={false} style={styles.message}>{updateMessage}</Text>

          <View style={styles.versionPill}>
            <Text allowFontScaling={false} style={styles.versionLabel}>
              {t('update.currentVersionLabel', { defaultValue: 'Current Version' })}
            </Text>
            <View style={styles.versionDivider} />
            <Text allowFontScaling={false} style={styles.versionValue}>{currentVersion}</Text>
          </View>

          <Pressable
            onPress={handleUpdate}
            disabled={openingStore}
            style={({ pressed }) => [
              styles.updateButton,
              openingStore && styles.updateButtonDisabled,
              pressed && !openingStore && styles.updateButtonPressed,
            ]}
          >
            {openingStore ? (
              <ActivityIndicator size="small" color="#0B0B0F" />
            ) : (
              <>
                <MaterialCommunityIcons
                  name={storeIconName}
                  size={20}
                  color="#0B0B0F"
                />
                <Text allowFontScaling={false} style={styles.updateButtonText}>{updateButtonLabel}</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              // On a soft notice, remember the dismissal so we don't nag until the next build
              if (mode === 'soft' && config) {
                const latestCode = Platform.OS === 'ios' ? config.latestBuildNumber : config.latestVersionCode;
                appConfigService.markSoftDismissed(latestCode).catch(() => {});
              }
              setVisible(false);
              finishCheck();
            }}
            style={({ pressed }) => [
              styles.laterButton,
              pressed && styles.laterButtonPressed,
            ]}
          >
            <Text allowFontScaling={false} style={styles.laterButtonText}>
              {t('update.later', { defaultValue: 'Later' })}
            </Text>
          </Pressable>

          <Text allowFontScaling={false} style={styles.storeHint}>
            {t('update.storeHint', {
              defaultValue: `You will be redirected to ${storeName}.`,
            })}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#06070A',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    position: 'relative',
  },

  badge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(244, 193, 108, 0.10)',
    borderColor: 'rgba(244, 193, 108, 0.24)',
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  badgeText: {
    color: '#F4C16C',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  card: {
    alignSelf: 'center',
    backgroundColor: '#101116',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    borderWidth: 1,
    elevation: 16,
    maxWidth: 430,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    width: '100%',
  },

  glowOne: {
    backgroundColor: 'rgba(244, 193, 108, 0.10)',
    borderRadius: 999,
    height: 180,
    left: -40,
    position: 'absolute',
    top: '18%',
    width: 180,
  },

  glowTwo: {
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
    borderRadius: 999,
    bottom: '14%',
    height: 220,
    position: 'absolute',
    right: -50,
    width: 220,
  },

  iconRing: {
    alignItems: 'center',
    backgroundColor: 'rgba(244, 193, 108, 0.08)',
    borderColor: 'rgba(244, 193, 108, 0.22)',
    borderRadius: 45,
    borderWidth: 1,
    height: 90,
    justifyContent: 'center',
    width: 90,
  },

  iconShell: {
    alignItems: 'center',
    marginBottom: 18,
  },

  message: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    lineHeight: 27,
    marginBottom: 22,
    textAlign: 'center',
  },

  storeHint: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 14,
    textAlign: 'center',
  },

  updateButton: {
    alignItems: 'center',
    backgroundColor: '#F4C16C',
    borderRadius: 18,
    elevation: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
    shadowColor: '#F4C16C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },

  updateButtonDisabled: {
    opacity: 0.75,
  },

  updateButtonPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },

  updateButtonText: {
    color: '#0B0B0F',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginLeft: 10,
  },

  versionDivider: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    height: 14,
    marginHorizontal: 10,
    width: 1,
  },

  versionLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    fontWeight: '600',
  },

  versionPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#171922',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  versionValue: {
    color: '#F4C16C',
    fontSize: 13,
    fontWeight: '800',
  },

  laterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 10,
  },

  laterButtonPressed: {
    opacity: 0.6,
  },

  laterButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default ForceUpdateModal;