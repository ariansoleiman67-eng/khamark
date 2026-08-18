import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
  FlatList,
  Platform,
  Image,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// iOS CRASH FIX: react-native-maps crashes with newArchEnabled on iOS.
// Only import on Android. On iOS, show static map images.
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;
if (Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default || maps.MapView;
    Marker = maps.Marker;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch {
    // Maps not available
  }
}
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../components/ThemeProvider';
import { SPACING } from '../constants/theme';
import { BRAND, GOOGLE_MAPS_API_KEY } from '../constants/config';
import { locationService, StoreLocation } from '../services/locationService';
import { supabase } from '../services/supabase';
import AppNumber from '../components/AppNumber';

// --- Local helpers ---
// LocationService does not implement getActiveLocations / getStoreTypeIcon /
// getLocalizedName / getLocalizedAddress / isStoreOpen. They were previously
// called as `locationService.X(...)` and, being undefined, threw during render
// (and getActiveLocations threw on load). Implement them here so this screen is
// self-contained and can never crash on a missing service member. (Ideal future
// home: LocationService itself — this can be swapped back once it exposes them.)

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const getStoreTypeIcon = (type?: string | null): string => {
  switch (type) {
    case 'main': return 'business';
    case 'branch': return 'storefront';
    case 'service': return 'construct';
    default: return 'location';
  }
};

const getLocalizedName = (loc: StoreLocation, lang?: string): string => {
  if (!loc) return '';
  if (lang === 'ar' && loc.nameAr) return loc.nameAr;
  if (lang === 'ku' && loc.nameKu) return loc.nameKu;
  return loc.name || loc.address || '';
};

const getLocalizedAddress = (loc: StoreLocation, lang?: string): string => {
  if (!loc) return '';
  if (lang === 'ar' && loc.addressAr) return loc.addressAr;
  if (lang === 'ku' && loc.addressKu) return loc.addressKu;
  return loc.address || '';
};

// The branch's own per-day schedule, as written by Admin > Edit Store Location
// ({ open, close, isOpen } keyed by lowercase day name). Returns null when the
// branch has no schedule at all, so the card simply omits the row.
const getTodayHours = (loc: StoreLocation): { isOpen: boolean; open: string; close: string } | null => {
  const schedule = loc?.workingHours?.[DAY_KEYS[new Date().getDay()]];
  if (!schedule) return null;
  if (schedule.isOpen === false) return { isOpen: false, open: '', close: '' };
  if (!schedule.open || !schedule.close) return null;
  return { isOpen: true, open: String(schedule.open), close: String(schedule.close) };
};

const isStoreOpen = (loc: StoreLocation): boolean => {
  try {
    const hours = loc?.workingHours;
    if (!hours) return true; // No schedule configured -> treat as open
    const now = new Date();
    const schedule = hours[DAY_KEYS[now.getDay()]];
    if (!schedule || schedule.isOpen === false) return false;
    if (!schedule.open || !schedule.close) return true;
    const toMinutes = (s: string) => {
      const [h, m] = String(s).split(':');
      return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
    };
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= toMinutes(schedule.open) && cur < toMinutes(schedule.close);
  } catch {
    return true;
  }
};

const mapDbToStoreLocation = (data: any): StoreLocation => ({
  id: data.id,
  name: data.name,
  nameAr: data.name_ar,
  nameKu: data.name_ku,
  address: data.address,
  addressAr: data.address_ar,
  addressKu: data.address_ku,
  phone: data.phone,
  email: data.email,
  city: data.city,
  latitude: Number(data.latitude),
  longitude: Number(data.longitude),
  type: data.type,
  isActive: data.is_active,
  workingHours: data.working_hours,
  createdByAdminId: data.created_by_admin_id,
  createdAt: data.created_at ? new Date(data.created_at) : undefined,
  updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
});

// Branches for one seller.
//
// store_locations has no tenant_id — only created_by_admin_id (schema.sql:389) —
// so scoping means resolving the tenant's admins first. Without this the screen
// listed EVERY seller's branches, so opening "View all branches" from store A's
// product page showed store B's shops with live Call and Directions buttons.
//
// tenantId omitted (a caller that has no seller context) keeps the old unscoped
// behaviour rather than rendering an empty screen.
const fetchActiveLocations = async (tenantId?: string): Promise<StoreLocation[]> => {
  let query = supabase.from('store_locations').select('*').eq('is_active', true);

  if (tenantId) {
    // A store owner's tenantId IS their own user id — across this schema tenant_id
    // points at users(id) and the owner is the tenant. There is no users.tenant_id
    // column, so an earlier version of this filter queried one that does not exist:
    // the request errored, the admin list came back empty, and the filter quietly
    // degraded to the owner alone anyway.
    query = query.eq('created_by_admin_id', tenantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapDbToStoreLocation);
};

export const StoreLocationScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const tenantId: string | undefined = route.params?.tenantId;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<StoreLocation | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');
  // Typed, because BRAND.storeCoords is `as const`: inferred from the initial
  // value alone, this state's type is the LITERAL 36.1911 / 44.0094, and every
  // later setMapRegion — centring on a real store, focusing a marker — is a type
  // error. Which is what @ts-nocheck was hiding.
  const [mapRegion, setMapRegion] = useState<{
    latitude: number
    longitude: number
    latitudeDelta: number
    longitudeDelta: number
  }>({
    latitude: BRAND.storeCoords.latitude, // Default store region
    longitude: BRAND.storeCoords.longitude,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });

  useEffect(() => {
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const storeLocations = await fetchActiveLocations(tenantId);
      setLocations(storeLocations);
      
      // If we have locations, center map on first location or main store
      if (storeLocations.length > 0) {
        const mainStore = storeLocations.find(loc => loc.type === 'main') || storeLocations[0];
        setMapRegion({
          latitude: mainStore.latitude,
          longitude: mainStore.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
        setSelectedLocation(mainStore);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('storeLocations.loadError', { defaultValue: 'Failed to load store locations. Please try again.' })
      );
    } finally {
      setLoading(false);
    }
  };

  const openDirections = (storeLocation: StoreLocation) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${storeLocation.latitude},${storeLocation.longitude}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('storeLocations.mapsError'));
    });
  };

  const callStore = (phoneNumber: string) => {
    const url = `tel:${phoneNumber}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('storeLocations.phoneError'));
    });
  };

  const openWhatsApp = (storeLocation: StoreLocation) => {
    const phoneNumber = storeLocation.phone;
    const storeName = getLocalizedName(storeLocation, i18n.language);
    const message = t('storeLocations.whatsappMessage', { store: storeName });
    const url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('storeLocations.whatsappError'));
    });
  };

  const focusOnLocation = (storeLocation: StoreLocation) => {
    setMapRegion({
      latitude: storeLocation.latitude,
      longitude: storeLocation.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setSelectedLocation(storeLocation);
    setViewMode('map');
  };

  const renderLocationCard = (storeLocation: StoreLocation) => {
    if (!storeLocation) return null;

    const todayHours = getTodayHours(storeLocation);

    return (
      <View
        style={[
          styles.storeCard,
          { backgroundColor: theme.colors.surface, borderLeftColor: locationService.getStoreTypeColor(storeLocation.type) }
        ]}
      >
        {/* Header */}
        <View style={[styles.storeHeader, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[
            styles.storeTypeIcon,
            { backgroundColor: locationService.getStoreTypeColor(storeLocation.type) + '20' },
            isRTL ? { marginRight: 0, marginLeft: SPACING.md } : null,
          ]}>
            <Ionicons
              name={getStoreTypeIcon(storeLocation.type) as any}
              size={24}
              color={locationService.getStoreTypeColor(storeLocation.type)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false} style={[styles.storeName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
              {getLocalizedName(storeLocation, i18n.language)}
            </Text>
            <View style={[styles.statusRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text allowFontScaling={false} style={[styles.storeType, { color: theme.colors.textSecondary }, isRTL ? { marginRight: 0, marginLeft: SPACING.sm } : null]}>
                {(storeLocation.type || 'branch').toUpperCase()}
              </Text>
              <Text allowFontScaling={false} style={[
                styles.storeStatus,
                { color: isStoreOpen(storeLocation) ? '#4CAF50' : '#FF5722' }
              ]}>
                {isStoreOpen(storeLocation)
                  ? `🟢 ${t('storeLocations.open', { defaultValue: 'Open' })}`
                  : `🔴 ${t('storeLocations.closed', { defaultValue: 'Closed' })}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Info */}
        <View style={styles.storeInfo}>
          <View style={[styles.infoRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="location" size={16} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.infoText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }, isRTL ? { marginLeft: 0, marginRight: SPACING.sm } : null]}>
              {getLocalizedAddress(storeLocation, i18n.language)}
            </Text>
          </View>
          <View style={[styles.infoRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="call" size={16} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.infoText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }, isRTL ? { marginLeft: 0, marginRight: SPACING.sm } : null]}>
              {storeLocation.phone}
            </Text>
          </View>
          {storeLocation.email && (
            <View style={[styles.infoRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="mail" size={16} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.infoText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }, isRTL ? { marginLeft: 0, marginRight: SPACING.sm } : null]}>
                {storeLocation.email}
              </Text>
            </View>
          )}
          {todayHours && (
            <View style={[styles.infoRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.hoursLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }, isRTL ? { marginLeft: 0, marginRight: SPACING.sm } : null]}>
                {todayHours.isOpen
                  ? t('storeLocations.todayHours')
                  : t('storeLocations.closedToday')}
              </Text>
              {todayHours.isOpen && (
                <AppNumber
                  value={`${todayHours.open} - ${todayHours.close}`}
                  style={[styles.hoursValue, { color: theme.colors.text }]}
                  containerStyle={isRTL ? { marginRight: SPACING.xs } : { marginLeft: SPACING.xs }}
                />
              )}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => callStore(storeLocation.phone)}
          >
            <Ionicons name="call" size={16} color="white" />
            <Text allowFontScaling={false} style={styles.actionButtonText}>{t('storeLocations.call', { defaultValue: 'Call' })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#25D366' }]}
            onPress={() => openWhatsApp(storeLocation)}
          >
            <Ionicons name="logo-whatsapp" size={16} color="white" />
            <Text allowFontScaling={false} style={styles.actionButtonText}>{t('storeLocations.whatsapp', { defaultValue: 'WhatsApp' })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.accent }]}
            onPress={() => focusOnLocation(storeLocation)}
          >
            <Ionicons name="map" size={16} color="white" />
            <Text allowFontScaling={false} style={styles.actionButtonText}>{t('storeLocations.view', { defaultValue: 'View' })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
            onPress={() => openDirections(storeLocation)}
          >
            <Ionicons name="navigate" size={16} color="white" />
            <Text allowFontScaling={false} style={styles.actionButtonText}>{t('storeLocations.directions', { defaultValue: 'Directions' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMapView = () => {
    // iOS: Show store cards with static map images and "Open in Maps" buttons
    // This prevents the EXC_BAD_ACCESS crash from react-native-maps + Fabric
    if (Platform.OS === 'ios' || !MapView) {
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.md }}>
          {locations.map((storeLocation) => {
            if (!storeLocation) return null;
            const staticMapUrl = storeLocation.latitude && storeLocation.longitude
              ? `https://maps.googleapis.com/maps/api/staticmap?center=${storeLocation.latitude},${storeLocation.longitude}&zoom=15&size=600x200&maptype=roadmap&markers=color:red%7C${storeLocation.latitude},${storeLocation.longitude}&key=${GOOGLE_MAPS_API_KEY}`
              : null;
            return (
              // renderLocationCard already renders a full storeCard; the wrapper only
              // stacks the static map preview above it (nesting two storeCards doubled
              // the padding, border and shadow).
              <View key={storeLocation.id}>
                {staticMapUrl && (
                  <TouchableOpacity
                    onPress={() => openDirections(storeLocation)}
                    activeOpacity={0.8}
                    style={{ borderRadius: 8, overflow: 'hidden', marginBottom: SPACING.sm, height: 140 }}
                  >
                    <Image source={{ uri: staticMapUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="navigate" size={12} color="#fff" />
                      <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{t('storeLocations.directions', { defaultValue: 'Directions' })}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {renderLocationCard(storeLocation)}
              </View>
            );
          })}
        </ScrollView>
      );
    }

    // Android: Use native MapView
    try {
      return (
        <View style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            region={mapRegion}
            onRegionChangeComplete={setMapRegion}
            showsUserLocation={true}
            showsMyLocationButton={false}
            zoomEnabled={true}
            scrollEnabled={true}
            // @ts-ignore
            onError={(error: any) => {
              console.error('MapView error:', error);
            }}
          >
        {locations && locations.length > 0 && locations.map((storeLocation) => {
          if (!storeLocation || !storeLocation.latitude || !storeLocation.longitude) {
            return null;
          }
          return (
            <Marker
              key={storeLocation.id}
              coordinate={{
                latitude: storeLocation.latitude,
                longitude: storeLocation.longitude,
              }}
              title={getLocalizedName(storeLocation, i18n.language)}
              description={getLocalizedAddress(storeLocation, i18n.language)}
              pinColor={locationService.getStoreTypeColor(storeLocation.type)}
              onPress={() => setSelectedLocation(storeLocation)}
            />
          );
        })}
      </MapView>
      
      {/* Selected Location Info */}
      {selectedLocation && (
        <View style={[styles.locationInfoCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.locationInfoHeader}>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={[styles.locationTitle, { color: theme.colors.text }]}>
                {getLocalizedName(selectedLocation, i18n.language)}
              </Text>
              <Text allowFontScaling={false} style={[styles.locationSubtitle, { color: theme.colors.textSecondary }]}>
                {(selectedLocation.type || 'branch').toUpperCase()} • {isStoreOpen(selectedLocation)
                  ? `🟢 ${t('storeLocations.open', { defaultValue: 'Open' })}`
                  : `🔴 ${t('storeLocations.closed', { defaultValue: 'Closed' })}`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.directionsButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => openDirections(selectedLocation)}
            >
              <Ionicons name="navigate" size={16} color="white" />
              <Text allowFontScaling={false} style={styles.directionsButtonText}>{t('storeLocations.directions', { defaultValue: 'Directions' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
        </View>
      );
    } catch (error) {
      console.error('Error rendering map view:', error);
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
          <Ionicons name="map-outline" size={64} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={{ color: theme.colors.text, marginTop: 16, fontSize: 18, fontWeight: '600' }}>
            {t('storeLocations.mapUnavailable', { defaultValue: 'Map Unavailable' })}
          </Text>
          <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
            {t('storeLocations.mapUnavailableHint', { defaultValue: 'Unable to load map. Please try the list view instead.' })}
          </Text>
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            style={{
              marginTop: 20,
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
            }}
          >
            <Text allowFontScaling={false} style={{ color: 'white', fontWeight: '600' }}>{t('storeLocations.switchToList', { defaultValue: 'Switch to List View' })}</Text>
          </TouchableOpacity>
        </View>
      );
    }
  };

  const renderListView = () => (
    <FlatList
      data={locations || []}
      keyExtractor={(item) => item?.id || 'unknown'}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: SPACING.md }}
      renderItem={({ item: storeLocation }) => {
        if (!storeLocation) return null;
        return renderLocationCard(storeLocation);
      }}
      showsVerticalScrollIndicator={false}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }, isRTL && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('profile.menu.storeLocations')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.text }]}>
            {t('storeLocations.loading', { defaultValue: 'Loading store locations...' })}
          </Text>
        </View>
      ) : locations.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: theme.colors.background }]}>
          <Ionicons name="location-outline" size={64} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
            {t('storeLocations.emptyTitle', { defaultValue: 'No Store Locations Found' })}
          </Text>
          <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
            {t('storeLocations.emptyHint', { defaultValue: 'Please check back later or contact support.' })}
          </Text>
        </View>
      ) : (
        <>
          {/* View Toggle */}
          <View style={[styles.toggleContainer, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                viewMode === 'list' && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons 
                name="list" 
                size={20} 
                color={viewMode === 'list' ? 'white' : theme.colors.textSecondary} 
              />
              <Text allowFontScaling={false} style={[
                styles.toggleText,
                { color: viewMode === 'list' ? 'white' : theme.colors.textSecondary }
              ]}>{t('storeLocations.list', { defaultValue: 'List' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                viewMode === 'map' && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => setViewMode('map')}
            >
              <Ionicons 
                name="map" 
                size={20} 
                color={viewMode === 'map' ? 'white' : theme.colors.textSecondary} 
              />
              <Text allowFontScaling={false} style={[
                styles.toggleText,
                { color: viewMode === 'map' ? 'white' : theme.colors.textSecondary }
              ]}>{t('storeLocations.map', { defaultValue: 'Map' })}</Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'map' ? renderMapView() : renderListView()}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: 2,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  directionsButton: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  directionsButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  hoursLabel: {
    fontSize: 14,
    marginLeft: SPACING.sm,
  },
  hoursValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    marginLeft: SPACING.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  locationInfoCard: {
    borderRadius: 12,
    bottom: SPACING.md,
    elevation: 5,
    left: SPACING.md,
    padding: SPACING.md,
    position: 'absolute',
    right: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  locationInfoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  locationSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 2,
  },
  storeCard: {
    borderLeftWidth: 4,
    borderRadius: 12,
    elevation: 2,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  storeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  storeInfo: {
    marginBottom: SPACING.md,
  },
  storeName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  storeStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  storeType: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: SPACING.sm,
  },
  storeTypeIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: SPACING.md,
    width: 48,
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: 20,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  toggleContainer: {
    borderRadius: 25,
    flexDirection: 'row',
    margin: SPACING.md,
    padding: 4,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default StoreLocationScreen;