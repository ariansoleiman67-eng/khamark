// Customer-facing form for "sell us your used phone." Submits one row to
// trade_in_requests via tradeInService.createRequest. RLS's insert policy requires
// auth.uid() = user_id (see supabase/migrations/20260801120000_trade_in_requests.sql),
// so a guest reaching this screen would fail at the database with an opaque error —
// gated below, and again at the Profile entry point in ProfileScreen.tsx.
//
// tenantId note: useTenant() only ever resolves a non-null tenantId for a logged-in
// ADMIN — TenantContext clears it to null for everyone else (see the `!isAdmin` branch
// in TenantContext.tsx). A plain shopper therefore has no "current shop" from that
// hook; the other customer screens that read it (Home/Search/Categories) tolerate a
// null tenantId by treating it as "browse everything," but a trade-in is a WRITE that
// must name exactly one shop to review it. We use the admin context value when it's
// present, otherwise ask tradeInService.resolveShopTenantId() to look it up at
// runtime — see that function's comment for how it picks a shop. If it still can't
// (ambiguous or the query failed), submit stays disabled and we tell the user why
// rather than leaving a dead button with no explanation.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  I18nManager,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../components/ThemeProvider';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { SPACING } from '../constants/theme';
import { TRADE_IN_QUESTIONS } from '../constants/tradeInQuestions';
import { validateAnswers, isDuplicateSubmission } from '../utils/tradeIn';
import { tradeInService, resolveShopTenantId } from '../services/tradeInService';
import { brandService, Brand } from '../services/brandService';
import ImageService from '../services/imageService';

const MAX_PHOTOS = 6;

const TradeInRequestScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { tenantId: ctxTenantId } = useTenant();

  // See header note: ctxTenantId is only ever non-null for a logged-in admin. For
  // everyone else, resolve it at runtime instead of depending on an env var nobody
  // is guaranteed to have set.
  const [tenantId, setTenantId] = useState<string | null>(ctxTenantId);

  useEffect(() => {
    if (ctxTenantId) {
      setTenantId(ctxTenantId);
      return;
    }
    let cancelled = false;
    resolveShopTenantId().then((id) => {
      if (!cancelled) setTenantId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [ctxTenantId]);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [deviceBrand, setDeviceBrand] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [storage, setStorage] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pickedPhotos, setPickedPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = React.useRef(false);

  // Deep-link guard: a signed-out visitor can reach this route directly (push
  // notification, share link, stale nav state) even though the Profile entry point
  // hides it. Redirect rather than let the eventual insert fail opaquely against RLS.
  useEffect(() => {
    if (!user?.uid) {
      navigation.navigate('SignIn');
    }
  }, [user?.uid, navigation]);

  // Brands this shop stocks, offered as quick-fill chips under the free-text field —
  // a customer's used phone brand is very often NOT one of them. tenantId is passed
  // through as-is (brandService treats a missing tenant as "no filter").
  useEffect(() => {
    brandService.getActiveBrands(tenantId || undefined)
      .then(setBrands)
      .catch(() => setBrands([]));
  }, [tenantId]);

  const handleAddPhoto = async () => {
    if (submitting || pickedPhotos.length >= MAX_PHOTOS) return;
    const uri = await ImageService.pickImageFromGallery();
    if (uri) setPickedPhotos((prev) => [...prev, uri]);
  };

  const handleRemovePhoto = (index: number) => {
    setPickedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const { valid } = validateAnswers(answers);
    if (!valid || !deviceModel.trim() || !deviceBrand.trim()) {
      Alert.alert(t('common.error'), t('tradeIn.answerAll'));
      return;
    }
    // Synchronous in-flight guard: `disabled={submitting}` is async React state and
    // won't block a rage/double-tap that lands before the re-render commits (mirrors
    // AddEditAddressScreen's savingRef for the same reason).
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Duplicate check BEFORE upload. If this ran after the photo loop below, a
      // duplicate submission would upload every photo to storage and only then
      // abort — nothing ever deletes those, so they'd sit there orphaned forever.
      // Checking first means a duplicate never touches storage at all.
      const mine = await tradeInService.getMyRequests(user!.uid);
      const candidate = { deviceModel: deviceModel.trim(), answers, createdAtMs: Date.now() };
      const existing = mine.map((r) => ({
        deviceModel: r.deviceModel,
        answers: r.answers,
        createdAtMs: new Date(r.createdAt).getTime(),
      }));
      if (isDuplicateSubmission(existing, candidate, Date.now())) {
        Alert.alert(t('common.error'), t('tradeIn.duplicate'));
        return;
      }

      // Photos next: a failed upload must block the request, never fall back to the
      // local file:// path. Storing that path is what made brand logos render for the
      // admin and appear blank for every customer.
      const uploaded: string[] = [];
      for (const localUri of pickedPhotos) {
        const res = await ImageService.uploadImage(localUri);
        if (!res.success || !res.url) {
          Alert.alert(t('common.error'), t('tradeIn.photoFailed'));
          return;
        }
        uploaded.push(res.url);
      }

      await tradeInService.createRequest({
        tenantId: tenantId!,
        userId: user!.uid,
        contactName: user!.name || '',
        contactPhone: user!.phone || '',
        deviceBrand: deviceBrand.trim(),
        deviceModel: deviceModel.trim(),
        storage,
        answers,
        photos: uploaded,
        customerNote: note,
      });
      Alert.alert(t('common.success'), t('tradeIn.submitted'));
      navigation.replace('MyTradeIns');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('errors.unknown'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Same guard as the Profile entry point, for a guest who reaches this route
  // directly (deep link). All hooks above still ran; we just render nothing.
  if (!user?.uid) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Profile')}
          >
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: isRTL ? 0 : SPACING.md,
            marginRight: isRTL ? SPACING.md : 0,
          }}>
            {t('tradeIn.title')}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ padding: SPACING.md }}>
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                marginBottom: SPACING.lg,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {t('tradeIn.subtitle')}
              </Text>

              {/* Brand — free text with tap-to-fill suggestions from stocked brands */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false}
                  style={[styles.fieldLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tradeIn.selectBrand')}
                </Text>
                <TextInput allowFontScaling={false}
                  value={deviceBrand}
                  onChangeText={setDeviceBrand}
                  placeholder={t('tradeIn.selectBrand')}
                  editable={!submitting}
                  scrollEnabled={false}
                  style={[styles.input, {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    textAlign: isRTL ? 'right' : 'left',
                  }]}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {brands.length > 0 && (
                  <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {brands.map((b) => {
                      const selected = deviceBrand === b.name;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          onPress={() => setDeviceBrand(b.name)}
                          disabled={submitting}
                          style={[styles.chip, {
                            backgroundColor: selected ? theme.colors.primary : 'transparent',
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                          }]}
                        >
                          <Text allowFontScaling={false}
                            style={{ fontSize: 13, color: selected ? theme.colors.textOnPrimary : theme.colors.text }}>
                            {b.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Model */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false}
                  style={[styles.fieldLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tradeIn.selectModel')}
                </Text>
                <TextInput allowFontScaling={false}
                  value={deviceModel}
                  onChangeText={setDeviceModel}
                  placeholder={t('tradeIn.selectModel')}
                  editable={!submitting}
                  scrollEnabled={false}
                  style={[styles.input, {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    textAlign: isRTL ? 'right' : 'left',
                  }]}
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              {/* Storage (optional) */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false}
                  style={[styles.fieldLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tradeIn.storage')} {t('common.optional')}
                </Text>
                <TextInput allowFontScaling={false}
                  value={storage}
                  onChangeText={setStorage}
                  placeholder={t('tradeIn.storage')}
                  editable={!submitting}
                  scrollEnabled={false}
                  style={[styles.input, {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    textAlign: isRTL ? 'right' : 'left',
                  }]}
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              {/* The ten condition questions */}
              {TRADE_IN_QUESTIONS.map((q) => (
                <View key={q.key} style={styles.questionBlock}>
                  <Text allowFontScaling={false}
                    style={[styles.questionLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t(q.labelKey)}
                  </Text>
                  {q.type === 'percent' ? (
                    <TextInput allowFontScaling={false}
                      keyboardType="number-pad"
                      maxLength={3}
                      value={answers[q.key] || ''}
                      onChangeText={(v) => {
                        const digits = v.replace(/[^0-9]/g, '');
                        // maxLength caps entry at 3 digits (0-999); clamp down to a
                        // real percentage so e.g. "999" can't be typed and submitted.
                        const clamped = digits === '' ? '' : String(Math.min(100, parseInt(digits, 10)));
                        setAnswers((p) => ({ ...p, [q.key]: clamped }));
                      }}
                      editable={!submitting}
                      scrollEnabled={false}
                      style={[styles.input, {
                        color: theme.colors.text,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        textAlign: isRTL ? 'right' : 'left',
                      }]}
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                  ) : (
                    <View style={[styles.optionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      {q.options!.map((o) => {
                        const selected = answers[q.key] === o.value;
                        return (
                          <TouchableOpacity
                            key={o.value}
                            onPress={() => setAnswers((p) => ({ ...p, [q.key]: o.value }))}
                            disabled={submitting}
                            style={[styles.option, {
                              backgroundColor: selected ? theme.colors.primary : 'transparent',
                              borderColor: selected ? theme.colors.primary : theme.colors.border,
                            }]}
                          >
                            <Text allowFontScaling={false}
                              style={{ color: selected ? theme.colors.textOnPrimary : theme.colors.text }}>
                              {t(o.labelKey)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}

              {/* Photos */}
              <View style={{ marginBottom: SPACING.lg }}>
                <Text allowFontScaling={false}
                  style={[styles.fieldLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tradeIn.photos')}
                </Text>
                <Text allowFontScaling={false} style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginBottom: SPACING.sm,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {t('tradeIn.photosHint')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: SPACING.sm }}>
                    {pickedPhotos.map((uri, index) => (
                      <View key={`${uri}-${index}`} style={[styles.photoThumbWrap, { borderColor: theme.colors.border }]}>
                        <Image source={{ uri }} style={styles.photoThumb} contentFit="cover" />
                        <TouchableOpacity
                          onPress={() => handleRemovePhoto(index)}
                          disabled={submitting}
                          style={[styles.removePhotoBtn, { backgroundColor: theme.colors.error }]}
                        >
                          <Ionicons name="close" size={14} color={theme.colors.textOnPrimary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {pickedPhotos.length < MAX_PHOTOS && (
                      <TouchableOpacity
                        onPress={handleAddPhoto}
                        disabled={submitting}
                        style={[styles.addPhotoTile, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                      >
                        <Ionicons name="camera-outline" size={24} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </ScrollView>
              </View>

              {/* Note (optional) */}
              <View style={{ marginBottom: SPACING.xl }}>
                <Text allowFontScaling={false}
                  style={[styles.fieldLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tradeIn.note')} {t('common.optional')}
                </Text>
                <TextInput allowFontScaling={false}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('tradeIn.note')}
                  multiline
                  numberOfLines={3}
                  editable={!submitting}
                  scrollEnabled={false}
                  style={[styles.textArea, {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    textAlign: isRTL ? 'right' : 'left',
                  }]}
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>
            </View>
          </ScrollView>

          {/* Submit */}
          <View style={{ padding: SPACING.md }}>
            {!tenantId && (
              <Text allowFontScaling={false} style={{
                fontSize: 12,
                color: theme.colors.error,
                textAlign: isRTL ? 'right' : 'left',
                marginBottom: SPACING.sm,
              }}>
                {t('errors.serverError')}
              </Text>
            )}
            <Button
              title={t('tradeIn.submit')}
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting || !tenantId}
              icon="checkmark"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    height: 48,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: 16,
    minHeight: 80,
    includeFontPadding: false,
    textAlignVertical: 'top',
  },
  questionBlock: {
    marginBottom: SPACING.lg,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  optionRow: {
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  option: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipRow: {
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  photoThumbWrap: {
    width: 88,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoTile: {
    width: 88,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TradeInRequestScreen;
