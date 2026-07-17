import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Dimensions,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { ImageService } from '../../services/imageService';
import bannerService, { BannerItem } from '../../services/bannerService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_PASSWORD = '1990';

const AdminBannerScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  // Password gate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Banner data
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bannerService.getBanners(false); // Get all (active + inactive)
      setBanners(result);
    } catch (error) {
      Alert.alert(t('common.error'), t('admin.banner.loadFailed', { defaultValue: 'Failed to load banners' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAuthenticated) {
      loadBanners();
    }
  }, [isAuthenticated, loadBanners]);

  // ========================
  // Password Gate
  // ========================
  const handlePasswordSubmit = () => {
    if (passwordInput === BANNER_PASSWORD) {
      Keyboard.dismiss();
      setIsAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput('');
    }
  };

  // ========================
  // Banner Actions
  // ========================
  const handleAddBanner = async () => {
    try {
      const result = await ImageService.pickImage({ aspect: [16, 7], quality: 0.85 });

      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);
      const uploadResult = await ImageService.uploadImage(result.assets[0].uri);

      if (uploadResult.success && uploadResult.url) {
        const nextOrder = banners.length;
        const id = await bannerService.addBanner(uploadResult.url, nextOrder);

        if (id) {
          await loadBanners();
          Alert.alert(t('common.success'), t('admin.banner.addSuccess', { defaultValue: 'Banner added successfully' }));
        } else {
          Alert.alert(t('common.error'), t('admin.banner.addFailed', { defaultValue: 'Failed to add banner' }));
        }
      } else {
        Alert.alert(t('common.error'), t('admin.banner.uploadFailed', { defaultValue: 'Image upload failed' }));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('common.somethingWentWrong', { defaultValue: 'Something went wrong' }));
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (banner: BannerItem) => {
    const next = !banner.isActive;
    const success = await bannerService.updateBanner(banner.id, {
      isActive: next,
    });
    if (success) {
      setBanners((prev) =>
        prev.map((b) =>
          b.id === banner.id ? { ...b, isActive: next } : b
        )
      );
    } else {
      Alert.alert(t('common.error'), t('admin.banner.updateFailed', { defaultValue: 'Failed to update banner' }));
    }
  };

  const handleDeleteBanner = (banner: BannerItem) => {
    Alert.alert(
      t('admin.banner.deleteTitle', { defaultValue: 'Delete Banner' }),
      t('admin.banner.deleteConfirm', { defaultValue: 'Are you sure you want to delete this banner?' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const success = await bannerService.deleteBanner(banner.id);
            if (success) {
              await loadBanners();
            } else {
              Alert.alert(t('common.error'), t('admin.banner.deleteFailed', { defaultValue: 'Failed to delete banner' }));
            }
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newBanners = [...banners];
    [newBanners[index - 1], newBanners[index]] = [newBanners[index], newBanners[index - 1]];
    setBanners(newBanners);
    await bannerService.reorderBanners(newBanners.map((b) => b.id));
  };

  const handleMoveDown = async (index: number) => {
    if (index === banners.length - 1) return;
    const newBanners = [...banners];
    [newBanners[index], newBanners[index + 1]] = [newBanners[index + 1], newBanners[index]];
    setBanners(newBanners);
    await bannerService.reorderBanners(newBanners.map((b) => b.id));
  };

  // ========================
  // Password Gate View
  // ========================
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('admin.banner.title', { defaultValue: 'Banner Management' })}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.passwordContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.passwordCard, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.lockIconWrapper}>
              <Ionicons name="lock-closed" size={48} color={theme.colors.primary} />
            </View>
            <Text allowFontScaling={false} style={[styles.passwordTitle, { color: theme.colors.text }]}>
              {t('admin.banner.passwordRequired', { defaultValue: 'Password Required' })}
            </Text>
            <Text allowFontScaling={false} style={[styles.passwordSubtitle, { color: theme.colors.textSecondary }]}>
              {t('admin.banner.passwordHint', { defaultValue: 'Enter the banner management password to continue' })}
            </Text>

            <TextInput allowFontScaling={false}
              style={[
                styles.passwordInput,
                {
                  backgroundColor: isDark ? theme.colors.background : '#F5F5F5',
                  color: theme.colors.text,
                  borderColor: passwordError ? '#F44336' : theme.colors.border,
                },
              ]}
              placeholder="••••"
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
              keyboardType="numeric"
              value={passwordInput}
              onChangeText={(text) => {
                setPasswordInput(text);
                setPasswordError(false);
              }}
              onSubmitEditing={handlePasswordSubmit}
              maxLength={10}
              textAlign="center"
            />

            {passwordError && (
              <Text allowFontScaling={false} style={styles.errorText}>
                {t('admin.banner.wrongPassword', { defaultValue: 'Wrong password. Please try again.' })}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.colors.primary }]}
              onPress={handlePasswordSubmit}
            >
              <Text allowFontScaling={false} style={styles.submitButtonText}>
                {t('admin.banner.unlock', { defaultValue: 'Unlock' })}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ========================
  // Main Banner Management View
  // ========================
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('admin.banner.title', { defaultValue: 'Banner Management' })}
        </Text>
        <TouchableOpacity onPress={handleAddBanner} style={styles.addButton} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Ionicons name="add-circle" size={28} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : banners.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={64} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
            {t('admin.banner.noBanners', { defaultValue: 'No Banners Yet' })}
          </Text>
          <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
            {t('admin.banner.addFirst', { defaultValue: 'Tap + to add your first banner image' })}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats Bar */}
          <View style={[styles.statsBar, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.statItem}>
              <Text allowFontScaling={false} style={[styles.statNumber, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {banners.length}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {t('admin.banner.total', { defaultValue: 'Total' })}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.statItem}>
              <Text allowFontScaling={false} style={[styles.statNumber, { color: '#4CAF50' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {banners.filter((b) => b.isActive).length}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {t('admin.banner.active', { defaultValue: 'Active' })}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.statItem}>
              <Text allowFontScaling={false} style={[styles.statNumber, { color: '#F44336' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {banners.filter((b) => !b.isActive).length}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {t('admin.banner.inactive', { defaultValue: 'Inactive' })}
              </Text>
            </View>
          </View>

          {/* Banner List */}
          {banners.map((banner, index) => (
            <View
              key={banner.id}
              style={[
                styles.bannerCard,
                {
                  backgroundColor: theme.colors.surface,
                  opacity: banner.isActive ? 1 : 0.6,
                },
              ]}
            >
              {/* Banner Image Preview */}
              <View style={styles.bannerImageWrapper}>
                <Image
                  source={{ uri: banner.imageUrl }}
                  style={styles.bannerImage}
                  contentFit="cover"
                  transition={200}
                />
                {!banner.isActive && (
                  <View style={styles.inactiveOverlay}>
                    <Text allowFontScaling={false} style={styles.inactiveText}>
                      {t('admin.banner.disabled', { defaultValue: 'DISABLED' })}
                    </Text>
                  </View>
                )}
                {/* Order Badge */}
                <View style={styles.orderBadge}>
                  <Text allowFontScaling={false} style={styles.orderBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{index + 1}</Text>
                </View>
              </View>

              {/* Banner Controls */}
              <View style={[styles.bannerControls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {/* Reorder Buttons */}
                <View style={styles.reorderButtons}>
                  <TouchableOpacity
                    onPress={() => handleMoveUp(index)}
                    disabled={index === 0}
                    style={[
                      styles.reorderBtn,
                      { backgroundColor: isDark ? '#333' : '#F0F0F0' },
                      index === 0 && styles.reorderBtnDisabled,
                    ]}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={20}
                      color={index === 0 ? '#CCC' : theme.colors.text}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleMoveDown(index)}
                    disabled={index === banners.length - 1}
                    style={[
                      styles.reorderBtn,
                      { backgroundColor: isDark ? '#333' : '#F0F0F0' },
                      index === banners.length - 1 && styles.reorderBtnDisabled,
                    ]}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={index === banners.length - 1 ? '#CCC' : theme.colors.text}
                    />
                  </TouchableOpacity>
                </View>

                {/* Active Toggle */}
                <View style={styles.toggleContainer}>
                  <Text allowFontScaling={false} style={[styles.toggleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {banner.isActive
                      ? t('admin.banner.active', { defaultValue: 'Active' })
                      : t('admin.banner.inactive', { defaultValue: 'Inactive' })}
                  </Text>
                  <Switch
                    value={banner.isActive}
                    onValueChange={() => handleToggleActive(banner)}
                    trackColor={{ false: '#ccc', true: theme.colors.primary + '60' }}
                    thumbColor={banner.isActive ? theme.colors.primary : '#f4f3f4'}
                  />
                </View>

                {/* Delete Button */}
                <TouchableOpacity
                  onPress={() => handleDeleteBanner(banner)}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={22} color="#F44336" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Bottom Spacer */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Floating Add Button */}
      {banners.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={handleAddBanner}
          disabled={uploading}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={28} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Header
  header: {
    alignItems: 'center',
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addButton: {
    padding: 4,
  },
  // Password Gate
  passwordContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  passwordCard: {
    alignItems: 'center',
    borderRadius: 20,
    elevation: 4,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    width: '100%',
  },
  lockIconWrapper: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 54, 93, 0.1)',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: 20,
    width: 88,
  },
  passwordTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  passwordSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  passwordInput: {
    borderRadius: 14,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: '700',
    height: 56,
    letterSpacing: 8,
    marginBottom: 16,
    paddingVertical: 0,
    textAlignVertical: 'center' as const,
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  errorText: {
    color: '#F44336',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: '100%',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  // Empty State
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  // Stats
  statsBar: {
    borderRadius: 14,
    elevation: 1,
    flexDirection: 'row',
    marginBottom: 12,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    alignSelf: 'center',
    height: '80%',
    width: 1,
  },
  // ScrollView
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  // Banner Card
  bannerCard: {
    borderRadius: 14,
    elevation: 2,
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  bannerImageWrapper: {
    aspectRatio: 2.2,
    position: 'relative',
    width: '100%',
  },
  bannerImage: {
    height: '100%',
    width: '100%',
  },
  inactiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },
  inactiveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  orderBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    left: 8,
    position: 'absolute',
    top: 8,
    width: 30,
  },
  orderBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Controls
  bannerControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  reorderBtn: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  reorderBtnDisabled: {
    opacity: 0.4,
  },
  toggleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  deleteBtn: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  // FAB
  fab: {
    alignItems: 'center',
    borderRadius: 28,
    bottom: 24,
    elevation: 6,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    width: 56,
  },
});

export default AdminBannerScreen;
