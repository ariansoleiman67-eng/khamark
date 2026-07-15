import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
// iOS CRASH FIX: react-native-maps crashes on iOS with newArchEnabled (Fabric).
// Only import on Android. iOS uses SafeMapView's static image fallback.
let Marker: any = null;
if (Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    Marker = maps.Marker;
  } catch {}
}
import SafeMapView from '../../components/SafeMapView';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { SPACING } from '../../constants/theme';
import addressService from '../../services/addressService';
import { Address } from '../../types';

const { width } = Dimensions.get('window');

const MyAddressScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isMountedRef = React.useRef(true);

  const loadAddresses = async () => {
    if (!user?.uid) {
      // Production: console.warn removed
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userAddresses = await addressService.getUserAddresses(user.uid);
      setAddresses(userAddresses);
    } catch (error) {
      console.error('Error loading addresses:', error);
      Alert.alert(t('common.error'), t('addresses.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAddresses();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      loadAddresses();
      return () => {
        isMountedRef.current = false;
      };
    }, [])
  );

  const handleSetDefault = async (addressId: string) => {
    if (!user?.uid) {
      Alert.alert(t('common.error'), t('auth.userNotAuthenticated'));
      return;
    }

    try {
      await addressService.setDefaultAddress(user.uid, addressId);

      // Update local state
      setAddresses(prev => prev.map(addr => ({
        ...addr,
        isDefault: addr.id === addressId
      })));

      Alert.alert(t('common.success'), t('addresses.defaultAddressUpdated'));
    } catch (error) {
      console.error('Error setting default address:', error);
      Alert.alert(t('common.error'), t('addresses.failedToUpdateDefault'));
    }
  };

  const handleDeleteAddress = async (addressId: string, addressTitle: string) => {
    Alert.alert(
      t('addresses.deleteAddress'),
      t('addresses.deleteConfirmation', { title: addressTitle }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(addressId);

              await addressService.deleteAddress(addressId);

              // Update local state
              setAddresses(prev => prev.filter(addr => addr.id !== addressId));
              Alert.alert(t('common.success'), t('addresses.addressDeleted'));
            } catch (error) {
              console.error('Error deleting address:', error);
              Alert.alert(t('common.error'), t('addresses.failedToDelete'));
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleEditAddress = (address: Address) => {
    // Navigate to Add/Edit Address screen with address data
    navigation.navigate('AddEditAddress', { address });
  };

  const handleAddNewAddress = () => {
    try {
      // Navigate to Add/Edit Address screen without address data (new address)
      (navigation as any).navigate('AddEditAddress');
    } catch (error) {
      console.error('❌ Navigation error:', error);
      Alert.alert(t('common.error'), t('addresses.navigationError'));
    }
  };


  const renderAddressCard = (address: Address) => (
    <View
      key={address.id}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: address.isDefault ? 2 : 1,
        borderColor: address.isDefault ? theme.colors.primary : theme.colors.border,
      }}
    >
      {/* Header */}
      <View style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING.md,
      }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', flex: 1 }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.primary + '20',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: isRTL ? 0 : SPACING.md,
            marginLeft: isRTL ? SPACING.md : 0,
          }}>
            <Ionicons
              name="location"
              size={20}
              color={theme.colors.primary}
            />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
              <Text allowFontScaling={false} style={{
                fontSize: 18,
                fontWeight: '600',
                color: theme.colors.text,
                marginRight: isRTL ? 0 : SPACING.sm,
                marginLeft: isRTL ? SPACING.sm : 0,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {address.title}
              </Text>
              {address.isDefault && (
                <View style={{
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: SPACING.sm,
                  paddingVertical: 2,
                  borderRadius: 12,
                }}>
                  <Text allowFontScaling={false} style={{
                    fontSize: 12,
                    color: 'white',
                    fontWeight: '500',
                  }}>
                    {t('addresses.default')}
                  </Text>
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              marginTop: 2,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {address.fullName} • {address.phone}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => handleEditAddress(address)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.colors.primary + '20',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: SPACING.sm,
            }}
          >
            <Ionicons name="pencil" size={16} color={theme.colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleDeleteAddress(address.id, address.title)}
            disabled={deletingId === address.id}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.colors.error + '20',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {deletingId === address.id ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <Ionicons name="trash" size={16} color={theme.colors.error} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Address Details */}
      <View style={{ marginBottom: SPACING.md }}>
        <Text allowFontScaling={false} style={{
          fontSize: 16,
          color: theme.colors.text,
          lineHeight: 22,
          marginBottom: SPACING.sm,
          textAlign: isRTL ? 'right' : 'left',
        }}>
          {address.address}
        </Text>
        <Text allowFontScaling={false} style={{
          fontSize: 14,
          color: theme.colors.textSecondary,
          textAlign: isRTL ? 'right' : 'left',
        }}>
          {address.city}, {address.region}
        </Text>
        {address.landmark && (
          <Text allowFontScaling={false} style={{
            fontSize: 14,
            color: theme.colors.primary,
            marginTop: SPACING.xs,
            fontStyle: 'italic',
          }}>
            📍 {address.landmark}
          </Text>
        )}

        {/* Location Map */}
        {address.coordinates && (
          <View style={{
            marginTop: SPACING.md,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: theme.colors.border,
          }}>
            <SafeMapView
              style={{
                width: '100%',
                height: 120,
              }}
              initialRegion={{
                latitude: address.coordinates.latitude,
                longitude: address.coordinates.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              showsUserLocation={false}
              showsMyLocationButton={false}
              fallbackComponent={
                <View style={{
                  height: 120,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: theme.colors.surface,
                }}>
                  <Ionicons name="location" size={24} color={theme.colors.textSecondary} />
                  <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 6 }}>
                    {address.coordinates.latitude.toFixed(4)}, {address.coordinates.longitude.toFixed(4)}
                  </Text>
                  <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 10, marginTop: 4 }}>
                    {t('addresses.mapUnavailable', { defaultValue: 'Map unavailable' })}
                  </Text>
                </View>
              }
            >
              <Marker
                coordinate={{
                  latitude: address.coordinates.latitude,
                  longitude: address.coordinates.longitude,
                }}
                title={address.title}
                description={address.address}
              />
            </SafeMapView>

            {/* Map Overlay with Location Info */}
            <View style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              padding: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="location" size={12} color="white" />
                <Text allowFontScaling={false} style={{
                  color: 'white',
                  fontSize: 11,
                  marginLeft: 4,
                  fontFamily: 'monospace',
                }}>
                  {address.coordinates.latitude.toFixed(6)}, {address.coordinates.longitude.toFixed(6)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Location status when no coordinates */}
        {!address.coordinates && (
          <View style={{
            marginTop: SPACING.sm,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: theme.colors.warning + '10',
            borderRadius: 4,
            alignSelf: 'flex-start',
          }}>
            <Ionicons name="location-outline" size={12} color={theme.colors.warning} />
            <Text allowFontScaling={false} style={{
              fontSize: 11,
              color: theme.colors.warning,
              marginLeft: 4,
            }}>
              {t('addresses.noLocationSet', { defaultValue: 'No location set' })}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      {!address.isDefault && (
        <TouchableOpacity
          onPress={() => handleSetDefault(address.id)}
          style={{
            backgroundColor: theme.colors.primary + '10',
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            borderRadius: 8,
            alignSelf: 'flex-start',
          }}
        >
          <Text allowFontScaling={false} style={{
            fontSize: 14,
            color: theme.colors.primary,
            fontWeight: '600',
          }}>
            {t('addresses.setAsDefault')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text allowFontScaling={false} style={{
          fontSize: 16,
          color: theme.colors.textSecondary,
          marginTop: SPACING.md,
          includeFontPadding: false,
          textAlignVertical: 'center',
          textAlign: 'center',
          paddingHorizontal: 20,
        }}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => {
              try {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('Profile' as never);
                }
              } catch (error) {
                console.error('Navigation error:', error);
              }
            }}>
              <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={{
              fontSize: 18,
              fontWeight: '600',
              color: theme.colors.text,
              marginLeft: isRTL ? 0 : SPACING.md,
              marginRight: isRTL ? SPACING.md : 0,
              includeFontPadding: false,
              textAlignVertical: 'center',
              paddingVertical: 2, // Added small padding to prevent vertical clipping
            }}>
              {t('addresses.myAddresses')}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleAddNewAddress}
            style={{
              backgroundColor: theme.colors.primary,
              width: 36,
              height: 36,
              borderRadius: 18,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="add" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {addresses.length === 0 ? (
            /* Empty State */
            <View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: SPACING.xl * 2,
            }}>
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: theme.colors.primary + '20',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: SPACING.lg,
              }}>
                <Ionicons name="location-outline" size={40} color={theme.colors.primary} />
              </View>

              <Text allowFontScaling={false} style={{
                fontSize: 20,
                fontWeight: '600',
                color: theme.colors.text,
                marginBottom: SPACING.sm,
                textAlign: 'center',
              }}>
                {t('addresses.noAddressesAdded')}
              </Text>

              <Text allowFontScaling={false} style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                textAlign: 'center',
                lineHeight: 24,
                marginBottom: SPACING.xl,
              }}>
                {t('addresses.noAddressesDescription')}
              </Text>

              <TouchableOpacity
                onPress={handleAddNewAddress}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: SPACING.xl,
                  paddingVertical: SPACING.md,
                  borderRadius: 25,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="add" size={20} color="white" style={{ marginRight: SPACING.sm }} />
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: 'white',
                }}>
                  {t('addresses.addNewAddress')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Address List */
            <>
              {/* Header Info */}
              <View style={{
                backgroundColor: theme.colors.primary + '10',
                padding: SPACING.lg,
                borderRadius: 12,
                marginBottom: SPACING.lg,
              }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.primary,
                  marginBottom: SPACING.sm,
                }}>
                  {t('addresses.deliveryAddresses', { count: addresses.length })}
                </Text>
                <Text allowFontScaling={false} style={{
                  fontSize: 14,
                  color: theme.colors.primary,
                  lineHeight: 20,
                }}>
                  {t('addresses.manageAddressesDescription')}
                </Text>
              </View>

              {/* Address Cards */}
              {addresses.map(renderAddressCard)}

              {/* Add New Address Button */}
              <TouchableOpacity
                onPress={handleAddNewAddress}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: SPACING.lg,
                  borderWidth: 2,
                  borderColor: theme.colors.primary,
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  marginTop: SPACING.md,
                }}
              >
                <Ionicons name="add-circle" size={32} color={theme.colors.primary} />
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.primary,
                  marginTop: SPACING.sm,
                }}>
                  {t('addresses.addNewAddress')}
                </Text>
                <Text allowFontScaling={false} style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  marginTop: SPACING.xs,
                  textAlign: 'center',
                }}>
                  {t('addresses.addAddressesHint', { defaultValue: 'Add delivery addresses for faster checkout' })}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default MyAddressScreen;
