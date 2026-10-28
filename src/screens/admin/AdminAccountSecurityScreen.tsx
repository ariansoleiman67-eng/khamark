/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import {
  getAuthState,
  reloadUser,
  sendEmailVerification,
} from '../../services/auth';
import ReauthModal, { ReauthModalHandle } from '../../components/ReauthModal';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  accent: '#FF7622',
  heading: '#1A1D26',
  body: '#32343E',
  muted: '#8F95A3',
  border: '#E8ECF0',
  chipGreen: '#E8F8EF',
  chipGreenText: '#1DAA5A',
  chipOrange: '#FFF3EB',
  chipOrangeText: '#E56B10',
  chipGray: '#F0F2F5',
  chipGrayText: '#8F95A3',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { card: 20, chip: 10, back: 22 };

// ─── Chip Component ─────────────────────────────────────
const Chip = ({ label, variant, isDark, theme }: { label: string; variant: 'green' | 'orange' | 'gray'; isDark?: boolean; theme?: any }) => {
  let bg: string, color: string;
  if (isDark && theme) {
    bg = variant === 'green' ? 'rgba(46,204,113,0.15)' : variant === 'orange' ? theme.colors.primary + '20' : 'rgba(255,255,255,0.08)';
    color = variant === 'green' ? '#2ECC71' : variant === 'orange' ? theme.colors.primary : 'rgba(255,255,255,0.5)';
  } else {
    bg = variant === 'green' ? LUX.chipGreen : variant === 'orange' ? LUX.chipOrange : LUX.chipGray;
    color = variant === 'green' ? LUX.chipGreenText : variant === 'orange' ? LUX.chipOrangeText : LUX.chipGrayText;
  }
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text allowFontScaling={false} style={[styles.chipText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
    </View>
  );
};

// ─── Row Item Component ─────────────────────────────────
const RowItem = ({
  icon, label, value, chip, chipVariant = 'gray',
  actionLabel, onAction, loading, isDark, theme,
}: {
  icon: string; label: string; value: string;
  chip?: string; chipVariant?: 'green' | 'orange' | 'gray';
  actionLabel?: string; onAction?: () => void;
  loading?: boolean; isDark?: boolean; theme?: any;
}) => (
  <View style={styles.row}>
    <View style={styles.rowIcon}>
      <Ionicons name={icon as any} size={20} color={isDark && theme ? theme.colors.textSecondary : LUX.muted} />
    </View>
    <View style={styles.rowContent}>
      <Text allowFontScaling={false} style={[styles.rowLabel, isDark && theme && { color: theme.colors.text }]}>{label}</Text>
      <View style={styles.rowValueRow}>
        <Text allowFontScaling={false} style={[styles.rowValue, isDark && theme && { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{value}</Text>
        {chip && <Chip label={chip} variant={chipVariant} isDark={isDark} theme={theme} />}
      </View>
    </View>
    {actionLabel && onAction && (
      <TouchableOpacity onPress={onAction} style={styles.rowAction} activeOpacity={0.6} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color={isDark && theme ? theme.colors.primary : LUX.accent} />
        ) : (
          <Text allowFontScaling={false} style={[styles.rowActionText, isDark && theme && { color: theme.colors.primary }]}>{actionLabel}</Text>
        )}
      </TouchableOpacity>
    )}
  </View>
);

// ─── Mask Utilities ─────────────────────────────────────
const maskEmail = (email: string) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  // Cap the bullets so long phone-based locals don't make the masked email
  // huge (which forced adjustsFontSizeToFit to shrink it to an unreadable size).
  return `${local.slice(0, 2)}${'•'.repeat(Math.min(Math.max(local.length - 2, 3), 4))}@${domain}`;
};

const maskPhone = (phone: string) => {
  if (!phone) return '';
  if (phone.length <= 5) return phone;
  return `${phone.slice(0, 4)} ••• ${phone.slice(-2)}`;
};

/**
 * Admin Account & Security Screen
 * Displays contact info and sign-in methods for admin users.
 */
const AdminAccountSecurityScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { t, i18n } = useTranslation();
  // Global auto-RTL is disabled in App.tsx, so I18nManager.isRTL alone is always
  // false — the language check is what actually flips the chevron.
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { theme, isDark } = useTheme();
  const reauthRef = useRef<ReauthModalHandle>(null);

  const [verifyLoading, setVerifyLoading] = useState(false);

  // Reload data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      reloadUser().then(() => refreshUser());
    }, [])
  );

  // ─── Derived State ──────────────────────────────────────
  const authState = getAuthState(user?.email);

  // Only the {phone}@khamarkapp.internal / {phone}@asankaryapp.internal placeholder is hidden.
  const isInternalEmail = (e: string) => e.includes('@khamarkapp.') || e.includes('@asankaryapp.');

  const authEmail = authState.email || '';
  const isAuthEmailInternal = isInternalEmail(authEmail);

  const firestoreEmail = user?.email || '';
  const isFirestoreEmailInternal = isInternalEmail(firestoreEmail);

  const displayEmail = !isFirestoreEmailInternal && firestoreEmail
    ? firestoreEmail
    : !isAuthEmailInternal && authEmail
      ? authEmail
      : '';

  const emailLinkedToAuth = !isAuthEmailInternal && !!authEmail;
  const emailVerified = emailLinkedToAuth && authState.emailVerified;
  const needsEmailLinking = !!displayEmail && !emailLinkedToAuth;

  const userPhone = user?.phone || authState.phone || '';
  const phoneVerified = user?.phoneVerified ?? !!authState.phone;
  const hasPhone = !!userPhone;

  const { hasPassword } = authState;

  // ─── Actions ──────────────────────────────────────────
  const handleUpdateEmail = () => {
    navigation.navigate('UpdateEmail' as any);
  };

  const handleVerifyEmail = async () => {
    if (verifyLoading) return;
    setVerifyLoading(true);
    try {
      await sendEmailVerification();
      Alert.alert(
        t('profile.accountSecurity.verifyEmailSentTitle', { defaultValue: 'Verification Sent' }),
        t('profile.accountSecurity.verifyEmailSentMessage', { defaultValue: 'Check your inbox and tap the link to verify your email.' }),
      );
    } catch (e: any) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), e?.message || t('profile.accountSecurity.failedToVerify', { defaultValue: 'Failed to send verification email.' }));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleUpdatePhone = () => {
    navigation.navigate('UpdatePhone' as any, { hasExisting: hasPhone });
  };

  const handleChangePassword = () => {
    navigation.navigate('AdminChangePassword' as any);
  };

  const handleBack = () => navigation.goBack();

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: isDark ? theme.colors.background : LUX.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back ── */}
        <TouchableOpacity style={[styles.backButton, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={isDark ? theme.colors.text : LUX.body} />
        </TouchableOpacity>

        {/* ── Title ── */}
        <Text allowFontScaling={false} style={[styles.title, isDark && { color: theme.colors.text }]}>
          {t('admin.settings.accountSecurity', { defaultValue: 'Account & Security' })}
        </Text>
        <Text allowFontScaling={false} style={[styles.subtitle, isDark && { color: theme.colors.textSecondary }]}>
          {t('admin.settings.accountSecuritySubtitle', { defaultValue: 'Manage your contact info and sign-in methods.' })}
        </Text>

        {/* ════════════════════════════════════════════════════
            CONTACT SECTION
        ════════════════════════════════════════════════════ */}
        <Text allowFontScaling={false} style={[styles.sectionLabel, isDark && { color: theme.colors.textSecondary }]}>
          {t('profile.accountSecurity.contact', { defaultValue: 'CONTACT' })}
        </Text>
        <View style={[styles.card, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {/* Email */}
          <RowItem
            icon="mail-outline"
            label={t('profile.accountSecurity.email', { defaultValue: 'Email' })}
            value={displayEmail ? maskEmail(displayEmail) : t('profile.accountSecurity.notAdded', { defaultValue: 'Not added' })}
            chip={displayEmail
              ? needsEmailLinking
                ? t('profile.accountSecurity.recommended', { defaultValue: 'Recommended' })
                : emailVerified
                  ? t('profile.accountSecurity.verified', { defaultValue: 'Verified' })
                  : t('profile.accountSecurity.unverified', { defaultValue: 'Unverified' })
              : undefined}
            chipVariant={displayEmail && emailVerified ? 'green' : 'orange'}
            actionLabel={!displayEmail
              ? t('profile.accountSecurity.add', { defaultValue: 'Add' })
              : needsEmailLinking
                ? t('profile.accountSecurity.update', { defaultValue: 'Update' })
                : !emailVerified
                  ? t('profile.accountSecurity.verify', { defaultValue: 'Verify' })
                  : t('profile.accountSecurity.update', { defaultValue: 'Update' })}
            onAction={!displayEmail || needsEmailLinking ? handleUpdateEmail : !emailVerified ? handleVerifyEmail : handleUpdateEmail}
            loading={verifyLoading}
            isDark={isDark}
            theme={theme}
          />

          <View style={[styles.divider, isDark && { backgroundColor: theme.colors.border }]} />

          {/* Phone */}
          <RowItem
            icon="call-outline"
            label={t('profile.accountSecurity.phone', { defaultValue: 'Phone' })}
            value={hasPhone ? maskPhone(userPhone) : t('profile.accountSecurity.notAdded', { defaultValue: 'Not added' })}
            chip={hasPhone ? (phoneVerified ? t('profile.accountSecurity.verified', { defaultValue: 'Verified' }) : t('profile.accountSecurity.recommended', { defaultValue: 'Recommended' })) : t('profile.accountSecurity.recommended', { defaultValue: 'Recommended' })}
            chipVariant={hasPhone && phoneVerified ? 'green' : 'orange'}
            actionLabel={hasPhone ? t('profile.accountSecurity.update', { defaultValue: 'Update' }) : t('profile.accountSecurity.add', { defaultValue: 'Add' })}
            onAction={handleUpdatePhone}
            isDark={isDark}
            theme={theme}
          />
        </View>

        {/* ════════════════════════════════════════════════════
            SIGN-IN METHODS SECTION
        ════════════════════════════════════════════════════ */}
        <Text allowFontScaling={false} style={[styles.sectionLabel, isDark && { color: theme.colors.textSecondary }]}>
          {t('profile.accountSecurity.signInMethods', { defaultValue: 'SIGN-IN METHODS' })}
        </Text>
        <View style={[styles.card, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {/* Password */}
          <RowItem
            icon="lock-closed-outline"
            label={t('profile.accountSecurity.password', { defaultValue: 'Password' })}
            value={hasPassword ? '••••••••' : t('profile.accountSecurity.notSet', { defaultValue: 'Not set' })}
            chip={hasPassword ? t('profile.accountSecurity.set', { defaultValue: 'Set' }) : undefined}
            chipVariant="green"
            actionLabel={hasPassword ? t('profile.accountSecurity.change', { defaultValue: 'Change' }) : t('profile.accountSecurity.set', { defaultValue: 'Set' })}
            onAction={handleChangePassword}
            isDark={isDark}
            theme={theme}
          />
        </View>
      </ScrollView>

      {/* Reauth Modal */}
      <ReauthModal ref={reauthRef} />
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: LUX.surface,
    borderColor: LUX.border,
    borderRadius: RADIUS.back,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 44,
  },
  card: {
    backgroundColor: LUX.surface,
    borderColor: LUX.border,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
    paddingVertical: SPACING.xs,
  },
  chip: {
    borderRadius: RADIUS.chip,
    marginLeft: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  container: {
    backgroundColor: LUX.bg,
    flex: 1,
  },
  divider: {
    backgroundColor: LUX.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  rowAction: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  rowActionText: {
    color: LUX.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  rowContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  rowIcon: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowLabel: {
    color: LUX.body,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowValue: {
    color: LUX.muted,
    flex: 1,
    fontSize: 14,
  },
  rowValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  sectionLabel: {
    color: LUX.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: LUX.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  title: {
    color: LUX.heading,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
});

export default AdminAccountSecurityScreen;
