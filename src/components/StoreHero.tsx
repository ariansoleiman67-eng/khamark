import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';

import { useTranslation } from 'react-i18next';
import { StoreProfile } from '../services/storeProfileService';
import { useTheme } from './ThemeProvider';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../constants/theme';
import CountdownDisplay from './CountdownDisplay';

interface StoreHeroProps {
  profile: StoreProfile;
  // Which store's Operating Hours schedule the badge should read.
  tenantId?: string;
  productCount: number;
}

const StoreHero: React.FC<StoreHeroProps> = ({ profile, productCount, tenantId }) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';

  const getLocalizedStoreName = () => {
    if (i18n.language === 'ar' && profile.storeNameAr) return profile.storeNameAr;
    if (i18n.language === 'ku' && profile.storeNameKu) return profile.storeNameKu;
    return profile.storeName;
  };

  // --- Banner Auto-Scroll Logic ---
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Compute valid banner images or fallback
  const bannerImages = (profile.coverUrls && profile.coverUrls.length > 0) 
    ? profile.coverUrls 
    : [profile.coverUrl || 'https://via.placeholder.com/800x400'];

  useEffect(() => {
    // Only auto-scroll if we have multiple images
    if (bannerImages.length <= 1) return;

    const startTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCurrentBannerIndex(prev => (prev + 1) % bannerImages.length);
      }, 4000); // 4 seconds interval
    };

    startTimer();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [bannerImages.length]);

  const handleBannerPress = () => {
    if (bannerImages.length > 1) {
      setCurrentBannerIndex(prev => (prev + 1) % bannerImages.length);
      // Reset timer on manual interaction
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCurrentBannerIndex(prev => (prev + 1) % bannerImages.length);
      }, 4000);
    }
  };

  const openSocial = (url?: string, type: 'web' | 'wa' | 'social' | 'tiktok' = 'social') => {
    if (!url) return;
    
    let finalUrl = url;
    if (type === 'wa') {
        const phone = url.replace(/\D/g, ''); // Extract digits only
        finalUrl = `https://wa.me/${phone}`;
    } else if (type === 'tiktok') {
        const handle = url.replace('https://', '').replace('tiktok.com/', '').replace('@', '');
        finalUrl = `https://tiktok.com/@${handle}`;
    } else if (!url.startsWith('http')) {
        // Simple heuristic for others if needed, but usually social handles are passed or full URLs
        // For this app, assuming profiles store full URLs or handles. 
        // If handles, we'd need prefix map. Assuming full URLs based on previous context or adding 'https://'
        finalUrl = url.startsWith('www') ? `https://${url}` : `https://${url.replace('@', '')}`;
        if (type === 'social' && !finalUrl.includes('.')) {
             // Fallback if just handle provided without domain knowledge (handled by caller preferably)
             finalUrl = `https://${url}`; 
        }
    }
    
    Linking.openURL(finalUrl).catch(() => {});
  };

  return (
    <View style={styles.container}>
      {/* Cover Image Background */}
      <TouchableOpacity 
        activeOpacity={1} 
        onPress={handleBannerPress}
        style={styles.coverContainer}
      >
        {/* Render ALL images to preload them, but only show current */}
        {bannerImages.map((imgUri, index) => (
          <Image
            key={`${imgUri}-${index}`}
            source={{ uri: imgUri }}
            style={[
              styles.coverImage, 
              // Absolute position all images so they stack
              StyleSheet.absoluteFillObject,
              // Only show the current one
              { opacity: currentBannerIndex === index ? 1 : 0 }
            ]}
            contentFit="cover"
            transition={500}
            cachePolicy="memory-disk"
            priority={index === 0 ? 'high' : 'normal'}
          />
        ))}

        <LinearGradient
          colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          locations={[0.25, 0.62, 1]}
          style={styles.gradient}
        />
        
        {/* Pagination Dots */}
        {bannerImages.length > 1 && (
          <View style={styles.paginationContainer}>
            {bannerImages.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  currentBannerIndex === index && styles.paginationDotActive
                ]}
              />
            ))}
          </View>
        )}
      </TouchableOpacity>

      {/* Back Button */}
      <TouchableOpacity 
        style={[
          styles.backButton, 
          { 
            left: isRTL ? undefined : 16, 
            right: isRTL ? 16 : undefined 
          }
        ]} 
        onPress={() => navigation.goBack()}
      >
        <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color="#fff" />
      </TouchableOpacity>

      {/* Content Overlay */}
      <View style={styles.content}>
        <View style={styles.mainRow}>
          {/* Logo with Ring */}
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: profile.logoUrl || 'https://via.placeholder.com/100' }}
              style={styles.logo}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
            />
            {profile.isVerified && (
              <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>

          {/* Texts - Glass Effect */}
          <BlurView intensity={22} tint="dark" style={styles.textGlass}>
            <View style={{ alignItems: 'center' }}>
              <Text allowFontScaling={false} 
                style={[styles.storeName, { textAlign: 'center' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {getLocalizedStoreName()}
              </Text>



            </View>
          </BlurView>
        </View>

        {/* Action Buttons Row with Timer */}
        <View style={[
          styles.actionsRow, 
          { 
            flexDirection: isRTL ? 'row-reverse' : 'row', 
            justifyContent: 'center', // Center everything
            flexWrap: 'wrap', // Allow wrapping on small screens
            width: '100%'
          }
        ]}>
          {/* Timer (Left side in LTR, Right in RTL).
              Hidden until the countdown reports a real status. `isStoreOpen ?? true`
              painted the pill green — "open" — before any schedule had been read,
              and CountdownDisplay now renders nothing while the schedule is unknown,
              which left a green open-looking badge with no text inside it. */}
          <View style={[
            styles.storeStatusBadge,
            // Kept mounted, not conditionally rendered: CountdownDisplay is what
            // reports the status, so gating the badge on isStoreOpen would stop the
            // only thing that can ever set it. Collapsed to nothing until known.
            isStoreOpen === null
              ? styles.storeStatusBadgeHidden
              : { backgroundColor: isStoreOpen ? theme.colors.success + '20' : theme.colors.error + '20' }
          ]}>
            {isStoreOpen !== null && (
              <View style={[
                styles.storeStatusDot,
                { backgroundColor: isStoreOpen ? theme.colors.success : theme.colors.error }
              ]} />
            )}
            <CountdownDisplay
              color={isStoreOpen ? theme.colors.success : theme.colors.error}
              openTime={profile.openTime}
              closeTime={profile.closeTime}
              closedDays={profile.closedDays}
              timeZone={profile.timeZone}
              tenantId={tenantId}
              onStatusChange={setIsStoreOpen}
            />
          </View>


        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 380, // Increased from 280 to fit vertical layout
    width: '100%',
    backgroundColor: '#333',
  },
  coverContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between', // Split top (info) and bottom (actions)
    padding: SPACING.lg,
    paddingTop: 80, // Clear the back button
    paddingBottom: SPACING.md,
  },
  mainRow: {
    flexDirection: 'column',
    alignItems: 'center', // Center vertically
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md, // Add outer padding to the row itself
    gap: 12, // Add gap between logo and text
  },
  logoContainer: {
    position: 'relative',
    zIndex: 10, // Ensure logo is above the glass if they overlap
    marginTop: -20, // Adjusted: logo position relative to banner
  },
  logo: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    borderRadius: 40,
    borderWidth: 2,
    height: 80,
    width: 80,
  },
  verifiedBadge: {
    alignItems: 'center',
    borderColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    bottom: 0,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 24,
  },
  textGlass: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    // Restore glass effect styles
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginTop: -10, // Slight overlap with logo for cohesive look
    paddingTop: 16, // Extra padding top to account for overlap
    width: '90%', // Don't stretch full width, looks better centered
  },
  infoContainer: {
    // Moved styles to textGlass or inline
  },
  storeName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 15, // More space
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    includeFontPadding: false,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10, // More space
  },
  cityText: {
    color: '#eee',
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    marginHorizontal: 4,
  },
  storeStatusBadge: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 18,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  // Zero-size and invisible while the schedule is still unknown. The child has to
  // stay mounted to report the status, so it cannot simply be unmounted.
  storeStatusBadgeHidden: {
    backgroundColor: 'transparent',
    minHeight: 0,
    height: 0,
    opacity: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  storeStatusDot: {
    borderRadius: 2.5,
    height: 5,
    marginRight: 6,
    width: 5,
  },
  // Legacy styles removed: statsRow, etc.
  actionsRow: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },

  tiktokButton: {
    backgroundColor: '#000000',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  websitePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    height: 36,
    paddingHorizontal: 16,
  },
  websiteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: true,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 24, // Safe area approximation
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },

  paginationContainer: {
    position: 'absolute',
    top: 20, // Position at top for visibility, or adjust as desired. Let's try centered top or right.
    right: 16,
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  paginationDot: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  paginationDotActive: {
    backgroundColor: '#fff',
    width: 18, // Elongated active dot
  },
});

export default StoreHero;
