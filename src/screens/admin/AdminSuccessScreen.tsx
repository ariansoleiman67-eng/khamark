/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  accent: '#FF7622',
  accentSoft: '#FF762215',
  heading: '#1A1D26',
  muted: '#8F95A3',
  success: '#2ECC71',
  successSoft: '#2ECC7115',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };

/**
 * Admin Screen 5 — Success
 * "Store created" checkmark animation → Enter dashboard.
 */
const AdminSuccessScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const storeName = route.params?.storeName || t('auth.adminSetup.yourStore', { defaultValue: 'Your Store' });

  const checkScale = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(buttonFade, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Refresh auth in background so admin role is loaded
    const loadAuth = async () => {
      try { await refreshUser(); } catch (_) { /* ignore */ }
    };
    loadAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnterDashboard = async () => {
    try {
      await refreshUser();
    } catch (_) { /* ignore */ }
    navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {/* ── Checkmark ── */}
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
          <Ionicons name="checkmark" size={40} color={LUX.success} />
        </Animated.View>

        {/* ── Text ── */}
        <Animated.View style={{ opacity: fadeIn, alignItems: 'center' }}>
          <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>{t('auth.adminSetup.storeCreated', { defaultValue: 'Store created' })}</Text>
          <Text allowFontScaling={false} style={[styles.storeName, { color: theme.colors.primary }]}>{storeName}</Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {t('auth.adminSetup.successSubtitle', { defaultValue: 'Your admin account is ready. You can manage your store from the dashboard.' })}
          </Text>
        </Animated.View>

        {/* ── Enter Dashboard ── */}
        <Animated.View style={{ opacity: buttonFade, width: '100%' }}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleEnterDashboard}
            activeOpacity={0.85}
          >
            <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('auth.adminSetup.enterDashboard', { defaultValue: 'Enter dashboard' })}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  checkCircle: {
    alignItems: 'center',
    backgroundColor: LUX.successSoft,
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    width: 88,
  },
  container: {
    backgroundColor: LUX.bg,
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: LUX.accent,
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    marginTop: SPACING.xl + SPACING.lg,
  },
  primaryButtonText: {
    color: LUX.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  storeName: {
    color: LUX.accent,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  subtitle: {
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    textAlign: 'center',
  },
  title: {
    color: LUX.heading,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});

export default AdminSuccessScreen;
