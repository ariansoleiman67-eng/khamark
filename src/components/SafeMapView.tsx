import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Linking, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeProvider';

// =====================================================================
// iOS CRASH FIX: react-native-maps v1.20.x is INCOMPATIBLE with
// newArchEnabled: true (Fabric renderer) on iOS. Rendering MapView
// causes a native EXC_BAD_ACCESS crash that CANNOT be caught by
// try/catch or ErrorBoundary. The ONLY safe approach is to NOT render
// the native MapView component at all on iOS production builds.
//
// Instead, we show a static Google Maps image + a link to open in Maps.
// =====================================================================

let _MapView: any = null;
let _PROVIDER_GOOGLE: any = null;
let _mapsLoaded = false;

function loadMaps() {
  if (_mapsLoaded) return;
  _mapsLoaded = true;
  try {
    const maps = require('react-native-maps');
    _MapView = maps.default || maps.MapView;
    _PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch (error) {
    console.warn('react-native-maps failed to load:', error);
    _MapView = null;
    _PROVIDER_GOOGLE = null;
  }
}

interface SafeMapViewProps {
  style?: any;
  initialRegion?: any;
  region?: any;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  fallbackMessage?: string;
  fallbackComponent?: React.ReactNode;
  onError?: (error: any) => void;
  children?: React.ReactNode;
  [key: string]: any;
}

/**
 * SafeMapView - A wrapper around MapView that provides fallback UI if the map fails to load.
 * On iOS with New Architecture, we NEVER render the native MapView because it crashes.
 * Instead, we show a static map image from Google Maps Static API.
 */
const SafeMapView: React.FC<SafeMapViewProps> = ({ 
  fallbackMessage = 'Map preview unavailable',
  children,
  onError,
  initialRegion,
  region,
  ...mapViewProps 
}) => {
  const { theme } = useTheme();
  const [hasError, setHasError] = useState(false);

  // Extract coordinates from region or initialRegion
  const coords = region || initialRegion;
  const lat = coords?.latitude;
  const lng = coords?.longitude;

  // iOS with New Architecture: Show static map image instead of native MapView
  // This prevents the EXC_BAD_ACCESS crash caused by react-native-maps + Fabric
  if (Platform.OS === 'ios') {
    const hasCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

    const openInMaps = () => {
      if (hasCoords) {
        const url = `https://maps.apple.com/?ll=${lat},${lng}&q=Location&z=15`;
        Linking.openURL(url).catch(() => {});
      }
    };

    // Use Google Static Maps API for a visual preview (no native module needed)
    const staticMapUrl = hasCoords
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=REPLACE_WITH_ASANKARY_GOOGLE_MAPS_KEY`
      : null;

    return (
      <TouchableOpacity 
        activeOpacity={0.8}
        onPress={openInMaps}
        style={[styles.iosContainer, mapViewProps.style]}
      >
        {staticMapUrl ? (
          <Image 
            source={{ uri: staticMapUrl }} 
            style={styles.staticMap}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.fallbackContainer, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="location" size={32} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.fallbackText, { color: theme.colors.textSecondary }]}>
              {fallbackMessage}
            </Text>
          </View>
        )}
        {hasCoords && (
          <View style={styles.openInMapsOverlay}>
            <View style={styles.openInMapsBadge}>
              <Ionicons name="open-outline" size={14} color="#fff" />
              <Text allowFontScaling={false} style={styles.openInMapsText}>Open in Maps</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // Android: Use native MapView (it works fine)
  loadMaps();

  if (hasError || !_MapView) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: theme.colors.surface }, mapViewProps.style]}>
        <Ionicons name="location" size={32} color={theme.colors.textSecondary} />
        <Text allowFontScaling={false} style={[styles.fallbackText, { color: theme.colors.textSecondary }]}>
          {fallbackMessage}
        </Text>
      </View>
    );
  }

  return (
    <_MapView
      provider={_PROVIDER_GOOGLE}
      initialRegion={initialRegion}
      region={region}
      {...mapViewProps}
      onError={(e: any) => {
        setHasError(true);
        if (onError) {
          onError(e);
        }
      }}
    >
      {children}
    </_MapView>
  );
};

const styles = StyleSheet.create({
  fallbackContainer: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  fallbackText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  iosContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  openInMapsBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openInMapsOverlay: {
    alignItems: 'flex-end',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    padding: 8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  openInMapsText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  staticMap: {
    height: '100%',
    width: '100%',
  },
});

export default SafeMapView;
