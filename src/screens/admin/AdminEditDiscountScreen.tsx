import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  I18nManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { DiscountType } from '../../types';
import { TenantAdminService, TenantProduct } from '../../services/tenantAdminService';
import { useTenant } from '../../contexts/TenantContext';

const DISCOUNT_TYPES: { type: DiscountType; label: string; icon: string }[] = [
  { type: 'percentage', label: 'Percentage Off', icon: 'trending-down' },
  { type: 'fixed', label: 'Fixed Amount', icon: 'cash-outline' },
  { type: 'bundle', label: 'Bundle Deal', icon: 'gift-outline' },
];

const AdminEditDiscountScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t, i18n } = useTranslation();
  // Directional icons must follow the reading direction. Global auto-RTL is
  // disabled in App.tsx, so I18nManager.isRTL alone is always false here — the
  // language check is what actually does the work.
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  // Discounts are tenant-scoped: use the resolved tenantId (the store), NOT the
  // logged-in admin's own uid — otherwise discounts save under the wrong tenant
  // and never apply for customers (and co-admins couldn't manage them at all).
  const { tenantId } = useTenant();
  
  const discountId = route.params?.discountId;
  const isEditing = !!discountId;

  // Form state
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameKu, setNameKu] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<DiscountType>('percentage');
  const [value, setValue] = useState('');
  const [bundleQuantity, setBundleQuantity] = useState('');
  const [bundlePrice, setBundlePrice] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  // Product selection
  const [allProducts, setAllProducts] = useState<TenantProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    loadProducts();
    if (isEditing) {
      loadDiscount();
    }
    // tenantId starts null in TenantContext and resolves asynchronously — keep it
    // in the deps so the loaders re-run (and clear their spinners) once it lands.
  }, [discountId, tenantId]);

  const loadProducts = async () => {
    if (!tenantId) {
      setProductsLoading(false);
      return;
    }
    try {
      setProductsLoading(true);
      const tenantService = new TenantAdminService(tenantId);
      const products = await tenantService.getAllProducts();
      setAllProducts(products);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setProductsLoading(false);
    }
  };

  const loadDiscount = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const tenantService = new TenantAdminService(tenantId);
      const discount = await tenantService.getDiscount(discountId);
      if (discount) {
        // discounts row is snake_case (Supabase) — map to form fields.
        setName(discount.name);
        setNameAr(discount.name_ar || '');
        setNameKu(discount.name_ku || '');
        setDescription(discount.description || '');
        setType(discount.type);
        setValue(discount.value?.toString() || '');
        setBundleQuantity(discount.bundle_quantity?.toString() || '');
        setBundlePrice(discount.bundle_price?.toString() || '');
        setMinPurchase(discount.min_purchase?.toString() || '');
        setMinQuantity(discount.min_quantity?.toString() || '');
        setMaxDiscount(discount.max_discount?.toString() || '');
        setUsageLimit(discount.usage_limit?.toString() || '');
        setIsActive(discount.is_active);
        if (discount.start_date) setStartDate(new Date(discount.start_date));
        if (discount.end_date) setEndDate(new Date(discount.end_date));
        setSelectedProductIds(discount.product_ids || []);
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  // Parse a numeric form field. Normalises Arabic-Indic (٠-٩) and Eastern-Arabic
  // (۰-۹) digits and a comma decimal separator to ASCII first, since JS number
  // parsing accepts ASCII only — on an Arabic or Kurdish keyboard the natural input
  // would otherwise silently become NaN. Returns NaN for anything unparseable, so
  // callers must test with a positive-form guard or Number.isFinite.
  const num = (raw: string): number => {
    const ascii = String(raw ?? '')
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/,/g, '.')
      .trim();
    if (!ascii) return NaN;
    return Number(ascii);
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('admin.discounts.nameRequired'));
      return false;
    }

    // Bundle deals don't use the `value` field (they validate quantity/price
    // below); it is forced to 1 on save. Only require `value` for the other types.
    // Positive-form guards throughout. `parseFloat(x) <= 0` lets NaN straight past —
    // NaN fails every comparison — and NaN then reached the insert, where
    // JSON.stringify turns it into null. The result was a discount that reported
    // success, appeared in the list, and applied nothing to any customer, forever,
    // with no error anywhere. `num()` also normalises Arabic-Indic digits, which is
    // not hypothetical in an app shipped to Iraq in Arabic and Kurdish: parseFloat
    // accepts ASCII digits only, so typing ٢٠ on an Arabic keyboard yields NaN.
    if (type !== 'bundle' && !(num(value) > 0)) {
      Alert.alert(t('common.error'), t('admin.discounts.valueRequired'));
      return false;
    }

    if (type === 'percentage' && !(num(value) <= 100)) {
      Alert.alert(t('common.error'), t('admin.discounts.percentageMax'));
      return false;
    }

    if (type === 'bundle') {
      if (!(num(bundleQuantity) > 0)) {
        Alert.alert(t('common.error'), t('admin.discounts.bundleQuantityRequired'));
        return false;
      }
      if (!(num(bundlePrice) > 0)) {
        Alert.alert(t('common.error'), t('admin.discounts.bundlePriceRequired'));
        return false;
      }
    }

    if (startDate >= endDate) {
      Alert.alert(t('common.error'), t('admin.discounts.dateError'));
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      // Build discount data with snake_case keys to match the Supabase discounts table.
      const discountData: Record<string, any> = {
        name: name.trim(),
        type,
        value: type === 'bundle' ? 1 : num(value),
        is_active: isActive,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };

      // Add optional fields only if they have values
      if (nameAr.trim()) discountData.name_ar = nameAr.trim();
      if (nameKu.trim()) discountData.name_ku = nameKu.trim();
      if (description.trim()) discountData.description = description.trim();
      // Only write finite values. Previously each of these parsed straight into the
      // payload with no guard, so any unparseable input became NaN -> null in the row.
      const put = (key: string, raw: string, asInt = false) => {
        const n = num(raw);
        if (Number.isFinite(n)) discountData[key] = asInt ? Math.trunc(n) : n;
      };
      if (type === 'bundle') {
        put('bundle_quantity', bundleQuantity, true);
        put('bundle_price', bundlePrice);
      }
      put('min_purchase', minPurchase);
      put('min_quantity', minQuantity, true);
      put('max_discount', maxDiscount);
      put('usage_limit', usageLimit, true);
      if (selectedProductIds.length > 0) discountData.product_ids = selectedProductIds;

      if (!tenantId) {
        Alert.alert(t('common.error'), 'No business selected');
        return;
      }

      const tenantService = new TenantAdminService(tenantId);

      if (isEditing) {
        await tenantService.updateDiscount(discountId, discountData);
        Alert.alert(t('common.success'), t('admin.discounts.updateSuccess'));
      } else {
        await tenantService.createDiscount(discountData);
        Alert.alert(t('common.success'), t('admin.discounts.createSuccess'));
      }

      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderTypeSelector = () => (
    <View style={styles.typeContainer}>
      {DISCOUNT_TYPES.map((dt) => (
        <TouchableOpacity
          key={dt.type}
          style={[
            styles.typeOption,
            { 
              backgroundColor: type === dt.type ? theme.colors.primary : theme.colors.surface,
              borderColor: type === dt.type ? theme.colors.primary : theme.colors.border,
            },
          ]}
          onPress={() => setType(dt.type)}
        >
          <Ionicons 
            name={dt.icon as any} 
            size={24} 
            color={type === dt.type ? '#fff' : theme.colors.textSecondary} 
          />
          <Text allowFontScaling={false} style={[
            styles.typeLabel,
            { color: type === dt.type ? '#fff' : theme.colors.text }
          ]}>
            {dt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.headerContainer}>
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.primaryVariant || theme.colors.primary]}
          style={styles.headerGradient}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#fff" />
          </TouchableOpacity>
          
          <Text allowFontScaling={false} style={styles.headerTitle}>
            {isEditing ? t('admin.discounts.editDiscount') : t('admin.discounts.createDiscount')}
          </Text>
        </LinearGradient>
      </Animated.View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Discount Type */}
        <Animated.View entering={FadeInUp.delay(100)} style={styles.section}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.discounts.discountType')}
          </Text>
          {renderTypeSelector()}
        </Animated.View>

        {/* Basic Info */}
        <Animated.View entering={FadeInUp.delay(200)} style={[styles.section, styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.discounts.basicInfo')}
          </Text>
          
          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
            {t('admin.discounts.discountName')} *
          </Text>
          <TextInput allowFontScaling={false}
            style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder={t('admin.discounts.namePlaceholder')}
            placeholderTextColor={theme.colors.placeholder}
            value={name}
            onChangeText={setName}
          />

          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
            {t('admin.discounts.nameArabic')}
          </Text>
          <TextInput allowFontScaling={false}
            style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border, textAlign: 'right' }]}
            placeholder="الاسم بالعربية"
            placeholderTextColor={theme.colors.placeholder}
            value={nameAr}
            onChangeText={setNameAr}
          />

          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
            {t('admin.discounts.nameKurdish')}
          </Text>
          <TextInput allowFontScaling={false}
            style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border, textAlign: 'right' }]}
            placeholder="ناوی داشکاندن"
            placeholderTextColor={theme.colors.placeholder}
            value={nameKu}
            onChangeText={setNameKu}
          />

          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
            {t('admin.discounts.description')}
          </Text>
          <TextInput allowFontScaling={false}
            style={[styles.input, styles.textArea, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder={t('admin.discounts.descriptionPlaceholder')}
            placeholderTextColor={theme.colors.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </Animated.View>

        {/* Value Configuration */}
        <Animated.View entering={FadeInUp.delay(300)} style={[styles.section, styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.discounts.valueConfig')}
          </Text>
          
          {type === 'percentage' && (
            <>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.percentageValue')} *
              </Text>
              <View style={styles.inputWithSuffix}>
                <TextInput allowFontScaling={false}
                  style={[styles.input, styles.inputFlex, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="20"
                  placeholderTextColor={theme.colors.placeholder}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                />
                <Text allowFontScaling={false} style={[styles.suffix, { color: theme.colors.text }]}>%</Text>
              </View>
            </>
          )}

          {type === 'fixed' && (
            <>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.fixedValue')} *
              </Text>
              <View style={styles.inputWithSuffix}>
                <Text allowFontScaling={false} style={[styles.prefix, { color: theme.colors.text }]}>$</Text>
                <TextInput allowFontScaling={false}
                  style={[styles.input, styles.inputFlex, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="10"
                  placeholderTextColor={theme.colors.placeholder}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          {type === 'bundle' && (
            <>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.bundleConfig')}
              </Text>
              <View style={styles.bundleRow}>
                <View style={styles.bundleField}>
                  <Text allowFontScaling={false} style={[styles.bundleLabel, { color: theme.colors.textSecondary }]}>
                    {t('admin.discounts.buyQuantity')}
                  </Text>
                  <TextInput allowFontScaling={false}
                    style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                    placeholder="10"
                    placeholderTextColor={theme.colors.placeholder}
                    value={bundleQuantity}
                    onChangeText={setBundleQuantity}
                    keyboardType="numeric"
                  />
                </View>
                <Text allowFontScaling={false} style={[styles.bundleFor, { color: theme.colors.text }]}>for</Text>
                <View style={styles.bundleField}>
                  <Text allowFontScaling={false} style={[styles.bundleLabel, { color: theme.colors.textSecondary }]}>
                    {t('admin.discounts.bundlePrice')}
                  </Text>
                  <View style={styles.inputWithSuffix}>
                    <Text allowFontScaling={false} style={[styles.prefix, { color: theme.colors.text }]}>$</Text>
                    <TextInput allowFontScaling={false}
                      style={[styles.input, styles.inputFlex, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                      placeholder="10"
                      placeholderTextColor={theme.colors.placeholder}
                      value={bundlePrice}
                      onChangeText={setBundlePrice}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            </>
          )}

          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: SPACING.md }]}>
            {t('admin.discounts.minPurchaseOptional')}
          </Text>
          <View style={styles.inputWithSuffix}>
            <Text allowFontScaling={false} style={[styles.prefix, { color: theme.colors.text }]}>$</Text>
            <TextInput allowFontScaling={false}
              style={[styles.input, styles.inputFlex, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="0"
              placeholderTextColor={theme.colors.placeholder}
              value={minPurchase}
              onChangeText={setMinPurchase}
              keyboardType="numeric"
            />
          </View>

          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
            Min Items Required (Optional)
          </Text>
          <Text allowFontScaling={false} style={[styles.helperText, { color: theme.colors.textSecondary }]}>
            E.g. Buy 2+ items get $10 off, Buy 30+ items get $30 off
          </Text>
          <View style={styles.inputWithSuffix}>
            <TextInput allowFontScaling={false}
              style={[styles.input, styles.inputFlex, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="2"
              placeholderTextColor={theme.colors.placeholder}
              value={minQuantity}
              onChangeText={setMinQuantity}
              keyboardType="numeric"
            />
            <Text allowFontScaling={false} style={[styles.suffix, { color: theme.colors.text }]}>items</Text>
          </View>

          {type !== 'bundle' && (
            <>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.maxDiscountOptional')}
              </Text>
              <View style={styles.inputWithSuffix}>
                <Text allowFontScaling={false} style={[styles.prefix, { color: theme.colors.text }]}>$</Text>
                <TextInput allowFontScaling={false}
                  style={[styles.input, styles.inputFlex, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="50"
                  placeholderTextColor={theme.colors.placeholder}
                  value={maxDiscount}
                  onChangeText={setMaxDiscount}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}
        </Animated.View>

        {/* Date Range */}
        <Animated.View entering={FadeInUp.delay(400)} style={[styles.section, styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.discounts.dateRange')}
          </Text>
          
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.startDate')}
              </Text>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                onPress={() => setShowStartPicker(true)}
              >
                <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                <Text allowFontScaling={false} style={[styles.dateText, { color: theme.colors.text }]}>
                  {startDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.dateField}>
              <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.endDate')}
              </Text>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                onPress={() => setShowEndPicker(true)}
              >
                <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                <Text allowFontScaling={false} style={[styles.dateText, { color: theme.colors.text }]}>
                  {endDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Product Selection */}
        <Animated.View entering={FadeInUp.delay(450)} style={[styles.section, styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.discounts.selectProducts')}
          </Text>
          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}>
            {t('admin.discounts.selectProductsHint')}
          </Text>

          {/* Search Input */}
          <View style={[styles.searchContainer, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
            <TextInput allowFontScaling={false}
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder={t('admin.discounts.searchProducts')}
              placeholderTextColor={theme.colors.placeholder}
              value={productSearchQuery}
              onChangeText={setProductSearchQuery}
            />
            {productSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setProductSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Selected Count */}
          <View style={styles.selectedCountRow}>
            <Text allowFontScaling={false} style={[styles.selectedCount, { color: theme.colors.primary }]}>
              {selectedProductIds.length} {t('admin.discounts.productsSelected')}
            </Text>
            {selectedProductIds.length > 0 && (
              <TouchableOpacity onPress={() => setSelectedProductIds([])}>
                <Text allowFontScaling={false} style={[styles.clearAll, { color: theme.colors.error }]}>
                  {t('admin.discounts.clearAll')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Product List */}
          <View style={styles.productList}>
            {productsLoading ? (
              <View style={styles.productsLoadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text allowFontScaling={false} style={[styles.productsLoadingText, { color: theme.colors.textSecondary }]}>
                  {t('common.loading')}
                </Text>
              </View>
            ) : allProducts.length === 0 ? (
              <View style={styles.noProductsContainer}>
                <Ionicons name="cube-outline" size={32} color={theme.colors.textSecondary} />
                <Text allowFontScaling={false} style={[styles.noProductsText, { color: theme.colors.textSecondary }]}>
                  {t('admin.discounts.noProductsFound')}
                </Text>
              </View>
            ) : (
              allProducts
                .filter(p =>
                  productSearchQuery.length === 0 ||
                  (p.name || '').toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                  (p.partNumber || '').toLowerCase().includes(productSearchQuery.toLowerCase())
                )
                .filter(p => p.id) // Filter out products without id
                .slice(0, showProductPicker ? 100 : 5)
                .map(product => {
                  const productId = product.id!;
                  const isSelected = selectedProductIds.includes(productId);
                  return (
                    <TouchableOpacity
                      key={productId}
                      style={[
                        styles.productItem,
                        { 
                          backgroundColor: isSelected ? theme.colors.primary + '15' : theme.colors.background,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        }
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedProductIds(prev => prev.filter(id => id !== productId));
                        } else {
                          setSelectedProductIds(prev => [...prev, productId]);
                        }
                      }}
                    >
                      <View style={[
                        styles.checkbox,
                        { 
                          backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        }
                      ]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <View style={styles.productItemInfo}>
                        <Text allowFontScaling={false} style={[styles.productItemName, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {product.name}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.productItemMeta, { color: theme.colors.textSecondary }]}>
                          {product.partNumber || '—'} • ${product.priceUSD ?? 0}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
            )}
          </View>

          {/* Show More Button */}
          {allProducts.length > 5 && (
            <TouchableOpacity
              style={[styles.showMoreButton, { borderColor: theme.colors.primary }]}
              onPress={() => setShowProductPicker(!showProductPicker)}
            >
              <Text allowFontScaling={false} style={[styles.showMoreText, { color: theme.colors.primary }]}>
                {showProductPicker ? t('admin.discounts.showLess') : t('admin.discounts.showMore', { count: allProducts.length - 5 })}
              </Text>
              <Ionicons 
                name={showProductPicker ? 'chevron-up' : 'chevron-down'} 
                size={16} 
                color={theme.colors.primary} 
              />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Limits & Status */}
        <Animated.View entering={FadeInUp.delay(500)} style={[styles.section, styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.discounts.limitsStatus')}
          </Text>
          
          <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
            {t('admin.discounts.usageLimitOptional')}
          </Text>
          <TextInput allowFontScaling={false}
            style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder={t('admin.discounts.unlimited')}
            placeholderTextColor={theme.colors.placeholder}
            value={usageLimit}
            onChangeText={setUsageLimit}
            keyboardType="numeric"
          />

          <View style={styles.switchRow}>
            <View>
              <Text allowFontScaling={false} style={[styles.switchLabel, { color: theme.colors.text }]}>
                {t('admin.discounts.activeStatus')}
              </Text>
              <Text allowFontScaling={false} style={[styles.switchHint, { color: theme.colors.textSecondary }]}>
                {t('admin.discounts.activeHint')}
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
              thumbColor={isActive ? theme.colors.primary : '#f4f3f4'}
            />
          </View>
        </Animated.View>

        {/* Save Button */}
        <Animated.View entering={FadeInUp.delay(600)} style={styles.saveContainer}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text allowFontScaling={false} style={styles.saveButtonText}>
                  {isEditing ? t('admin.discounts.updateDiscount') : t('admin.discounts.createDiscount')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Date Pickers */}
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selectedDate) => {
            setShowStartPicker(false);
            if (selectedDate) setStartDate(selectedDate);
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={startDate}
          onChange={(_, selectedDate) => {
            setShowEndPicker(false);
            if (selectedDate) setEndDate(selectedDate);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    left: SPACING.md,
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -12 }],
    zIndex: 1,
  },
  bottomSpacing: {
    height: 40,
  },
  bundleField: {
    flex: 1,
  },
  bundleFor: {
    fontSize: 16,
    fontWeight: '500',
    marginHorizontal: SPACING.sm,
    marginTop: 24,
  },
  bundleLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  bundleRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
  },
  card: {
    borderRadius: 12,
    padding: SPACING.md,
    ...SHADOW_STYLES.small,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  dateButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: SPACING.md,
  },
  dateField: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  dateRow: {
    flexDirection: 'row',
  },
  dateText: {
    fontSize: 14,
    marginLeft: 8,
  },
  headerContainer: {
    margin: SPACING.md,
  },
  headerGradient: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    padding: SPACING.md,
  },
  inputFlex: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  inputWithSuffix: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  prefix: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  saveContainer: {
    marginTop: SPACING.lg,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  helperText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: SPACING.xs,
  },
  suffix: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  switchHint: {
    fontSize: 12,
    marginTop: 2,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  typeOption: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: SPACING.md,
  },
  // Product Selection Styles
  searchContainer: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    marginLeft: SPACING.xs,
    paddingVertical: 4,
  },
  selectedCountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  selectedCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  clearAll: {
    fontSize: 13,
    fontWeight: '500',
  },
  productList: {
    marginTop: SPACING.sm,
  },
  productItem: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.xs,
    padding: SPACING.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    marginRight: SPACING.sm,
    width: 22,
  },
  productItemInfo: {
    flex: 1,
  },
  productItemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  productItemMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  showMoreButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '500',
    marginRight: 4,
  },
  productsLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  productsLoadingText: {
    fontSize: 13,
    marginTop: SPACING.xs,
  },
  noProductsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  noProductsText: {
    fontSize: 13,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});

export default AdminEditDiscountScreen;
