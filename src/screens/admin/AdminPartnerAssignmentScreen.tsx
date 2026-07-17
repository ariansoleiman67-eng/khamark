import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING } from '../../constants/theme';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService } from '../../services/tenantAdminService';
import { useTranslation } from 'react-i18next';
import { Product } from '../../types';
import { useRoute, useNavigation } from '@react-navigation/native';

export default function AdminPartnerAssignmentScreen() {
  const { theme, isDark } = useTheme();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { userId, userName, userEmail } = route.params || {};

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [originalSelectedIds, setOriginalSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const loadProducts = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const service = createTenantAdminService(tenantId);
      const productsData = await service.getAllProducts();
      setProducts(productsData as Product[]);

      const initialSelected = new Set<string>();
      productsData.forEach((p: any) => {
        if (Array.isArray(p.coAdminIds) && p.coAdminIds.includes(userId)) {
          initialSelected.add(p.id);
        }
      });
      setSelectedProductIds(initialSelected);
      setOriginalSelectedIds(new Set(initialSelected));
    } catch (error) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.partners.loadProductsFailed', { defaultValue: 'Failed to load products' }));
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId, t]);

  useEffect(() => {
    if (!tenantLoading) {
      loadProducts();
    }
  }, [tenantLoading, loadProducts]);

  const toggleSelection = (productId: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    setSelectedProductIds(next);
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      // Batched: the service diffs against the live catalog and applies only the
      // changed rows in parallel (was N sequential round-trips per save).
      const service = createTenantAdminService(tenantId);
      const updatesCount = await service.setPartnerAssignments(userId, Array.from(selectedProductIds));
      setOriginalSelectedIds(new Set(selectedProductIds));

      Alert.alert(
        t('admin.common.success', { defaultValue: 'Success' }),
        t('admin.partners.assignSaved', { count: updatesCount, defaultValue: `Updated assignments for ${updatesCount} products.` }),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), t('admin.partners.assignFailed', { defaultValue: 'Failed to save assignments' }));
    } finally {
      setSaving(false);
    }
  };

  // Filter by name or part number so the owner can quickly find items to share.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.partNumber || '').toLowerCase().includes(q));
  }, [products, query]);

  const renderProductItem = ({ item }: { item: Product }) => {
    const isSelected = selectedProductIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.productCard, { backgroundColor: theme.colors.surface, borderColor: isSelected ? theme.colors.primary : theme.colors.border }]}
        onPress={() => toggleSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.productInfo}>
          {item.imageUrls && item.imageUrls.length > 0 ? (
            <Image source={{ uri: item.imageUrls[0] }} style={styles.productImage} />
          ) : (
            <View style={[styles.placeholderImage, { backgroundColor: theme.colors.background }]}>
              <Ionicons name="image-outline" size={24} color={theme.colors.textSecondary} />
            </View>
          )}
          <View style={styles.productTextContainer}>
            <Text allowFontScaling={false} style={[styles.productName, { color: theme.colors.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            <Text allowFontScaling={false} style={[styles.productPartNumber, { color: theme.colors.textSecondary }]}>
              {item.partNumber}
            </Text>
            <Text allowFontScaling={false} style={[styles.productPrice, { color: theme.colors.primary }]}>
              ${item.priceUSD}
            </Text>
          </View>
        </View>
        <View style={[styles.checkbox, { borderColor: isSelected ? theme.colors.primary : theme.colors.border, backgroundColor: isSelected ? theme.colors.primary : 'transparent' }]}>
          {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>{t('admin.partners.assignTitle', { defaultValue: 'Assign Products' })}</Text>
          <Text allowFontScaling={false} style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {userName ? `${userName} · ` : ''}{t('admin.partners.selectedCount', { count: selectedProductIds.size, defaultValue: `${selectedProductIds.size} selected` })}
          </Text>
        </View>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text allowFontScaling={false} style={[styles.saveButtonText, { color: theme.colors.primary }]}>{t('admin.partners.save', { defaultValue: 'Save' })}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search products to assign */}
      <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
        <TextInput allowFontScaling={false}
          value={query}
          onChangeText={setQuery}
          placeholder={t('admin.partners.searchProducts', { defaultValue: 'Search by name or part number…' })}
          placeholderTextColor={theme.colors.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.searchInput, { color: theme.colors.text }]}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderProductItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary }}>{query ? t('admin.partners.noSearchResults', { defaultValue: 'No products match your search.' }) : t('admin.partners.noProducts', { defaultValue: 'No products found.' })}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    padding: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 14.5,
    paddingVertical: 0,
    // Android: kill the extra font padding + center vertically so the text doesn't make the
    // field grow/bounce while typing (paired with the fixed 44px searchBar height above).
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.sm,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  productInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: SPACING.md,
  },
  placeholderImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productTextContainer: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  productPartNumber: {
    fontSize: 12,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.md,
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
});
