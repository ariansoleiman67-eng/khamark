import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import ErrorBoundary from '../components/ErrorBoundary';


const SCAN_COOLDOWN_MS = 1500; // Prevents rapid-fire scans

/**
 * Full-screen barcode scanner.
 * Scans EAN, UPC, Code128, Code39, QR and auto-navigates to Search with the result.
 * 
 * iOS FIX: Using expo-image-picker for photo capture instead of vision-camera's takePhoto
 * because codeScanner + takePhoto compete for iOS camera hardware and cause native crashes.
 */
const BarcodeScannerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [torch, setTorch] = useState(false);
  const [lastScanned, setLastScanned] = useState('');
  const cooldownRef = useRef(false);
  const cameraRef = useRef<Camera>(null);
  
  // iOS CRASH FIX: Defer camera rendering until AFTER the native screen transition
  // completes. Initializing camera hardware during a UIViewController push animation
  // causes a fatal crash on iOS production builds.
  const [isMounted, setIsMounted] = useState(Platform.OS !== 'ios');

  // Animated scan line
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanLineAnim]);

  // Request permission on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // iOS: Wait for the screen transition to fully complete before mounting camera
  useEffect(() => {
    if (Platform.OS === 'ios' && !isMounted) {
      const task = InteractionManager.runAfterInteractions(() => {
        setIsMounted(true);
      });
      return () => task.cancel();
    }
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: [
      'ean-13',
      'ean-8',
      'upc-a',
      'upc-e',
      'code-128',
      'code-39',
      'qr',
      'codabar',
    ],
    onCodeScanned: (codes) => {
      if (cooldownRef.current || codes.length === 0) return;
      const value = codes[0].value;
      if (!value || value === lastScanned) return;

      cooldownRef.current = true;
      setLastScanned(value);

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to Search with the scanned barcode
      navigation.navigate({
        name: 'Search',
        params: { query: value },
        merge: true,
      });
      // Reset cooldown
      setTimeout(() => {
        cooldownRef.current = false;
      }, SCAN_COOLDOWN_MS);
    },
  });



  // Permission denied state
  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={72} color="#94a3b8" />
        <Text allowFontScaling={false} style={styles.permissionTitle}>{t('scanner.permissionDenied')}</Text>
        <Text allowFontScaling={false} style={styles.permissionMessage}>{t('scanner.permissionMessage')}</Text>
        <Pressable
          style={styles.permissionButton}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }}
        >
          <Text allowFontScaling={false} style={styles.permissionButtonText}>{t('scanner.openSettings')}</Text>
        </Pressable>
        <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text allowFontScaling={false} style={styles.backLinkText}>{t('common.goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  // No camera device OR not yet mounted (iOS transition guard)
  if (!device || !isMounted) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text allowFontScaling={false} style={[styles.permissionTitle, { marginTop: 20 }]}>
          {!isMounted ? t('scanner.initializing', 'Initializing camera...') : t('scanner.noCamera')}
        </Text>
        <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text allowFontScaling={false} style={styles.backLinkText}>{t('common.goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240],
  });

  return (
    <View style={styles.container}>
      {/* Camera */}
      {isFocused ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          codeScanner={codeScanner}
          torch={torch ? 'on' : 'off'}
          photo={false}
        />
      ) : <View style={StyleSheet.absoluteFill} />}

      {/* Dark overlay with transparent center */}
      <View style={styles.overlay}>
        {/* Top */}
        <View style={styles.overlayDark} />

        {/* Middle row: left + viewfinder + right */}
        <View style={styles.middleRow}>
          <View style={styles.overlayDark} />

          {/* Viewfinder cutout */}
          <View style={styles.viewfinder}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Animated scan line */}
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanLineTranslateY }] },
              ]}
            />
          </View>

          <View style={styles.overlayDark} />
        </View>

        {/* Bottom */}
        <View style={[styles.overlayDark, styles.bottomOverlay]}>
          <Text allowFontScaling={false} style={styles.hintText}>{t('scanner.hint')}</Text>

          {/* Last scanned value */}
          {lastScanned ? (
            <View style={styles.lastScannedBadge}>
              <Ionicons name="barcode-outline" size={16} color="#fff" />
              <Text allowFontScaling={false} style={styles.lastScannedText}>{lastScanned}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Top bar: close + title + flash */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <Text allowFontScaling={false} style={styles.title}>{t('scanner.title')}</Text>

        <Pressable
          style={styles.iconButton}
          onPress={() => setTorch((v) => !v)}
          hitSlop={12}
        >
          <Ionicons
            name={torch ? 'flash' : 'flash-off'}
            size={24}
            color={torch ? '#fbbf24' : '#fff'}
          />
        </Pressable>
      </View>
    </View>
  );
};

const VIEWFINDER_SIZE = 280;
const CORNER_SIZE = 28;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  backLink: {
    marginTop: 16,
    padding: 8,
  },
  backLinkText: {
    color: '#64748b',
    fontSize: 16,
  },
  bottomOverlay: {
    alignItems: 'center',
    paddingTop: 32,
  },
  container: {
    backgroundColor: '#000',
    flex: 1,
  },
  corner: {
    borderColor: '#3b82f6',
    height: CORNER_SIZE,
    position: 'absolute',
    width: CORNER_SIZE,
  },
  cornerBL: {
    borderBottomLeftRadius: 8,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    bottom: 0,
    left: 0,
  },
  cornerBR: {
    borderBottomRightRadius: 8,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    bottom: 0,
    right: 0,
  },
  cornerTL: {
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 8,
    borderTopWidth: CORNER_WIDTH,
    left: 0,
    top: 0,
  },
  cornerTR: {
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 8,
    borderTopWidth: CORNER_WIDTH,
    right: 0,
    top: 0,
  },
  hintText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  lastScannedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.85)',
    borderRadius: 20,
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lastScannedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  middleRow: {
    flexDirection: 'row',
    height: VIEWFINDER_SIZE,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayDark: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
  },
  permissionButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  permissionMessage: {
    color: '#94a3b8',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  permissionTitle: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    textAlign: 'center',
  },
  scanLine: {
    backgroundColor: '#3b82f6',
    borderRadius: 2,
    height: 3,
    left: 8,
    opacity: 0.8,
    position: 'absolute',
    right: 8,
    top: 0,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  viewfinder: {
    height: VIEWFINDER_SIZE,
    width: VIEWFINDER_SIZE,
  },

});

// Wrap in ErrorBoundary to prevent native iOS crashes from killing the app
const BarcodeScannerScreenWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <BarcodeScannerScreen />
  </ErrorBoundary>
);

export default BarcodeScannerScreenWithBoundary;
