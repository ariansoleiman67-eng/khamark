import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService } from '../../services/tenantAdminService';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { Discount } from '../../types';

const AdminDiscountsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDiscounts = useCallback(async () => {
    if (!tenantId) {
      if (!tenantLoading) {
        setLoading(false);
      }
      return;
    }

    try {
      const service = createTenantAdminService(tenantId);
      const data = await service.getAllDiscounts();
      setDiscounts(data as Discount[]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Failed to load discounts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, tenantLoading]);

  useFocusEffect(
    useCallback(() => {
      if (!tenantLoading) {
        loadDiscounts();
      }
    }, [loadDiscounts, tenantLoading])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDiscounts();
  };

  const handleToggleStatus = async (discount: Discount) => {
    if (!tenantId) return;
    try {
      const service = createTenantAdminService(tenantId);
      const newStatus = await service.toggleDiscountStatus(discount.id);
      setDiscounts(prev => 
        prev.map(d => d.id === discount.id ? { ...d, isActive: newStatus } : d)
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    }
  };

  const handleDelete = (discount: Discount) => {
    if (!tenantId) return;
    Alert.alert(
      t('admin.discounts.deleteTitle'),
      t('admin.discounts.deleteMessage', { name: discount.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const service = createTenantAdminService(tenantId);
              await service.deleteDiscount(discount.id);
              setDiscounts(prev => prev.filter(d => d.id !== discount.id));
              Alert.alert(t('common.success'), t('admin.discounts.deleteSuccess'));
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message);
            }
          },
        },
      ]
    );
  };

  // Helper to get discount status
  const getDiscountStatus = (discount: Discount): string => {
    const now = Date.now();
    // Supabase returns ISO strings (not Firestore Timestamps); support both + Date.
    const toMs = (d: any): number => {
      if (!d) return 0;
      if (typeof d.toMillis === 'function') return d.toMillis();
      if (typeof d.seconds === 'number') return d.seconds * 1000;
      const ms = new Date(d).getTime();
      return isNaN(ms) ? 0 : ms;
    };
    const startTime = toMs(discount.startDate);
    const endTime = toMs(discount.endDate);

    if (!discount.isActive) return 'inactive';
    if (startTime > now) return 'scheduled';
    if (endTime < now) return 'expired';
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) return 'limit_reached';
    return 'active';
  };

  // Helper to format discount value for display
  const formatDiscountValue = (discount: Discount): string => {
    switch (discount.type) {
      case 'percentage':
        return `${discount.value}% OFF`;
      case 'fixed':
        return `$${discount.value} OFF`;
      case 'bundle':
        return `${discount.bundleQuantity} for $${discount.bundlePrice}`;
      default:
        return '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'scheduled':
        return '#2196F3';
      case 'expired':
      case 'limit_reached':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return t('admin.discounts.statusActive');
      case 'scheduled':
        return t('admin.discounts.statusScheduled');
      case 'expired':
        return t('admin.discounts.statusExpired');
      case 'limit_reached':
        return t('admin.discounts.statusLimitReached');
      default:
        return t('admin.discounts.statusInactive');
    }
  };

  const renderDiscountCard = (discount: Discount, index: number) => {
    const status = getDiscountStatus(discount);
    const statusColor = getStatusColor(status);
    const valueDisplay = formatDiscountValue(discount);

    return (
      <Animated.View
        key={discount.id}
        entering={FadeInUp.duration(250)}
      >
        <TouchableOpacity
          style={[styles.discountCard, { backgroundColor: theme.colors.surface }]}
          onPress={() => navigation.navigate('AdminEditDiscount', { discountId: discount.id })}
          activeOpacity={0.7}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.discountInfo}>
              <Text allowFontScaling={false} style={[styles.discountName, { color: theme.colors.text }]}>
                {discount.name}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text allowFontScaling={false} style={[styles.statusText, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {getStatusLabel(status)}
                </Text>
              </View>
            </View>
            <View style={[styles.valueTag, { backgroundColor: theme.colors.primary + '20' }]}>
              <Text allowFontScaling={false} style={[styles.valueText, { color: theme.colors.primary }]}>
                {valueDisplay}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]}>
                {discount.startDate ? new Date(discount.startDate as any).toLocaleDateString() : ''} - {discount.endDate ? new Date(discount.endDate as any).toLocaleDateString() : ''}
              </Text>
            </View>
            
            {discount.minPurchase && (
              <View style={styles.detailRow}>
                <Ionicons name="wallet-outline" size={16} color={theme.colors.textSecondary} />
                <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]}>
                  Min Order: ${discount.minPurchase}
                </Text>
              </View>
            )}

            {discount.minQuantity && (
              <View style={styles.detailRow}>
                <Ionicons name="basket-outline" size={16} color={theme.colors.textSecondary} />
                <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]}>
                  Min Items: {discount.minQuantity}
                </Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Ionicons name="stats-chart-outline" size={16} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.used')}: {discount.usageCount}
                {discount.usageLimit ? ` / ${discount.usageLimit}` : ''}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="cube-outline" size={16} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.detailText, { color: theme.colors.textSecondary }]}>
                {discount.productIds && discount.productIds.length > 0 
                  ? `${discount.productIds.length} ${t('admin.discounts.specificProducts')}`
                  : t('admin.discounts.allProducts')
                }
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.primary + '20' }]}
              onPress={() => handleToggleStatus(discount)}
            >
              <Ionicons 
                name={discount.isActive ? 'pause-outline' : 'play-outline'} 
                size={18} 
                color={theme.colors.primary} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#2196F3' + '20' }]}
              onPress={() => navigation.navigate('AdminEditDiscount', { discountId: discount.id })}
            >
              <Ionicons name="create-outline" size={18} color="#2196F3" />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#F44336' + '20' }]}
              onPress={() => handleDelete(discount)}
            >
              <Ionicons name="trash-outline" size={18} color="#F44336" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.headerContainer}>
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.primaryVariant || theme.colors.primary]}
          style={styles.headerGradient}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Ionicons name="pricetag" size={32} color="#fff" />
            <Text allowFontScaling={false} style={styles.headerTitle}>{t('admin.discounts.title')}</Text>
            <Text allowFontScaling={false} style={styles.headerSubtitle}>
              {discounts.length} {t('admin.discounts.discountsCount')}
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Discounts List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {discounts.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(200)} style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={64} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
              {t('admin.discounts.noDiscounts')}
            </Text>
            <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              {t('admin.discounts.noDiscountsHint')}
            </Text>
          </Animated.View>
        ) : (
          discounts.map((discount, index) => renderDiscountCard(discount, index))
        )}
        
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => navigation.navigate('AdminEditDiscount', {})}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    marginLeft: 8,
    width: 36,
  },
  backButton: {
    left: SPACING.md,
    position: 'absolute',
    top: SPACING.md,
    zIndex: 1,
  },
  bottomSpacing: {
    height: 100,
  },
  cardActions: {
    borderTopColor: 'rgba(0,0,0,0.05)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
  },
  cardDetails: {
    marginTop: SPACING.sm,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 6,
  },
  detailText: {
    fontSize: 13,
    marginLeft: 6,
  },
  discountCard: {
    borderRadius: 12,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  discountInfo: {
    flex: 1,
  },
  discountName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: SPACING.xl,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: SPACING.md,
  },
  fab: {
    alignItems: 'center',
    borderRadius: 28,
    bottom: 90,
    elevation: 8,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    width: 56,
  },
  headerContainer: {
    margin: SPACING.md,
  },
  headerContent: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  headerGradient: {
    borderRadius: 16,
    padding: SPACING.lg,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: SPACING.sm,
  },
  loadingText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
  },
  scrollView: {
    flex: 1,
  },
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 12,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 4,
    width: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  valueTag: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  valueText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default AdminDiscountsScreen;
