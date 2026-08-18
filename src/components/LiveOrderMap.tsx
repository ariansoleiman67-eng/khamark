import React, { useEffect, useState, useMemo } from 'react';
import { supabase, uniqueChannel } from '../services/supabase';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, Linking, Platform } from 'react-native';
// iOS CRASH FIX: react-native-maps crashes on iOS with newArchEnabled (Fabric).
let MapView: any = null;
let Marker: any = null;
let PROVIDER_DEFAULT: any = null;
if (Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default || maps.MapView;
    Marker = maps.Marker;
    PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
  } catch {}
}
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

interface LiveOrderMapProps {
  orderId: string;
  trackingUrl?: string; // GPSOPS or other tracking URL
  deliveryAddress?: {
    latitude?: number;
    longitude?: number;
  };
}

// Haversine formula to calculate distance between two GPS coordinates
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

// Format distance for display (always in km)
const formatDistance = (distanceKm: number): string => {
  if (distanceKm < 0.1) {
    return `${(distanceKm).toFixed(2)} km`;
  }
  if (distanceKm < 1) {
    return `${(distanceKm).toFixed(2)} km`;
  }
  return `${distanceKm.toFixed(1)} km`;
};

// GPSOPS API: Extract IMEI from tracking URL
const extractImeiFromUrl = (url: string): { baseUrl: string; imei: string } | null => {
  try {
    // Common GPSOPS URL patterns:
    // https://domain.com/map.asp?Cmd=Proc_Watch&Para=IMEI
    // https://domain.com/Interface/track.asp?IMEI=12345678
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    // Try to extract IMEI from Para parameter
    const para = urlObj.searchParams.get('Para');
    if (para) {
      return { baseUrl, imei: para };
    }
    
    // Try IMEI parameter
    const imei = urlObj.searchParams.get('IMEI') || urlObj.searchParams.get('imei');
    if (imei) {
      return { baseUrl, imei };
    }
    
    // Try to extract from path (e.g., /track/12345678)
    const pathMatch = urlObj.pathname.match(/\/(\d{8,15})(?:\/|$)/);
    if (pathMatch) {
      return { baseUrl, imei: pathMatch[1] };
    }
    
    return null;
  } catch {
    return null;
  }
};

// GPSOPS API: Fetch device last position
const fetchGpsopsLastPosition = async (baseUrl: string, imei: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const data = `N'${imei}'`;
    const url = `${baseUrl}/Interface/AppJson.asp?Cmd=Proc_GetLastPosition&Data=${encodeURIComponent(data)}&Field=&Callback=JsonP4`;
    
    const res = await fetch(url, { 
      method: 'GET',
      headers: {
        'Accept': '*/*',
      },
    });
    
    const text = (await res.text()).trim();
    
    // Parse JSONP: JsonP4({...})
    const start = text.indexOf('(');
    const end = text.lastIndexOf(')');
    
    if (start === -1 || end === -1) {
      return null;
    }
    
    const json = JSON.parse(text.slice(start + 1, end));
    
    if (String(json.m_isResultOk) !== '1') {
      return null;
    }
    
    const fields = json.m_arrField;
    const record = json.m_arrRecord?.[0];
    
    if (!fields || !record) {
      return null;
    }
    
    // Map fields to values
    const obj: Record<string, any> = {};
    fields.forEach((f: string, i: number) => {
      obj[f] = record[i];
    });
    
    const lat = parseFloat(obj.dbLat);
    const lng = parseFloat(obj.dbLon);
    
    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }
    
    return { lat, lng };
  } catch {
    return null;
  }
};

export const LiveOrderMap: React.FC<LiveOrderMapProps> = ({ orderId, trackingUrl, deliveryAddress }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(true);
  
  // TALABAT STYLE: User location and distance tracking
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [orderLocation, setOrderLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  // GPSOPS device location (fetched from API)
  const [gpsopsLocation, setGpsopsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsopsError, setGpsopsError] = useState<boolean>(false);
  
  // Extract GPSOPS info from tracking URL
  const gpsopsInfo = useMemo(() => {
    if (!trackingUrl) return null;
    return extractImeiFromUrl(trackingUrl);
  }, [trackingUrl]);

  // Request location permission and get user's current position
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationPermission(false);
          return;
        }
        setLocationPermission(true);
        
        // Get current position
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch {
        console.warn('Could not get user location');
      }
    };

    getUserLocation();
    
    // Update location every 30 seconds
    const interval = setInterval(getUserLocation, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate distance when user location or order location changes
  useEffect(() => {
    if (userLocation && orderLocation) {
      const dist = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        orderLocation.latitude,
        orderLocation.longitude
      );
      setDistance(dist);
    }
  }, [userLocation, orderLocation]);

  // Handle message from WebView to extract GPS coordinates from GPSOPS
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const messageData = JSON.parse(event.nativeEvent.data);

      // This payload comes from a third-party page, so it is untrusted input.
      // Truthiness is the wrong test in both directions: it rejects a legitimate
      // latitude of 0 (the equator), and it accepts a non-numeric string such as
      // "abc", which would then be stored as the map coordinate. Coerce, require
      // finite numbers, and range-check.
      const latitude = Number(messageData?.latitude);
      const longitude = Number(messageData?.longitude);

      const isValid =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180;

      if (isValid) {
        setOrderLocation({ latitude, longitude });
      }
    } catch {
      // Ignore parsing errors
    }
  };

  // JavaScript to inject into WebView to extract GPS coordinates
  const injectedJavaScript = `
    (function() {
      // Try to get coordinates from GPSOPS page
      const checkForCoords = () => {
        // Look for latitude/longitude in page content
        const text = document.body?.innerText || '';
        const latMatch = text.match(/latitude[:\\s]*([-\\d.]+)/i);
        const lngMatch = text.match(/longitude[:\\s]*([-\\d.]+)/i);
        
        if (latMatch && lngMatch) {
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            latitude: parseFloat(latMatch[1]),
            longitude: parseFloat(lngMatch[1])
          }));
        }
        
        // Also try to intercept map center changes
        if (window.google?.maps) {
          const maps = document.querySelectorAll('[class*="gm-style"]');
          // Additional map detection logic could go here
        }
      };
      
      // Check immediately and periodically
      checkForCoords();
      setInterval(checkForCoords, 5000);
    })();
    true;
  `;

  useEffect(() => {
    // If we have a trackingUrl, we don't need Firestore live_tracking
    if (trackingUrl) {
      setLoading(false);
      return;
    }

    let trackingChannel: any;
    let cancelled = false;

    const setupTracking = async () => {
      // Initial fetch
      const { data: initialData } = await supabase
        .from('live_tracking')
        .select('*')
        .eq('order_id', orderId)
        .single();

      // Effect torn down / orderId changed mid-fetch: don't subscribe an orphan.
      if (cancelled) return;

      if (initialData) {
        setData(initialData);
        if (initialData.latitude && initialData.longitude) {
          setOrderLocation({
            latitude: initialData.latitude,
            longitude: initialData.longitude,
          });
        }
      } else {
        setData(null);
      }
      setLoading(false);

      // Setup real-time listener
      trackingChannel = uniqueChannel(`public:live_tracking:${orderId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_tracking', filter: `order_id=eq.${orderId}` }, (payload) => {
          if (payload.new) {
            const newTracking = payload.new as any;
            setData(newTracking);
            if (newTracking.latitude && newTracking.longitude) {
              setOrderLocation({
                latitude: newTracking.latitude,
                longitude: newTracking.longitude,
              });
            }
          } else {
            setData(null);
          }
        })
        .subscribe();
    };

    setupTracking();

    return () => {
      cancelled = true;
      if (trackingChannel) {
        supabase.removeChannel(trackingChannel);
      }
    };
  }, [orderId, trackingUrl]);

  // Set order location from delivery address if provided (fallback)
  useEffect(() => {
    // Only use delivery address if we don't have GPSOPS location
    if (!gpsopsLocation && deliveryAddress?.latitude && deliveryAddress?.longitude) {
      setOrderLocation({
        latitude: deliveryAddress.latitude,
        longitude: deliveryAddress.longitude,
      });
    }
  }, [deliveryAddress, gpsopsLocation]);

  // GPSOPS API: Poll device location every 10 seconds
  useEffect(() => {
    if (!gpsopsInfo) return;
    
    let isActive = true;
    
    const fetchDeviceLocation = async () => {
      const location = await fetchGpsopsLastPosition(gpsopsInfo.baseUrl, gpsopsInfo.imei);
      
      if (isActive && location) {
        setGpsopsLocation(location);
        setGpsopsError(false);
        
        // Update order location from GPSOPS device (PRIORITY: this is real-time driver location!)
        setOrderLocation({
          latitude: location.lat,
          longitude: location.lng,
        });
      } else if (isActive && !location) {
        setGpsopsError(true);
      }
    };
    
    // Initial fetch
    fetchDeviceLocation();
    
    // Poll every 10 seconds
    const interval = setInterval(fetchDeviceLocation, 10000);
    
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [gpsopsInfo]);

  // Open tracking URL in external browser
  const openInBrowser = () => {
    if (trackingUrl) {
      Linking.openURL(trackingUrl).catch((err) => {
        console.warn('Could not open tracking URL:', err);
      });
    }
  };

  // TALABAT STYLE: Distance badge component
  const DistanceBadge = () => {
    if (!locationPermission) return null;
    if (distance === null) return null;
    
    // Show different indicator based on whether we have live driver location or just delivery address
    const isLiveDriver = gpsopsLocation !== null;
    const iconName = isLiveDriver ? 'car-sport' : 'navigate';
    const label = isLiveDriver 
      ? `${formatDistance(distance)} to driver` 
      : `${formatDistance(distance)} away`;
    
    return (
      <View style={[styles.distanceBadge, isLiveDriver && styles.distanceBadgeSuccess]}>
        <Ionicons name={iconName} size={12} color={COLORS.white} />
        <Text allowFontScaling={false} style={styles.distanceText}>{label}</Text>
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="small" />;

  // PRIORITY 1: If trackingUrl is set, show it in a WebView
  if (trackingUrl) {
    return (
      <View style={styles.trackingContainer}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.badgesRow}>
              <View style={styles.liveBadge}>
                <View style={styles.dot} />
                <Text allowFontScaling={false} style={styles.liveText}>LIVE GPS</Text>
              </View>
              <DistanceBadge />
            </View>
            <TouchableOpacity style={styles.browserButton} onPress={openInBrowser}>
              <Ionicons name="open-outline" size={16} color={COLORS.white} />
              <Text allowFontScaling={false} style={styles.browserButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
          
          {webViewLoading && (
            <View style={styles.webViewLoader}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text allowFontScaling={false} style={styles.loadingText}>Loading tracking...</Text>
            </View>
          )}
          
          <WebView
            source={{ uri: trackingUrl }}
            style={styles.webView}
            onLoadStart={() => setWebViewLoading(true)}
            onLoadEnd={() => setWebViewLoading(false)}
            onMessage={handleWebViewMessage}
            injectedJavaScript={injectedJavaScript}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={false}
            scalesPageToFit={true}
          />
        </View>
        
        {/* TALABAT STYLE: Visual Distance Tracker */}
        {distance !== null && gpsopsLocation && (
          <View style={styles.visualDistanceTracker}>
            {/* Header */}
            <View style={styles.trackerHeader}>
              <View style={styles.liveIndicator}>
                <View style={styles.pulsingDot} />
                <Text allowFontScaling={false} style={styles.liveLabel}>{t('liveTracking.headerLabel')}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.etaText}>{t('liveTracking.trackingDriver')}</Text>
            </View>
            
            {/* Progress Bar Visual */}
            <View style={styles.progressContainer}>
              {/* Driver Icon */}
              <View style={styles.driverIconContainer}>
                <View style={styles.driverIconBg}>
                  <Ionicons name="car-sport" size={24} color={COLORS.white} />
                </View>
                <Text allowFontScaling={false} style={styles.driverLabel}>{t('liveTracking.driver')}</Text>
              </View>
              
              {/* Journey Line */}
              <View style={styles.journeyLine}>
                <View style={styles.journeyLineInner}>
                  {/* Animated dots */}
                  <View style={styles.journeyDot} />
                  <View style={[styles.journeyDot, styles.journeyDot20]} />
                  <View style={[styles.journeyDot, styles.journeyDot40]} />
                  <View style={[styles.journeyDot, styles.journeyDot60]} />
                </View>
              </View>
              
              {/* Customer Icon */}
              <View style={styles.customerIconContainer}>
                <View style={styles.customerIconBg}>
                  <Ionicons name="home" size={20} color={COLORS.white} />
                </View>
                <Text allowFontScaling={false} style={styles.customerLabel}>{t('chat.you')}</Text>
              </View>
            </View>
            
            {/* Distance Display - Big & Bold */}
            <View style={styles.bigDistanceContainer}>
              <Ionicons name="navigate" size={28} color={COLORS.blue} />
              <Text allowFontScaling={false} style={styles.bigDistanceValue}>{formatDistance(distance)}</Text>
              <Text allowFontScaling={false} style={styles.bigDistanceLabel}>{t('liveTracking.toYourLocation')}</Text>
            </View>
            
            {/* Info Row */}
            <View style={styles.trackerInfoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={16} color={COLORS.grayDark} />
                <Text allowFontScaling={false} style={styles.infoText}>{t('liveTracking.updatesEvery')}</Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="location" size={16} color={COLORS.success} />
                <Text allowFontScaling={false} style={styles.infoText}>{t('liveTracking.gpsActive')}</Text>
              </View>
            </View>
          </View>
        )}
        
        {/* Fallback: Simple location info if no live GPSOPS tracking */}
        {(!gpsopsLocation || distance === null) && (
          <View style={styles.locationInfoBar}>
            <View style={styles.locationRow}>
              <View style={styles.locationIcon}>
                <Ionicons name="person" size={16} color={COLORS.white} />
              </View>
              <View style={styles.locationDetails}>
                <Text allowFontScaling={false} style={styles.locationLabel}>{t('liveTracking.yourLocation')}</Text>
                {userLocation ? (
                  <Text allowFontScaling={false} style={styles.locationCoords}>
                    📍 GPS: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                  </Text>
                ) : locationPermission === false ? (
                  <Text allowFontScaling={false} style={styles.locationError}>{t('location.permissionDenied')}</Text>
                ) : (
                  <Text allowFontScaling={false} style={styles.locationLoading}>{t('location.gettingLocation')}</Text>
                )}
              </View>
            </View>
            
            {/* Distance Display */}
            {distance !== null && (
              <View style={styles.distanceRow}>
                <Ionicons name="navigate" size={20} color={COLORS.blue} />
                <Text allowFontScaling={false} style={styles.distanceLabel}>{t('liveTracking.distanceToDelivery')}</Text>
                <Text allowFontScaling={false} style={styles.distanceValue}>{formatDistance(distance)}</Text>
              </View>
            )}
            
            {/* No distance available message */}
            {userLocation && !deliveryAddress && (
              <View style={styles.noDistanceRow}>
                <Ionicons name="information-circle" size={16} color={COLORS.textSecondary} />
                <Text allowFontScaling={false} style={styles.noDistanceText}>
                  {t('liveTracking.addGpsHint')}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }
  
  // PRIORITY 2: Check Supabase live_tracking
  // If no data or explicitly inactive
  if (!data || !data.is_active || !data.latitude) {
    return (
      <View style={styles.inactiveContainer}>
        <Ionicons name="location-outline" size={24} color={COLORS.grayDark} />
        <Text allowFontScaling={false} style={styles.inactiveText}>{t('liveTracking.notActive')}</Text>
        {distance !== null && (
          <View style={[styles.distanceBadge, styles.distanceBadgeWait]}>
            <Ionicons name="navigate" size={12} color={COLORS.white} />
            <Text allowFontScaling={false} style={styles.distanceText}>{formatDistance(distance)}</Text>
          </View>
        )}
      </View>
    );
  }

  // Check for stale signal (> 2 mins)
  const now = Date.now();
  const lastUpdate = data.updated_at ? new Date(data.updated_at).getTime() : now;
  const isStale = (now - lastUpdate) > 120000;

  // On iOS, MapView is null — show text-based location info instead
  if (!MapView) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.badgesRow}>
            <View style={styles.liveBadge}>
              <View style={styles.dot} />
              <Text allowFontScaling={false} style={styles.liveText}>{t('liveTracking.live')}</Text>
            </View>
            <DistanceBadge />
          </View>
          {isStale && <Text allowFontScaling={false} style={styles.staleText}>{t('liveTracking.signalLost')}</Text>}
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.grayLight }}>
          <Ionicons name="car" size={40} color={COLORS.primary} />
          <Text allowFontScaling={false} style={{ color: COLORS.grayVeryDark, fontSize: 14, marginTop: 8, fontWeight: '600' }}>
            {isStale ? t('liveTracking.lastKnownLocation') : t('product.onTheWay')}
          </Text>
          <Text allowFontScaling={false} style={{ color: COLORS.grayDark, fontSize: 12, marginTop: 4 }}>
            📍 {data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badgesRow}>
          <View style={styles.liveBadge}>
            <View style={styles.dot} />
            <Text allowFontScaling={false} style={styles.liveText}>{t('liveTracking.live')}</Text>
          </View>
          <DistanceBadge />
        </View>
        {isStale && <Text allowFontScaling={false} style={styles.staleText}>{t('liveTracking.signalLost')}</Text>}
      </View>

      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: data.latitude,
          longitude: data.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        region={{
          latitude: data.latitude,
          longitude: data.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        scrollEnabled={false}
      >
        <Marker 
          coordinate={{ latitude: data.latitude, longitude: data.longitude }}
          title="Your Order"
          description={isStale ? "Last known location" : "On the way"}
        >
          <View style={styles.markerContainer}>
            <Ionicons name="car" size={24} color="white" />
          </View>
        </Marker>
        
        {/* Show user's location marker if available */}
        {userLocation && (
          <Marker 
            coordinate={userLocation}
            title="Your Location"
          >
            <View style={styles.userMarkerContainer}>
              <Ionicons name="person" size={16} color="white" />
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
};

// Define colors
const COLORS = {
  white: 'white',
  black: '#000',
  error: '#ff4444',
  success: '#4CAF50',
  primary: '#007AFF',
  blue: '#4285F4',
  grayLight: '#f5f5f5',
  grayMedium: '#eee',
  grayDark: '#666',
  grayVeryDark: '#333',
  textSecondary: '#999',
  overlay: 'rgba(0,0,0,0.7)',
  overlayLight: 'rgba(0,0,0,0.6)',
  distanceBg: '#e3f2fd',
  locationError: '#e74c3c',
};

const styles = StyleSheet.create({
  badgesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  bigDistanceContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  bigDistanceLabel: {
    color: COLORS.grayDark,
    fontSize: 12,
  },
  bigDistanceValue: {
    color: COLORS.blue,
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 4,
  },
  browserButton: {
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  browserButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    elevation: 3,
    height: 280,
    marginVertical: 12,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  customerIconBg: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  customerIconContainer: {
    alignItems: 'center',
    zIndex: 2,
  },
  customerLabel: {
    color: COLORS.grayDark,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  distanceBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.blue,
    borderRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  distanceBadgeSuccess: {
    backgroundColor: COLORS.success,
  },
  distanceBadgeWait: {
    backgroundColor: COLORS.grayDark,
  },
  distanceLabel: {
    color: COLORS.grayVeryDark,
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  distanceRow: {
    alignItems: 'center',
    backgroundColor: COLORS.distanceBg,
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  distanceText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '600',
  },
  distanceValue: {
    color: COLORS.blue,
    fontSize: 18,
    fontWeight: '700',
  },
  dot: {
    backgroundColor: COLORS.white,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  driverIconBg: {
    alignItems: 'center',
    backgroundColor: COLORS.success,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  driverIconContainer: {
    alignItems: 'center',
    zIndex: 2,
  },
  driverLabel: {
    color: COLORS.grayDark,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  etaText: {
    color: COLORS.grayDark,
    fontSize: 12,
    fontStyle: 'italic',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 10,
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 10,
  },
  inactiveContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    borderColor: COLORS.grayMedium,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 80,
    justifyContent: 'center',
    marginVertical: 12,
  },
  inactiveText: {
    color: COLORS.grayDark,
    fontSize: 14,
    fontWeight: '500',
  },
  infoItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  infoText: {
    color: COLORS.grayDark,
    fontSize: 11,
  },
  journeyDot: {
    backgroundColor: COLORS.success,
    borderRadius: 2,
    height: 4,
    position: 'absolute',
    width: 4,
  },
  journeyDot20: {
    marginLeft: '20%',
  },
  journeyDot40: {
    marginLeft: '40%',
  },
  journeyDot60: {
    marginLeft: '60%',
  },
  journeyLine: {
    backgroundColor: COLORS.grayMedium,
    flex: 1,
    height: 2,
    marginHorizontal: 10,
    marginTop: -14,
  },
  journeyLineInner: {
    position: 'relative',
    width: '100%',
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.error,
    borderRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  liveIndicator: {
    alignItems: 'center',
    backgroundColor: COLORS.error,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveLabel: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  liveText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingText: {
    color: COLORS.grayDark,
    fontSize: 14,
    marginTop: 10,
  },
  locationCoords: {
    color: COLORS.grayDark,
    fontSize: 12,
  },
  locationDetails: {
    flex: 1,
  },
  locationError: {
    color: COLORS.locationError,
    fontSize: 12,
  },
  locationIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.success,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    marginRight: 10,
    width: 32,
  },
  locationInfoBar: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.grayMedium,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 3,
    marginTop: 10,
    padding: 12,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  locationLabel: {
    color: COLORS.grayVeryDark,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  locationLoading: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 2,
    elevation: 5,
    padding: 6,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  noDistanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingTop: 8,
  },
  noDistanceText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  progressContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 20,
    paddingHorizontal: 10,
  },
  pulsingDot: {
    backgroundColor: COLORS.white,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  staleText: {
    backgroundColor: COLORS.overlayLight,
    borderRadius: 4,
    color: COLORS.white,
    fontSize: 12,
    overflow: 'hidden',
    padding: 4,
  },
  trackerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trackerInfoRow: {
    borderTopColor: COLORS.grayMedium,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingTop: 10,
  },
  trackingContainer: {
    marginVertical: 12,
  },
  userMarkerContainer: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 2,
    elevation: 5,
    padding: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  visualDistanceTracker: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.grayMedium,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 3,
    marginBottom: 10,
    marginTop: 10,
    padding: 16,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  webView: {
    flex: 1,
  },
  webViewLoader: {
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
});
