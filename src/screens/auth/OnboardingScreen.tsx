import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  I18nManager,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import Logo from '../../components/Logo';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const ACCENT = '#A61920'; // Khamark Luxury Red

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const colors = theme.colors as any;
  const isRTL =
    I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const textAlign = isRTL ? 'right' : 'left';

  const finish = useCallback(async () => {
    try {
      await AsyncStorage.setItem('onboarding_complete', 'true');
    } catch {
      // non-fatal: worst case the user sees onboarding again next launch
    }
    onComplete();
  }, [onComplete]);

  const points: { key: string; fallback: string }[] = [
    { key: 'onboarding.point1', fallback: 'Browse the latest phones and accessories.' },
    { key: 'onboarding.point2', fallback: 'Add to cart and check out securely.' },
    { key: 'onboarding.point3', fallback: 'Fast delivery across Iraq.' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoBadge}>
          <Logo size={88} />
        </View>

        <Text style={[styles.title, { textAlign, color: colors.text }]}>
          {t('onboarding.welcome', { defaultValue: 'Welcome to Khamark' })}
        </Text>
        <Text style={[styles.subtitle, { textAlign, color: colors.textSecondary }]}>
          {t('onboarding.subtitle', {
            defaultValue: 'Your online store for the products you love.',
          })}
        </Text>

        <View style={styles.points}>
          {points.map(p => (
            <View
              key={p.key}
              style={[styles.pointRow, isRTL && styles.pointRowRTL]}
            >
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.pointText, { textAlign, color: colors.text }]}>
                {t(p.key, { defaultValue: p.fallback })}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={finish}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>
            {t('onboarding.getStarted', { defaultValue: 'Get Started' })}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  logoBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 28,
  },
  logoText: { color: '#FFFFFF', fontSize: 44, fontWeight: '800' },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2B2B2B',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#8A8A8E',
    marginBottom: 28,
    lineHeight: 22,
  },
  points: { gap: 14 },
  pointRow: { flexDirection: 'row', alignItems: 'center' },
  pointRowRTL: { flexDirection: 'row-reverse' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
    marginHorizontal: 12,
  },
  pointText: { flex: 1, fontSize: 15, color: '#2B2B2B' },
  footer: { paddingHorizontal: 28, paddingBottom: 28, paddingTop: 8 },
  cta: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

export default OnboardingScreen;
