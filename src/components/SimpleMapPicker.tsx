import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image as RNImage, Linking } from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '../constants/config';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeProvider';

// iOS CRASH FIX: react-native-maps crashes on iOS with newArchEnabled (Fabric).
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;
if (Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default || maps.MapView;
    Marker = maps.Marker;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch {}
}

interface SimpleMapPickerProps {
  latitude: number;
  longitude: number;
  onLocationChange: (latitude: number, longitude: number) => void;
  height?: number;
}

/**
 * SimpleMapPicker - A simple, reliable map with draggable pin for location selection
 * No geocoding, no search - just visual pin placement
 * On iOS: Shows static map image (native MapView crashes with Fabric)
 */
const SimpleMapPicker: React.FC<SimpleMapPickerProps> = ({
  latitude,
  longitude,
  onLocationChange,
  height = 250,
}) => {
  const { theme } = useTheme();
  const [region, setRegion] = useState({
    latitude,
    longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const handleMarkerDragEnd = (e: any) => {
    const { latitude: newLat, longitude: newLng } = e.nativeEvent.coordinate;
    onLocationChange(newLat, newLng);
  };

  const handleRecenter = () => {
    setRegion({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  // iOS: Show static map image instead of native MapView
  if (Platform.OS === 'ios' || !MapView) {
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=600x400&maptype=roadmap&markers=color:red%7C${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;

    return (
      <View style={styles.container}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            Linking.openURL(`https://maps.apple.com/?ll=${latitude},${longitude}&q=Location&z=15`).catch(() => {});
          }}
          style={[styles.mapContainer, { height }]}
        >
          <RNImage
            source={{ uri: staticMapUrl }}
            style={styles.map}
            resizeMode="cover"
          />
          <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="open-outline" size={14} color="#fff" />
            <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Open in Maps</Text>
          </View>
        </TouchableOpacity>

        {/* Coordinates Display */}
        <View style={[styles.coordsContainer, { backgroundColor: theme.colors.surface }]}>
          <Ionicons name="location" size={16} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.coordsText, { color: theme.colors.textSecondary }]}>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Text>
        </View>

        <Text allowFontScaling={false} style={[styles.helpText, { color: theme.colors.textSecondary }]}>
          📍 Tap to open in Apple Maps
        </Text>
      </View>
    );
  }

  // Android: Use native MapView
  return (
    <View style={styles.container}>
      <View style={[styles.mapContainer, { height }]}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
        >
          <Marker
            coordinate={{ latitude, longitude }}
            draggable
            onDragEnd={handleMarkerDragEnd}
            title="Delivery Location"
            description="Drag to adjust"
          />
        </MapView>

        {/* Recenter Button */}
        <TouchableOpacity
          style={[styles.recenterButton, { backgroundColor: theme.colors.surface }]}
          onPress={handleRecenter}
        >
          <Ionicons name="locate" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Coordinates Display */}
      <View style={[styles.coordsContainer, { backgroundColor: theme.colors.surface }]}>
        <Ionicons name="location" size={16} color={theme.colors.textSecondary} />
        <Text allowFontScaling={false} style={[styles.coordsText, { color: theme.colors.textSecondary }]}>
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </Text>
      </View>

      {/* Help Text */}
      <Text allowFontScaling={false} style={[styles.helpText, { color: theme.colors.textSecondary }]}>
        💡 Drag the pin to adjust your exact delivery location
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  coordsContainer: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    padding: 8,
  },
  coordsText: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  helpText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  map: {
    height: '100%',
    width: '100%',
  },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  recenterButton: {
    alignItems: 'center',
    borderRadius: 20,
    elevation: 5,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    top: 10,
    width: 40,
  },
});

export default SimpleMapPicker;
