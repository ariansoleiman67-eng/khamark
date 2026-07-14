
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTenant } from '../../contexts/TenantContext';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import adminService from '../../services/adminService';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { ReportsGenerator } from './ReportsGenerator';

const AdminAnalyticsScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { tenantId } = useTenant(); // Get tenantId
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d;
  });
  const [endDate, setEndDate] = useState(() => new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [data, setData] = useState<{
    totalOrders: number;
    totalRevenue: number;
    totalRevenueIQD?: number;
    hasUSDOrders?: boolean;
    hasIQDOrders?: boolean;
    totalUnpaid: number;
    totalUnpaidIQD?: number;
    totalProfit?: number;
    totalProfitIQD?: number;
    totalCollected?: number;
    totalCollectedIQD?: number;
    ordersByStatus: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, tenantId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Pass tenantId to service
      const analyticsData = await adminService.getAnalyticsData(startDate, endDate, tenantId);
      setData(analyticsData);
    } catch (error) {
      // console.error('Error fetching analytics:', error);
      Alert.alert(t('admin.common.error'), t('admin.analytics.noData'));
    } finally {
      setLoading(false);
    }
  };

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (!selectedDate) return;
    if (selectedDate > endDate) {
      Alert.alert(t('admin.common.error'), t('admin.analytics.invalidRange', { defaultValue: 'Start date must be before the end date.' }));
      return;
    }
    setStartDate(selectedDate);
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (!selectedDate) return;
    if (selectedDate < startDate) {
      Alert.alert(t('admin.common.error'), t('admin.analytics.invalidRange', { defaultValue: 'End date must be after the start date.' }));
      return;
    }
    setEndDate(selectedDate);
  };

  const StatCard = ({ title, value, icon, color }: { title: string; value: string; icon: any; color: string }) => (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, marginBottom: SPACING.md }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <Text allowFontScaling={false} style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
      </View>
      <Text allowFontScaling={false} style={[styles.cardValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.analytics.title')}</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Date Filters */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, marginBottom: SPACING.lg }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.analytics.dateRange')}</Text>
          
          <View style={styles.dateContainer}>
            <View style={styles.dateWrapper}>
              <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.textSecondary }]}>{t('admin.analytics.from', { defaultValue: 'From' })}</Text>
              {Platform.OS === 'android' ? (
                <TouchableOpacity
                  style={[styles.dateButton, { borderColor: theme.colors.border }]}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Text allowFontScaling={false} style={{ color: theme.colors.text }}>{startDate.toLocaleDateString('en-US')}</Text>
                  <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="default"
                  onChange={onStartDateChange}
                  style={styles.datePicker}
                  maximumDate={endDate}
                />
              )}
            </View>

            <View style={styles.dateWrapper}>
              <Text allowFontScaling={false} style={[styles.label, { color: theme.colors.textSecondary }]}>{t('admin.analytics.to', { defaultValue: 'To' })}</Text>
              {Platform.OS === 'android' ? (
                <TouchableOpacity
                  style={[styles.dateButton, { borderColor: theme.colors.border }]}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Text allowFontScaling={false} style={{ color: theme.colors.text }}>{endDate.toLocaleDateString('en-US')}</Text>
                  <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="default"
                  onChange={onEndDateChange}
                  style={styles.datePicker}
                  minimumDate={startDate}
                />
              )}
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loadingIndicator} />
        ) : (
          <View style={styles.statsGrid}>
            {data?.hasUSDOrders && (
              <StatCard
                title={t('admin.analytics.totalRevenue')}
                value={`$${parseFloat((data.totalRevenue || 0).toFixed(2))}`}
                icon="cash"
                color="#4CAF50"
              />
            )}
            {data?.hasIQDOrders && (
              <StatCard
                title={t('admin.analytics.totalRevenueIQD', { defaultValue: 'Total Revenue (IQD)' })}
                value={`${Math.round(data.totalRevenueIQD || 0).toLocaleString('en-US')} IQD`}
                icon="cash"
                color="#8BC34A"
              />
            )}
            {data?.hasUSDOrders && (
              <StatCard
                title={t('admin.analytics.totalCollected', { defaultValue: 'Collected (Cash In)' })}
                value={`$${parseFloat((data.totalCollected || 0).toFixed(2))}`}
                icon="checkmark-done-circle"
                color="#16A34A"
              />
            )}
            {data?.hasIQDOrders && (
              <StatCard
                title={t('admin.analytics.totalCollectedIQD', { defaultValue: 'Collected (IQD)' })}
                value={`${Math.round(data.totalCollectedIQD || 0).toLocaleString('en-US')} IQD`}
                icon="checkmark-done-circle"
                color="#22C55E"
              />
            )}
            {data?.hasUSDOrders && (
              <StatCard
                title={t('admin.analytics.totalProfit')}
                value={`$${parseFloat((data.totalProfit !== undefined ? data.totalProfit : 0).toFixed(2))}`}
                icon="wallet"
                color="#009688"
              />
            )}
            {data?.hasIQDOrders && (
              <StatCard
                title={t('admin.analytics.totalProfitIQD', { defaultValue: 'Total Profit (IQD)' })}
                value={`${Math.round(data.totalProfitIQD || 0).toLocaleString('en-US')} IQD`}
                icon="wallet"
                color="#E91E63"
              />
            )}
            <StatCard
              title={t('admin.analytics.totalOrders')}
              value={data?.totalOrders.toString() || '0'}
              icon="cart"
              color="#2196F3"
            />
            {data?.hasUSDOrders && (
              <StatCard
                title={t('admin.analytics.totalUnpaid')}
                value={`$${(data.totalUnpaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon="alert-circle"
                color="#FF5722"
              />
            )}
            {data?.hasIQDOrders && (
              <StatCard
                title={t('admin.analytics.totalUnpaidIQD', { defaultValue: 'Total Unpaid (IQD)' })}
                value={`${Math.round(data.totalUnpaidIQD || 0).toLocaleString('en-US')} IQD`}
                icon="alert-circle"
                color="#FF9800"
              />
            )}
          </View>
        )}

        {/* Status Breakdown */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: SPACING.md }]}>{t('admin.analytics.ordersByStatus')}</Text>
          {Object.entries(data?.ordersByStatus || {}).map(([status, count]) => {
            const normalizedStatus = status.toLowerCase();
            const translationKey = `admin.orders.status.${normalizedStatus}` as any;
            let displayStatus = t(translationKey);
            if (displayStatus === translationKey) {
              displayStatus = status; // Fallback if translation is missing
            }
            return (
            <View key={status} style={[styles.statusRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.statusLabelContainer}>
                <Text allowFontScaling={false} style={[styles.statusLabel, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {displayStatus}
                </Text>
              </View>
              <View style={[styles.statusBarContainer, { backgroundColor: theme.colors.border }]}>
                <View 
                  style={[
                    styles.statusBar, 
                    { 
                      width: `${(count / (data?.totalOrders || 1)) * 100}%`,
                      backgroundColor: theme.colors.primary 
                    }
                  ]} 
                />
              </View>
              <Text allowFontScaling={false} style={[styles.statusCount, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{count}</Text>
            </View>
            );
          })}
          {(!data?.ordersByStatus || Object.keys(data.ordersByStatus).length === 0) && (
            <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('admin.analytics.noData')}</Text>
          )}
        </View>

        <ReportsGenerator />

      </ScrollView>

      {/* Android Date Pickers */}
      {/* Android Date Pickers - Render separate pickers like AdminExportOrdersScreen */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={onStartDateChange}
          maximumDate={endDate}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={onEndDateChange}
          minimumDate={startDate}
        />
      )}
    </View>
  );
};

const ANALYTICS_STYLES = {
  dividerColor: 'rgba(0,0,0,0.05)',
  barBackground: 'rgba(0,0,0,0.05)',
};

const styles = StyleSheet.create({
  backButton: {
    padding: 4,
  },
  card: {
    borderRadius: 12,
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: 100,
  },
  dateButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.sm,
  },
  dateContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
  },
  datePicker: {
    alignSelf: 'flex-start',
  },
  dateWrapper: {
    flex: 1,
  },
  emptyText: {
    fontStyle: 'italic',
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingTop: 50,
  },
  headerPlaceholder: {
    width: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  iconContainer: {
    borderRadius: 8,
    marginRight: 12,
    padding: 8,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  loadingIndicator: {
    marginVertical: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  statsGrid: {
    marginBottom: SPACING.lg,
  },
  statusBar: {
    borderRadius: 4,
    height: '100%',
  },
  statusBarContainer: {
    backgroundColor: ANALYTICS_STYLES.barBackground,
    borderRadius: 4,
    flex: 1,
    height: 8,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  statusCount: {
    fontSize: 14,
    textAlign: 'right',
    width: 30,
  },
  statusLabel: {
    fontSize: 14,
    textTransform: 'capitalize',
  },
  statusLabelContainer: {
    width: 100,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
});

export default AdminAnalyticsScreen;
