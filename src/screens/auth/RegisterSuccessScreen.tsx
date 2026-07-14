/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import AppText from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  accent: '#FF7622',
  heading: '#1A1D26',
  muted: '#8F95A3',
  success: '#2ECC71',
  successSoft: '#2ECC7115',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 };

/**
 * Screen 5 — Success (premium feel)
 * Checkmark animation, refreshes auth, then auto-continues.
 */
const RegisterSuccessScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();

  const showVerifyEmail = route.params?.method === 'email';

  // Animations
  const checkScale = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subtle check animation
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

    // Refresh auth state, then auto-continue after 2 seconds
    const doRefreshAndContinue = async () => {
      try {
        await refreshUser();
      } catch (e) {
        // ignore — user is still signed in via Firebase
      }
      setTimeout(() => {
        handleContinue();
      }, 2000);
    };

    doRefreshAndContinue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {/* ── Checkmark Circle ── */}
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
          <Ionicons name="checkmark" size={40} color={LUX.success} />
        </Animated.View>

        {/* ── Text ── */}
        <Animated.View style={{ opacity: fadeIn, alignItems: 'center' }}>
          <AppText style={styles.title}>
            {t('auth.accountCreated', { defaultValue: 'Account created' })}
          </AppText>
          {showVerifyEmail && (
            <AppText style={styles.subtitle}>
              {t('auth.checkEmail', {
                defaultValue: 'Please check your email to verify your account.',
              })}
            </AppText>
          )}
        </Animated.View>

        {/* ── Continue Button ── */}
        <Animated.View style={{ opacity: buttonFade, width: '100%' }}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <AppText style={styles.primaryButtonText}>
              {t('auth.continue', { defaultValue: 'Continue' })}
            </AppText>
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
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    marginTop: SPACING.xl + SPACING.lg,
  },
  primaryButtonText: {
    color: LUX.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xl,
    textAlign: 'center',
  },
  title: {
    color: LUX.heading,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});

export default RegisterSuccessScreen;
