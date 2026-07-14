import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Linking, 
  Platform,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StoreProfile } from '../../services/storeProfileService';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, FONT_SIZE } from '../../constants/theme';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import SafeMapView from '../../components/SafeMapView';
import { LinearGradient } from 'expo-linear-gradient';

interface StoreCompanyTabProps {
  profile: StoreProfile;
}

// Alibaba-style colors
const NAVY = '#0B2D4D';
const LIGHT_BG = '#F2F4F7';

const StoreCompanyTab: React.FC<StoreCompanyTabProps> = ({ profile }) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';
  
  // WeChat QR modal state
  const [wechatModalVisible, setWechatModalVisible] = useState(false);

  // Localized about text
  const getLocalizedAbout = () => {
    if (i18n.language === 'ar' && profile.aboutAr) return profile.aboutAr;
    if (i18n.language === 'ku' && profile.aboutKu) return profile.aboutKu;
    return profile.about;
  };

  // Localized address
  const getLocalizedAddress = () => {
    if (i18n.language === 'ar' && profile.addressTextAr) return profile.addressTextAr;
    if (i18n.language === 'ku' && profile.addressTextKu) return profile.addressTextKu;
    return profile.addressText || profile.city;
  };

  const toHttpUrl = (url?: string) => {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  };

  const digitsOnly = (v?: string) => (v || '').replace(/\D/g, '');

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const openMap = () => {
    if (profile.location) {
      const url = Platform.select({
        ios: `maps:${profile.location.latitude},${profile.location.longitude}`,
        android: `geo:${profile.location.latitude},${profile.location.longitude}?q=${profile.location.latitude},${profile.location.longitude}`,
      });
      Linking.openURL(url || '');
    }
  };

  // Card Header Component - Premium Navy strip with decorative elements
  const CardHeader = ({ title, icon }: { title: string; icon: string }) => (
    <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <LinearGradient
        colors={['#0A2540', NAVY, '#1A4D7C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Decorative corner accent */}
      <View style={[styles.headerAccent, { left: isRTL ? undefined : -10, right: isRTL ? -10 : undefined }]} />
      {/* Icon with white circle background */}
      <View style={styles.headerIconWrapper}>
        <MaterialCommunityIcons name={icon as any} size={18} color={NAVY} />
      </View>
      <Text allowFontScaling={false} style={[styles.cardHeaderText, { marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}>
        {title}
      </Text>
      {/* Decorative dots */}
      <View style={[styles.headerDots, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.headerDot} />
        <View style={[styles.headerDot, { opacity: 0.5 }]} />
        <View style={[styles.headerDot, { opacity: 0.3 }]} />
      </View>
    </View>
  );

  // Social media buttons config
  const socialButtons = [
    { 
      id: 'whatsapp', 
      icon: 'logo-whatsapp', 
      color: '#25D366', 
      value: profile.whatsapp, 
      action: () => openUrl(`https://wa.me/${digitsOnly(profile.whatsapp)}`) 
    },
    { 
      id: 'facebook', 
      icon: 'logo-facebook', 
      color: '#1877F2', 
      value: profile.facebook, 
      action: () => openUrl(toHttpUrl(profile.facebook) || '') 
    },
    { 
      id: 'instagram', 
      icon: 'logo-instagram', 
      color: '#E4405F', 
      value: profile.instagram, 
      action: () => openUrl(toHttpUrl(profile.instagram) || '') 
    },
    { 
      id: 'tiktok', 
      icon: 'logo-tiktok', 
      color: '#000000', 
      value: profile.tiktok, 
      action: () => {
        const handle = (profile.tiktok || '').replace('https://', '').replace('tiktok.com/', '').replace('@', '');
        openUrl(`https://tiktok.com/@${handle}`);
      }
    },
    { 
      id: 'website', 
      icon: 'globe-outline', 
      color: NAVY, 
      value: profile.website, 
      action: () => openUrl(toHttpUrl(profile.website) || '') 
    },
    { 
      id: 'wechat', 
      icon: 'weixin', 
      iconType: 'fontawesome5', 
      color: '#07C160', 
      value: profile.wechat || profile.wechatId, 
      action: () => setWechatModalVisible(true) 
    },
  ].filter(btn => btn.value);

  // Quick action buttons config
  const quickActions = [
    { 
      id: 'call', 
      icon: 'call', 
      label: t('common.call', 'Call'), 
      color: NAVY,
      value: profile.phone, 
      action: () => openUrl(`tel:${profile.phone}`) 
    },
    { 
      id: 'whatsapp', 
      icon: 'logo-whatsapp', 
      label: 'WhatsApp', 
      color: '#25D366',
      value: profile.whatsapp, 
      action: () => openUrl(`https://wa.me/${digitsOnly(profile.whatsapp)}`) 
    },
    { 
      id: 'directions', 
      icon: 'navigate', 
      label: t('common.directions', 'Directions'), 
      color: '#FF6B35',
      value: profile.location, 
      action: openMap 
    },
  ].filter(qa => qa.value);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : LIGHT_BG }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        
        {/* About Card */}
        {getLocalizedAbout() && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <CardHeader 
              title={t('store.aboutCompany', 'About the Company')} 
              icon="office-building" 
            />
            <View style={styles.cardContent}>
              <Text allowFontScaling={false} style={[styles.aboutText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {getLocalizedAbout()}
              </Text>
            </View>
          </View>
        )}

        {/* Follow Us / Social Media Card */}
        {socialButtons.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <CardHeader 
              title={t('store.followUs', 'Follow Us')} 
              icon="share-variant" 
            />
            <View style={styles.cardContent}>
              <View style={[styles.socialRow, { flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'flex-start', flexWrap: 'wrap' }]}>
                {socialButtons.map((btn) => (
                  <TouchableOpacity 
                    key={btn.id} 
                    style={[styles.socialButton, { backgroundColor: btn.color }]}
                    onPress={btn.action}
                  >
                    {(btn as any).iconType === 'fontawesome5' ? (
                      <FontAwesome5 name={btn.icon as any} size={20} color="#fff" />
                    ) : (
                      <Ionicons name={btn.icon as any} size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Location Map Card */}
        {profile.location && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <CardHeader 
              title={t('common.location', 'Location')} 
              icon="map-marker" 
            />
            <View style={styles.mapWrapper}>
              <SafeMapView
                style={styles.mapView}
                initialRegion={{
                  latitude: profile.location.latitude,
                  longitude: profile.location.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                pointerEvents="none"
              />
              {/* Map Overlay with Button */}
              <View style={styles.mapOverlay}>
                <TouchableOpacity 
                  style={styles.openMapButton}
                  onPress={openMap}
                >
                  <Ionicons name="navigate" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text allowFontScaling={false} style={styles.openMapText}>
                    {t('common.openInMaps', 'Open in Maps')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Address below map */}
            <View style={[styles.mapAddressRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="location" size={16} color={NAVY} />
              <Text allowFontScaling={false} 
                style={[styles.mapAddressText, { color: theme.colors.textSecondary, marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0 }]}
                numberOfLines={2}
              >
                {getLocalizedAddress()}
              </Text>
            </View>
          </View>
        )}

        {/* Bottom padding for quick actions */}
        <View style={{ height: 100 }} />

      </ScrollView>

      {/* Floating Quick Actions */}
      {quickActions.length > 0 && (
        <View style={[styles.quickActionsBar, { backgroundColor: theme.colors.surface }]}>
          {quickActions.map((action) => (
            <TouchableOpacity 
              key={action.id}
              style={[styles.quickActionButton, { backgroundColor: action.color }]}
              onPress={action.action}
            >
              <Ionicons name={action.icon as any} size={20} color="#fff" />
              <Text allowFontScaling={false} style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* WeChat QR Code Modal */}
      <Modal
        visible={wechatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWechatModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setWechatModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity 
              style={styles.modalClose}
              onPress={() => setWechatModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.colors.text }]}>
              {t('store.wechatContact', 'WeChat Contact')}
            </Text>
            
            {/* WeChat ID Display */}
            {profile.wechatId && (
              <View style={styles.wechatIdContainer}>
                <Text allowFontScaling={false} style={[styles.wechatIdLabel, { color: theme.colors.textSecondary }]}>
                  {t('store.wechatId', 'WeChat ID')}
                </Text>
                <Text allowFontScaling={false} style={[styles.wechatIdValue, { color: theme.colors.text }]}>
                  {profile.wechatId}
                </Text>
              </View>
            )}
            
            {/* QR Code Image */}
            {profile.wechat && (
              <>
                <Image 
                  source={{ uri: profile.wechat }} 
                  style={styles.wechatQrImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <Text allowFontScaling={false} style={[styles.modalHint, { color: theme.colors.textSecondary }]}>
                  {t('store.wechatHint', 'Open WeChat and scan this QR code to add')}
                </Text>
              </>
            )}
            
            {/* If only ID, no QR */}
            {!profile.wechat && profile.wechatId && (
              <Text allowFontScaling={false} style={[styles.modalHint, { color: theme.colors.textSecondary }]}>
                {t('store.wechatSearchHint', 'Search for this ID in WeChat to add')}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>


    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 120,
  },

  // Card Styles
  card: {
    borderRadius: 16,
    elevation: 3,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 3,
    position: 'relative',
  },
  headerAccent: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    height: 60,
    position: 'absolute',
    top: -25,
    width: 60,
  },
  headerIconWrapper: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    elevation: 2,
    height: 36,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    width: 36,
  },
  headerDots: {
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    right: 16,
  },
  headerDot: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  cardHeaderText: {
    color: '#fff',
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardContent: {
    padding: 18,
  },

  // About Section
  aboutText: {
    fontSize: FONT_SIZE.md,
    letterSpacing: 0.2,
    lineHeight: 24,
  },

  // Contact Row
  contactRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(0,0,0,0.05)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 14,
  },
  contactIconBox: {
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  contactTextBox: {
    flex: 1,
    marginHorizontal: 14,
  },
  contactLabel: {
    fontSize: FONT_SIZE.xs,
    marginBottom: 2,
  },
  contactValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },

  // Social Section
  socialSection: {
    borderTopColor: 'rgba(0,0,0,0.05)',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
  },
  socialTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginBottom: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: 24,
    elevation: 2,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    width: 48,
  },

  // Map Section
  mapWrapper: {
    height: 200,
    position: 'relative',
  },
  mapView: {
    flex: 1,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
  },
  openMapButton: {
    alignItems: 'center',
    backgroundColor: NAVY,
    borderRadius: 25,
    elevation: 4,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  openMapText: {
    color: '#fff',
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  mapAddressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: 14,
    paddingTop: 12,
  },
  mapAddressText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },

  // Quick Actions Bar
  quickActionsBar: {
    borderTopColor: 'rgba(0,0,0,0.08)',
    borderTopWidth: 1,
    bottom: 0,
    elevation: 8,
    flexDirection: 'row',
    gap: 10,
    left: 0,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  quickActionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  quickActionLabel: {
    color: '#fff',
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  // WeChat Modal styles
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    alignItems: 'center',
    borderRadius: 16,
    maxWidth: 320,
    padding: 24,
    width: '100%',
  },
  modalClose: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    marginRight: -8,
    marginTop: -8,
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  wechatQrImage: {
    borderRadius: 8,
    height: 220,
    width: 220,
  },
  modalHint: {
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  // WeChat ID display
  wechatIdContainer: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  wechatIdLabel: {
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  wechatIdValue: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default StoreCompanyTab;
