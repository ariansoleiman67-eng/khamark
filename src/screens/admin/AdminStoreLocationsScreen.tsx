import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext'; // OWNERSHIP: Get current admin
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { locationService, StoreLocation } from '../../services/locationService';

const COLORS = {
  activeGreen: '#4CAF50',
  deleteRed: '#FF5722',
  deleteRedLight: '#FF572220',
  white: '#FFFFFF',
  shadow: '#000000',
};

const AdminStoreLocationsScreen = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth(); // OWNERSHIP: Get current admin
  const currentAdminId = user?.uid || '';
  
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocations = async () => {
    if (!currentAdminId) {
      setLoading(false);
      return;
    }
    try {
      // OWNERSHIP: Load only locations owned by this admin
      const data = await locationService.getLocationsByAdmin(currentAdminId);
      setLocations(data);
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.storeLocations.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadLocations();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadLocations();
  };

  const handleDelete = (location: StoreLocation) => {
    Alert.alert(
      t('admin.storeLocations.delete'),
      t('admin.storeLocations.deleteConfirm', { name: location.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.storeLocations.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // OWNERSHIP: Pass adminId for ownership verification
              await locationService.deleteLocation(location.id, currentAdminId);
              setLocations(prev => prev.filter(l => l.id !== location.id));
              Alert.alert(t('admin.common.success'), t('admin.storeLocations.deleteSuccess'));
            } catch (error: any) {
              Alert.alert(t('admin.common.error'), error.message || t('admin.storeLocations.deleteFailed'));
            }
          }
        }
      ]
    );
  };

  const renderLocationItem = ({ item }: { item: StoreLocation }) => (
    <TouchableOpacity
      style={[styles.locationCard, { backgroundColor: theme.colors.surface }]}
      onPress={() => navigation.navigate('AdminEditStoreLocation', { locationId: item.id })}
    >
      <View style={styles.locationHeader}>
        <View style={[styles.typeIndicator, { backgroundColor: locationService.getStoreTypeColor(item.type) }]} />
        <View style={styles.locationInfo}>
          <Text allowFontScaling={false} style={[styles.locationName, { color: theme.colors.text }]}>{item.name}</Text>
          <Text allowFontScaling={false} style={[styles.locationType, { color: theme.colors.textSecondary }]}>
            {item.type.toUpperCase()} • {item.city}
          </Text>
        </View>
        <View style={[
          styles.statusBadge,
          { backgroundColor: item.isActive ? COLORS.activeGreen : COLORS.deleteRed }
        ]}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.statusText}>{item.isActive ? t('admin.storeLocations.active') : t('admin.storeLocations.inactive')}</Text>
        </View>
      </View>

      <View style={styles.locationDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {item.address}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={16} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]}>
            {item.phone}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.colors.primary + '20' }]}
          onPress={() => navigation.navigate('AdminEditStoreLocation', { locationId: item.id })}
        >
          <Ionicons name="pencil" size={18} color={theme.colors.primary} />
          <Text allowFontScaling={false} style={[styles.actionText, { color: theme.colors.primary }]}>{t('admin.storeLocations.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item)}
        >
          <Ionicons name="trash" size={18} color={COLORS.deleteRed} />
          <Text allowFontScaling={false} style={[styles.actionText, styles.deleteText]}>{t('admin.storeLocations.delete')}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.storeLocations.title')}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('AdminEditStoreLocation', {})}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {locations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            {t('admin.storeLocations.noLocations')}
          </Text>
          <TouchableOpacity
            style={[styles.addFirstButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.navigate('AdminEditStoreLocation', {})}
          >
            <Ionicons name="add" size={20} color={COLORS.white} />
            <Text allowFontScaling={false} style={styles.addFirstText}>{t('admin.storeLocations.addFirstLocation')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={item => item.id}
          renderItem={renderLocationItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      {/* FAB */}
      {locations.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => navigation.navigate('AdminEditStoreLocation', {})}
        >
          <Ionicons name="add" size={28} color={COLORS.white} />
        </TouchableOpacity>
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
    marginHorizontal: 4,
    paddingVertical: SPACING.sm,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: SPACING.md,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  addButton: {
    padding: 4,
  },
  addFirstButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  addFirstText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  backButton: {
    padding: 4,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  deleteButton: {
    backgroundColor: COLORS.deleteRedLight,
  },
  deleteText: {
    color: COLORS.deleteRed,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  fab: {
    alignItems: 'center',
    borderRadius: 28,
    bottom: 24,
    elevation: 5,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 56,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: 100,
  },
  locationCard: {
    borderRadius: 12,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  locationDetails: {
    marginTop: SPACING.sm,
  },
  locationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  locationInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
  },
  locationType: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  statusText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '600',
  },
  typeIndicator: {
    borderRadius: 4,
    height: 40,
    width: 4,
  },
});

export default AdminStoreLocationsScreen;
