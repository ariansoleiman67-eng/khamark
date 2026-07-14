/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
import React, { useState, useCallback, useRef } from 'react';
import { isSyntheticEmail } from '../../utils/hashUtils';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { ImageService } from '../../services/imageService';
import { AuthService } from '../../services/authService';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import {
  isAppleSignInAvailable,
  isGoogleSignInAvailable,
  getAuthState,
  reloadUser,
  linkApple,
  unlinkApple,
  unlinkGoogle,
  signInWithGoogle,
  sendEmailVerification,
} from '../../services/auth';
import ReauthModal, { ReauthModalHandle } from '../../components/ReauthModal';
import { RootStackParamList } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// ─── Luxury Design Tokens ───────────────────────────────
const LUX = {
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  inputBg: '#F4F6F9',
  accent: '#FF7622',
  heading: '#1A1D26',
  body: '#32343E',
  muted: '#8F95A3',
  placeholder: '#B0B5C3',
  border: '#E8ECF0',
  error: '#E84855',
  success: '#2ECC71',
  chipBg: '#F0F2F5',
  chipGreen: '#E8F8EF',
  chipGreenText: '#1DAA5A',
  chipOrange: '#FFF3EB',
  chipOrangeText: '#E56B10',
  chipGray: '#F0F2F5',
  chipGrayText: '#8F95A3',
};

const SPACING = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28 };
const RADIUS = { card: 20, chip: 10, back: 22, button: 18 };

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
  icon,
  label,
  value,
  chip,
  chipVariant = 'gray',
  actionLabel,
  onAction,
  loading,
  isDark,
  theme,
}: {
  icon: string;
  label: string;
  value: string;
  chip?: string;
  chipVariant?: 'green' | 'orange' | 'gray';
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  isDark?: boolean;
  theme?: any;
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

const getMonogram = (name: string): string => {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? `${p[0][0]}${p[1][0]}` : name[0]).toUpperCase();
};

/**
 * Account & Security Hub
 * Luxury hub with contact info and sign-in methods.
 */
const AccountSecurityScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const reauthRef = useRef<ReauthModalHandle>(null);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Reauth handler — passed to all sensitive actions
  const requestReauth = useCallback(() => {
    return reauthRef.current?.requestReauth() ?? Promise.reject(new Error('ReauthModal not ready'));
  }, []);

  // Reload data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      reloadUser().then(() => refreshUser());
      isAppleSignInAvailable().then(setAppleAvailable);
      setGoogleAvailable(isGoogleSignInAvailable());
    }, [])
  );

  // ─── Derived State (native Firebase, single source of truth) ──
  const authState = getAuthState(user?.email);

  // Auth email = what Firebase Auth knows (could be internal @asankaryapp.internal for phone signups)
  const authEmail = authState.email || '';
  const isAuthEmailInternal = isSyntheticEmail(authEmail) || authEmail.includes('@asankaryapp.');

  // Firestore email = what the user added as their real email
  const firestoreEmail = user?.email || '';
  const isFirestoreEmailInternal = isSyntheticEmail(firestoreEmail) || firestoreEmail.includes('@asankaryapp.');

  // Display the real email (prefer Firestore, fall back to Auth if it's real)
  const displayEmail = !isFirestoreEmailInternal && firestoreEmail
    ? firestoreEmail
    : !isAuthEmailInternal && authEmail
      ? authEmail
      : '';

  // Email is truly verified only if Auth has a REAL email AND it's verified
  // If Auth email is internal but Firestore has a real email, it's not linked to Auth yet
  const emailLinkedToAuth = !isAuthEmailInternal && !!authEmail;
  const emailVerified = emailLinkedToAuth && authState.emailVerified;
  // Show "Verify" only when Auth has the real email but it's unverified
  // Show "Update" when the real email isn't linked to Auth yet (needs verifyBeforeUpdateEmail)
  const needsEmailLinking = !!displayEmail && !emailLinkedToAuth;

  const userPhone = user?.phone || authState.phone || '';
  const phoneVerified = user?.phoneVerified ?? !!authState.phone;
  const hasPhone = !!userPhone;

  // Profile (name + vehicle) — edited on the focused EditProfile screen.
  const fullName = user?.fullName || (user as any)?.name || '';
  const vehicle = (user as any)?.vehicleInfo || {};
  const vehicleSummary = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  const handlePickAvatar = async () => {
    if (!user || uploadingImage) return;
    try {
      const result: any = await ImageService.pickImage({ quality: 0.8 });
      const uri = result?.assets?.[0]?.uri;
      if (uri) {
        setUploadingImage(true);
        const upload = await ImageService.uploadImage(uri);
        if (upload?.url) {
          await AuthService.updateUserProfile(user.uid, { profileImageUrl: upload.url } as any);
          await refreshUser();
        }
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || 'Failed to update photo');
    } finally {
      setUploadingImage(false);
    }
  };

  const startEditName = () => { setNameInput(fullName); setEditingName(true); };
  const handleSaveName = async () => {
    const nm = nameInput.trim();
    if (!user || nm.length < 2) { setEditingName(false); return; }
    try {
      await AuthService.updateUserProfile(user.uid, { name: nm, fullName: nm } as any);
      await refreshUser();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || 'Failed to save name');
    }
    setEditingName(false);
  };

  const { hasPassword, hasGoogle, hasApple: hasAppleProvider } = authState;

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
      Alert.alert('Error', e?.message || 'Failed to send verification email.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleUpdatePhone = () => {
    navigation.navigate('UpdatePhone' as any, { hasExisting: hasPhone });
  };

  const handleChangePassword = () => {
    navigation.navigate('ChangePassword' as any);
  };

  const handleConnectGoogle = async () => {
    if (googleLoading || appleLoading) return; // Prevent double-tap
    if (hasGoogle) {
      // Disconnect via security service (handles lockout + reauth)
      try {
        setGoogleLoading(true);
        await unlinkGoogle(requestReauth);
        await refreshUser();
      } catch (error: any) {
        if (error.message === 'Reauth cancelled') return;
        if (error.message?.includes('Add another sign-in method')) {
          Alert.alert(
            t('profile.accountSecurity.cannotDisconnect', { defaultValue: 'Cannot disconnect' }),
            t('profile.accountSecurity.addMethodFirstGoogle', { defaultValue: 'Add another sign-in method before disconnecting Google.' }),
          );
        } else {
          Alert.alert(t('common.error'), error.message || t('profile.accountSecurity.disconnectGoogleFailed', { defaultValue: 'Failed to disconnect Google.' }));
        }
      } finally {
        setGoogleLoading(false);
      }
    } else {
      // Connect — TODO: Phase 2 will use linkGoogle() through securityService
      // For now, keep existing signInWithGoogle approach
      try {
        setGoogleLoading(true);
        await signInWithGoogle();
        await reloadUser();
        await refreshUser();
        Alert.alert(t('profile.accountSecurity.connected', { defaultValue: 'Connected' }), t('profile.accountSecurity.googleConnected', { defaultValue: 'Google account connected.' }));
      } catch (error: any) {
        if (error.code === 'auth/credential-already-in-use') {
          Alert.alert(t('profile.accountSecurity.alreadyLinked', { defaultValue: 'Already linked' }), t('profile.accountSecurity.googleAlreadyLinked', { defaultValue: 'This Google account is linked to another account.' }));
        } else {
          Alert.alert(t('common.error'), error.message || t('profile.accountSecurity.connectGoogleFailed', { defaultValue: 'Failed to connect Google.' }));
        }
      } finally {
        setGoogleLoading(false);
      }
    }
  };

  const handleConnectApple = async () => {
    if (appleLoading || googleLoading) return; // Prevent double-tap
    if (hasAppleProvider) {
      // Disconnect via security service (handles lockout + reauth)
      try {
        setAppleLoading(true);
        await unlinkApple(requestReauth);
        await refreshUser();
      } catch (error: any) {
        if (error.message === 'Reauth cancelled') return;
        if (error.message?.includes('Add another sign-in method')) {
          Alert.alert(
            t('profile.accountSecurity.cannotDisconnect', { defaultValue: 'Cannot disconnect' }),
            t('profile.accountSecurity.addMethodFirstApple', { defaultValue: 'Add another sign-in method before disconnecting Apple.' }),
          );
        } else {
          Alert.alert(t('common.error'), error.message || t('profile.accountSecurity.disconnectAppleFailed', { defaultValue: 'Failed to disconnect Apple.' }));
        }
      } finally {
        setAppleLoading(false);
      }
    } else {
      // Connect via security service (native linkWithCredential)
      try {
        setAppleLoading(true);
        await linkApple();
        await refreshUser();
        Alert.alert(t('profile.accountSecurity.connected', { defaultValue: 'Connected' }), t('profile.accountSecurity.appleConnected', { defaultValue: 'Apple account connected.' }));
      } catch (error: any) {
        if (error.code === 'ERR_REQUEST_CANCELED') return;
        if (error.code === 'auth/credential-already-in-use') {
          Alert.alert(t('profile.accountSecurity.alreadyLinked', { defaultValue: 'Already linked' }), t('profile.accountSecurity.appleAlreadyLinked', { defaultValue: 'This Apple account is linked to another account.' }));
        } else {
          Alert.alert(t('common.error'), error.message || t('profile.accountSecurity.connectAppleFailed', { defaultValue: 'Failed to connect Apple.' }));
        }
      } finally {
        setAppleLoading(false);
      }
    }
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
          <Ionicons name="chevron-back" size={20} color={isDark ? theme.colors.text : LUX.body} />
        </TouchableOpacity>

        {/* ── Hero: photo + name (edit inline) ── */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85} style={styles.avatarWrap}>
            {user?.profileImageUrl ? (
              <Image source={{ uri: user.profileImageUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={[styles.avatarImg, styles.avatarFallback, { backgroundColor: theme.colors.primary }]}>
                <Text allowFontScaling={false} style={styles.avatarMono}>{getMonogram(fullName)}</Text>
              </View>
            )}
            <View style={[styles.camBadge, { backgroundColor: theme.colors.primary }]}>
              {uploadingImage ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={15} color="#fff" />}
            </View>
          </TouchableOpacity>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput allowFontScaling={false} value={nameInput} onChangeText={setNameInput} autoFocus returnKeyType="done" onSubmitEditing={handleSaveName} placeholder={t('profile.accountSecurity.fullName', { defaultValue: 'Full Name' })} placeholderTextColor={LUX.muted} style={[styles.nameInput, isDark && { color: theme.colors.text, borderColor: theme.colors.border }]} />
              <TouchableOpacity onPress={handleSaveName} style={styles.nameSaveBtn} activeOpacity={0.8}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={startEditName} activeOpacity={0.7} style={styles.nameRow}>
              <Text allowFontScaling={false} numberOfLines={1} style={[styles.heroName, isDark && { color: theme.colors.text }]}>{fullName || t('profile.accountSecurity.fullName', { defaultValue: 'Full Name' })}</Text>
              <Ionicons name="pencil" size={15} color={isDark ? theme.colors.textSecondary : LUX.muted} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}
          {!!displayEmail && <Text allowFontScaling={false} numberOfLines={1} style={[styles.heroEmail, isDark && { color: theme.colors.textSecondary }]}>{maskEmail(displayEmail)}</Text>}
        </View>

        {/* ════════════════════════════════════════════════════
            CONTACT SECTION
        ════════════════════════════════════════════════════ */}
        <Text allowFontScaling={false} style={[styles.sectionLabel, isDark && { color: theme.colors.textSecondary }]}>{t('profile.accountSecurity.contact', { defaultValue: 'CONTACT' })}</Text>
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
              : t('profile.accountSecurity.update', { defaultValue: 'Update' })}
            onAction={handleUpdateEmail}
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
        <Text allowFontScaling={false} style={[styles.sectionLabel, isDark && { color: theme.colors.textSecondary }]}>{t('profile.accountSecurity.signInMethods', { defaultValue: 'SIGN-IN METHODS' })}</Text>
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

          {/* Apple */}
          {(Platform.OS === 'ios' || appleAvailable) && (
            <>
              <View style={[styles.divider, isDark && { backgroundColor: theme.colors.border }]} />
              <RowItem
                icon="logo-apple"
                label="Apple"
                value={hasAppleProvider ? t('profile.accountSecurity.connected', { defaultValue: 'Connected' }) : t('profile.accountSecurity.notConnected', { defaultValue: 'Not connected' })}
                chip={hasAppleProvider ? t('profile.accountSecurity.connected', { defaultValue: 'Connected' }) : t('profile.accountSecurity.notConnected', { defaultValue: 'Not connected' })}
                chipVariant={hasAppleProvider ? 'green' : 'gray'}
                actionLabel={hasAppleProvider ? t('profile.accountSecurity.disconnect', { defaultValue: 'Disconnect' }) : t('profile.accountSecurity.connect', { defaultValue: 'Connect' })}
                onAction={handleConnectApple}
                loading={appleLoading}
                isDark={isDark}
                theme={theme}
              />
            </>
          )}

          {/* Google */}
          {googleAvailable && (
            <>
              <View style={[styles.divider, isDark && { backgroundColor: theme.colors.border }]} />
              <RowItem
                icon="logo-google"
                label="Google"
                value={hasGoogle ? t('profile.accountSecurity.connected', { defaultValue: 'Connected' }) : t('profile.accountSecurity.notConnected', { defaultValue: 'Not connected' })}
                chip={hasGoogle ? t('profile.accountSecurity.connected', { defaultValue: 'Connected' }) : t('profile.accountSecurity.notConnected', { defaultValue: 'Not connected' })}
                chipVariant={hasGoogle ? 'green' : 'gray'}
                actionLabel={hasGoogle ? t('profile.accountSecurity.disconnect', { defaultValue: 'Disconnect' }) : t('profile.accountSecurity.connect', { defaultValue: 'Connect' })}
                onAction={handleConnectGoogle}
                loading={googleLoading}
                isDark={isDark}
                theme={theme}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* Reauth Modal — handles requires-recent-login for all actions */}
      <ReauthModal ref={reauthRef} />
    </View>
  );
};

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  avatarWrap: { width: 104, height: 104, marginBottom: 14 },
  avatarImg: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarMono: { color: '#fff', fontSize: 40, fontWeight: '800' },
  camBadge: { position: 'absolute', right: 2, bottom: 2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', maxWidth: '90%' },
  heroName: { fontSize: 22, fontWeight: '800', color: LUX.heading, letterSpacing: -0.3, maxWidth: 250, textAlign: 'center' },
  heroEmail: { fontSize: 13, color: LUX.muted, marginTop: 6 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { minWidth: 180, fontSize: 18, fontWeight: '700', color: LUX.heading, borderBottomWidth: 1.5, borderColor: LUX.border, paddingVertical: 4, textAlign: 'center' },
  nameSaveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: LUX.accent, alignItems: 'center', justifyContent: 'center' },
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

export default AccountSecurityScreen;
