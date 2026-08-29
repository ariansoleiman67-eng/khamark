import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';

// LayoutAnimation is enabled by default on the New Architecture — no setup needed.
import { ScrollView } from 'react-native-gesture-handler';
const GHScrollView = ScrollView;
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING } from '../../constants/theme';
import PriceField from '../../components/admin/PriceField';
import VariantPriceBlock from '../../components/admin/VariantPriceBlock';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { Image as ExpoImage } from 'expo-image';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { convertIQDToUSD, costUSD, formatCurrencyIQD, formatCurrencyUSD } from '../../utils/currency';
import { createTenantAdminService, TenantCategory } from '../../services/tenantAdminService';
import { categoryStore } from '../../services/categoryStore';
import { ImageService } from '../../services/imageService';
import { Brand, brandService } from '../../services/brandService';
import { AiProductDraft, fetchProductDraft, mergeDraft } from '../../services/aiProductFill';
import { VideoService, VIDEO_CONFIG, VideoPickResult } from '../../services/videoService';
import { useTranslation } from 'react-i18next';
import { Product, PriceTier, ProductStatus, ProductVariation, ColorVariation } from '../../types';

const ADMIN_TAB_HEIGHT = 120;

import { PasswordPromptModal } from '../../components/PasswordPromptModal';

// Maps English category names to i18n translation keys
const CATEGORY_TRANSLATION_KEYS: Record<string, string> = {
  'Engine Parts': 'categories.engineParts',
  'Brake System': 'categories.brakeSystem',
  'Suspension': 'categories.suspension',
  'Steering': 'categories.steering',
  'Transmission': 'categories.transmission',
  'Electrical': 'categories.electrical',
  'Cooling System': 'categories.cooling',
  'Exhaust System': 'categories.exhaust',
  'Fuel System': 'categories.fuelsystem',
  'Air Conditioning': 'categories.airConditioning',
  'Body Parts': 'categories.bodyParts',
  'Interior': 'categories.interior',
  'Exterior': 'categories.exterior',
  'Lighting': 'categories.lighting',
  'Wipers & Washers': 'categories.wipers&washers',
  'Filters': 'categories.filters',
  'Belts & Hoses': 'categories.belts',
  'Ignition': 'categories.ignition',
  'Sensors': 'categories.sensors',
  'Turbo & Supercharger': 'categories.turboSupercharger',
  'Wheels & Tires': 'categories.wheels&tires',
  'Oil & Fluids': 'categories.oilAndFluids',
  'Accessories': 'categories.accessories',
  'Other': 'categories.other',
};

const PRODUCT_COLOR_OPTIONS = [
  { key: 'Black', hex: '#000000' },
  { key: 'White', hex: '#FFFFFF' },
  { key: 'Red', hex: '#F44336' },
  { key: 'Blue', hex: '#2196F3' },
  { key: 'Green', hex: '#4CAF50' },
  { key: 'Yellow', hex: '#FFEB3B' },
  { key: 'Orange', hex: '#FF9800' },
  { key: 'Purple', hex: '#9C27B0' },
  { key: 'Brown', hex: '#795548' },
  { key: 'Gray', hex: '#9E9E9E' },
] as const;

type ProductColor = typeof PRODUCT_COLOR_OPTIONS[number]['key'];

// Calculate effective stock for stats (Main + Size + Color)
// Number()-coerce every term: variations/colorVariations are JSONB, so a row written
// by the website can carry stockQuantity as a string. Without coercion `sum + "5"`
// concatenates — one such variation turns the total into "050", which makes the
// low-stock test ("050" <= 5) never fire, inflates the inventory valuations tenfold,
// and worst, feeds the historical-stock auto-calc that PERSISTS the bad value back.
// tenantAdminService already coerces for exactly this reason.
const getEffectiveStock = (p: Product) => {
  const mainStock = Number(p.stockQty) || 0;
  const sizeStock = p.variations?.reduce((sum, v) => sum + (Number(v?.stockQuantity) || 0), 0) || 0;
  const colorStock = p.colorVariations?.reduce((sum, v) => sum + (Number(v?.stockQuantity) || 0), 0) || 0;
  return mainStock + sizeStock + colorStock;
};

// Editable wholesale tier: a PriceTier plus a stable client-side key so the tier rows
// (whose price input is uncontrolled) keep their identity when a tier above them is
// removed. The `_key` is stripped when tiers are mapped into the saved product payload.
type EditablePriceTier = PriceTier & { _key?: string };

const newTierKey = () => `tier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const AdminProductsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  // Only used to show the admin what their dinar price works out to in dollars,
  // and to derive the price_usd column that the USD-only cart/report maths reads.
  const { exchangeRateIQD } = useCurrency();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Product>>(null);
  // Task 9 trade-in hand-off: AdminTradeInDetailScreen navigates here with a
  // `prefill` param. Neither hook was used in this file before — AdminProducts is
  // rendered as a tab (AdminTabNavigator's WrappedProductsScreen renders
  // <AdminProductsScreen /> with no props), so route/navigation must come from
  // these hooks, not from component props.
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Always-current tenant id, so an in-flight loadProducts() can detect a tenant switch
  // that happened while it was awaiting and drop its now-stale result.
  const tenantIdRef = useRef(tenantId);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState(''); // filtering runs on this (debounced) to keep typing smooth
  const [modalVisible, setModalVisible] = useState(false);
  const [modalReady, setModalReady] = useState(false); // Workaround for RN 0.81.x old-arch Modal ScrollView regression
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [reorderingIndex, setReorderingIndex] = useState<number | null>(null);
  const [priceTiers, setPriceTiers] = useState<EditablePriceTier[]>([]);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // ===== REORDER MODE =====
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderedProducts, setReorderedProducts] = useState<Product[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const [colorOptions, setColorOptions] = useState<string[]>([]);
  const MAX_OPTIONS = 10;

  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [newSizeValue, setNewSizeValue] = useState('');
  const [newSizeStock, setNewSizeStock] = useState('');
  const [newSizePrice, setNewSizePrice] = useState(''); // optional per-tier price (e.g. 256GB costs more)
  // Common phone storage tiers for quick-add (tap to fill the value field).
  const STORAGE_PRESETS = ['64GB', '128GB', '256GB', '512GB', '1TB'];

  // ALIBABA VARIATION: Color variations with stock
  const [colorVariations, setColorVariations] = useState<ColorVariation[]>([]);
  const [colorImgUploadingId, setColorImgUploadingId] = useState<string | null>(null);
  const [newColorStock, setNewColorStock] = useState('');

  // Calculate total stocks for variations
  const totalSizeStock = variations.reduce((sum, v) => sum + (v.stockQuantity || 0), 0);
  const totalColorStock = colorVariations.reduce((sum, v) => sum + (v.stockQuantity || 0), 0);
  const [newColorKey, setNewColorKey] = useState<ProductColor | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [managedCategories, setManagedCategories] = useState<TenantCategory[]>([]);
  // Load the shop's managed categories each time the picker opens (fresh if the
  // admin just added some in Settings → Categories). Read from categoryStore —
  // the SAME source the Category Manager writes to — so newly-added categories
  // actually appear here (the old tenant-scoped read returned "No categories").
  // Also loaded on modal open, because the category field needs the list to tell a
  // managed category (shown translated, read-only) from a free-typed custom one.
  useEffect(() => {
    if (categoryPickerVisible || modalVisible) {
      categoryStore.getActiveTenantCategories(tenantId || undefined).then(setManagedCategories).catch(() => {});
    }
  }, [categoryPickerVisible, modalVisible, tenantId]);
  const [applyShippingToAll, setApplyShippingToAll] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false); // pin product to the featured row
  const [isActive, setIsActive] = useState(true); // false = hide from the storefront without deleting
  // The shop's managed brands. Held as whole Brand objects, not names, so the
  // picker can show each logo — a shop recognises its brands by the mark far
  // faster than by reading a row of near-identical words.
  const [brandOptions, setBrandOptions] = useState<Brand[]>([]);
  const [brandPickerVisible, setBrandPickerVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  useEffect(() => {
    brandService.getActiveBrands(tenantId || undefined)
      .then(setBrandOptions)
      .catch(() => {});
  }, [tenantId]);

  const filteredBrands = useMemo<Brand[]>(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brandOptions;
    return brandOptions.filter((b: Brand) => b.name.toLowerCase().includes(q));
  }, [brandOptions, brandSearch]);
  
  // City-based shipping rates
  const [shippingRates, setShippingRates] = useState<Array<{ city: string; price: number }>>([]);
  const [newCityName, setNewCityName] = useState('');
  const [newCityPrice, setNewCityPrice] = useState('');
  const [applyCityRatesToAll, setApplyCityRatesToAll] = useState(false);



  const [formData, setFormData] = useState({
    name: '',
    nameAr: '',
    nameKu: '',
    partNumber: '',
    category: '',
    categoryAr: '',
    categoryKu: '',
    priceUSD: '',
    priceIQD: '',
    compareAtPriceUSD: '',
    compareAtPriceIQD: '',
    vipPriceUSD: '',
    vipPriceIQD: '',
    purchasePrice: '',
    purchasePriceIQD: '',
    stockQty: '',
    // BOTH OF THESE WERE WRITTEN BY THE FORM AND MISSING FROM ITS INITIAL SHAPE.
    // `historicalStockQty` is set by the two reset literals and read at :798;
    // `condition` is set by the trade-in prefill (:437) and by openEditModal
    // (:656) and read at :861. Neither existed here, so the state's inferred type
    // did not contain them and `formData.condition` was a type error TypeScript
    // was told not to look at. This is the same shape as the crash the shop hit
    // when `priceIQD` was absent from a reset literal: a field the form writes
    // but the initial object does not declare is undefined on first mount.
    historicalStockQty: '',
    condition: '',
    shippingCost: '',
    description: '',
    descriptionAr: '',
    descriptionKu: '',
    brand: '',
    initialStock: '',
    status: 'available' as ProductStatus,
    warranty: '',
    sku: '',
    barcode: '',
    weight: '',
    dimLength: '',
    dimWidth: '',
    dimHeight: '',
  });

  // Structured specifications (RAM / screen / battery ...) as an ordered key/value list.
  const [specEntries, setSpecEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  // 'Cable' earns its place next to RAM: it is the question a phone shop is asked
  // most and the one a listing almost never answers — which lead the handset takes.
  const SPEC_PRESETS = ['RAM', 'Storage', 'Screen', 'Battery', 'Chipset', 'Camera', 'OS', 'Cable'];

  // Tapping a preset fills the KEY; for the ones with a small fixed answer set,
  // offer the values too rather than making the shop type 'USB-C' forty times.
  const SPEC_VALUE_SUGGESTIONS: Record<string, string[]> = {
    cable: ['USB-C', 'Lightning', 'Micro-USB', 'USB-C to USB-C', 'USB-C to Lightning'],
    os: ['Android', 'iOS', 'HarmonyOS'],
  };

  useEffect(() => {
    // Keep the ref in lockstep with the active tenant so an in-flight loadProducts()
    // can tell whether the tenant changed under it before applying its result.
    tenantIdRef.current = tenantId;
    setProducts([]);
    setSearchQuery('');
    setEditingProduct(null);
    setModalVisible(false);
    setImageUrls([]);
    setPriceTiers([]);
    setColorOptions([]);
    setVariations([]);
    setNewSizeValue('');
    setNewSizeStock('');
    setNewSizePrice('');
    setSpecEntries([]);
    setNewSpecKey('');
    setNewSpecValue('');
    setColorVariations([]);
    setNewColorStock('');
    setNewColorKey(null);
    setIsFeatured(false);
    setIsActive(true);
    setFormData({
      name: '', nameAr: '', nameKu: '', partNumber: '', category: '', categoryAr: '', categoryKu: '',
      priceUSD: '', priceIQD: '', compareAtPriceUSD: '', compareAtPriceIQD: '', vipPriceUSD: '', vipPriceIQD: '', purchasePrice: '', purchasePriceIQD: '', stockQty: '', historicalStockQty: '', condition: '', initialStock: '', shippingCost: '', description: '', descriptionAr: '', descriptionKu: '', brand: '', status: 'available',
      warranty: '', sku: '', barcode: '', weight: '', dimLength: '', dimWidth: '', dimHeight: '',
    });
    // Also reset view state so a tenant switch doesn't carry over filters/reorder mode.
    setFilterStatus('all');
    setReorderMode(false);
    // Clear the rest of the tenant-scoped view state (selection, sort, categories) so
    // nothing from the previous tenant bleeds into the new one (CLAUDE.md tenant rule).
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSortMode('default');
    setManagedCategories([]);
    setLoading(true);
  }, [tenantId]);

  // Workaround for RN 0.81.x + old-arch Modal ScrollView regression
  // Delays scroll content mount until Modal is visible to avoid broken first-mount state
  useEffect(() => {
    if (modalVisible) {
      setModalReady(false);
      const id = setTimeout(() => setModalReady(true), 200);
      return () => clearTimeout(id);
    } else {
      setModalReady(false);
    }
  }, [modalVisible]);

  // Set once the admin types into the Total Historical Stock field. Without it the
  // auto-calc below overwrites their manual override the moment Stock Qty changes,
  // and the save then persists the recalculated number instead of what they entered.
  const historicalTouchedRef = useRef(false);

  // Auto-calculate historical stock when stock fields change
  useEffect(() => {
    if (!modalVisible) return;
    if (historicalTouchedRef.current) return;

    const newStockQty = parseInt(formData.stockQty) || 0;
    const newVariationStock = variations.reduce((s, v) => s + (v.stockQuantity || 0), 0);
    const newColorStock = colorVariations.reduce((s, v) => s + (v.stockQuantity || 0), 0);
    const newEffectiveStock = newStockQty + newVariationStock + newColorStock;

    let calculatedHistorical = newEffectiveStock;

    if (editingProduct) {
      const oldEffectiveStock = getEffectiveStock(editingProduct);
      const oldHistorical = editingProduct.historicalStockQty || oldEffectiveStock;
      
      const stockDelta = newEffectiveStock - oldEffectiveStock;
      calculatedHistorical = Math.max(0, oldHistorical + stockDelta);
    }

    setFormData(prev => {
      if (prev.historicalStockQty === calculatedHistorical.toString()) {
        return prev;
      }
      return {
        ...prev,
        historicalStockQty: calculatedHistorical.toString()
      };
    });
  }, [formData.stockQty, variations, colorVariations, editingProduct, modalVisible]);

  const loadProducts = useCallback(async () => {
    if (!tenantId) {
      if (!tenantLoading) setLoading(false);
      return;
    }
    const reqTenant = tenantId;
    try {
      const service = createTenantAdminService(tenantId);
      const productsData = await service.getAllProducts();
      // Drop the result if the tenant changed while this request was in flight —
      // otherwise a slow tenant-A response could overwrite tenant-B's list.
      if (tenantIdRef.current !== reqTenant) return;
      setProducts(productsData as any as Product[]);
    } catch (error) {
      if (tenantIdRef.current !== reqTenant) return;
      Alert.alert(t('admin.common.error'), t('admin.products.failedToLoad'));
    } finally {
      if (tenantIdRef.current === reqTenant) setLoading(false);
    }
  }, [tenantId, tenantLoading, t]);

  useFocusEffect(
    useCallback(() => {
      if (!tenantLoading && tenantId) {
        loadProducts();
      }
    }, [tenantId, tenantLoading, loadProducts])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  // Identifies the edit session a given async continuation was started in. Media
  // uploads and the bulk save take many seconds, the modal's close button is not
  // disabled while they run, and resetForm/openEditModal do not clear the uploading
  // flags — so without this token an upload started on product X resolves after the
  // admin has opened product Y and commits X's image or video into Y's form, which
  // the next Save then persists onto Y.
  const editSessionRef = useRef(0);
  const isSameEditSession = (session: number) => editSessionRef.current === session;

  const resetForm = () => {
    editSessionRef.current++;
    historicalTouchedRef.current = false;
    setUploadingImage(false);
    setUploadingVideo(false);
    setIsFeatured(false);
    setIsActive(true);
    setFormData({
      name: '', nameAr: '', nameKu: '', partNumber: '', category: '', categoryAr: '', categoryKu: '',
      priceUSD: '', priceIQD: '', compareAtPriceUSD: '', compareAtPriceIQD: '', vipPriceUSD: '', vipPriceIQD: '', purchasePrice: '', purchasePriceIQD: '', stockQty: '', historicalStockQty: '', condition: '', initialStock: '', shippingCost: '', description: '', descriptionAr: '', descriptionKu: '', brand: '', status: 'available',
      warranty: '', sku: '', barcode: '', weight: '', dimLength: '', dimWidth: '', dimHeight: '',
    });
    setApplyShippingToAll(false);
    setShippingRates([]);
    setNewCityName('');
    setNewCityPrice('');
    setApplyCityRatesToAll(false);
    setEditingProduct(null);
    setImageUrls([]);
    setPriceTiers([]);
    setColorOptions([]);
    setVariations([]);
    setNewSizeValue('');
    setNewSizeStock('');
    setNewSizePrice('');
    setSpecEntries([]);
    setNewSpecKey('');
    setNewSpecValue('');
    setColorVariations([]);
    setNewColorStock('');
    setNewColorKey(null);
    // Video reset
    setVideoUri(null);
    setVideoUrl(null);
    setVideoUploadProgress(0);
  };

  // Trade-in hand-off (Task 9): AdminTradeInDetailScreen navigates here with
  // { prefill } — a draft built by buildListingDraft() (src/utils/tradeIn.ts) once
  // an accepted trade-in is turned into a listing. Opens the Add Product modal
  // pre-filled with what the trade-in already captured, via the SAME resetForm()
  // a manual "Add Product" tap runs first, so nothing left over from an unrelated
  // in-progress form leaks into this one.
  //
  // The param is cleared with setParams right after being applied. AdminProducts
  // is a persistent tab (not popped on navigation away), so without this, simply
  // refocusing the tab later — e.g. the admin taps away and back — would re-run
  // this effect and silently overwrite whatever they had since typed.
  useEffect(() => {
    const prefill = route.params?.prefill;
    if (!prefill) return;
    resetForm();
    setFormData(prev => ({
      ...prev,
      name: prefill.name || '',
      brand: prefill.brand || '',
      stockQty: prefill.stockQty != null ? String(prefill.stockQty) : prev.stockQty,
      // 'used' by construction (buildListingDraft), but read defensively rather
      // than hard-coded in case that default ever changes.
      condition: prefill.condition || 'used',
    }));
    setImageUrls(Array.isArray(prefill.imageUrls) ? prefill.imageUrls : []);
    // No dedicated "storage" field on the product form — carried instead as a
    // structured spec entry, the same mechanism STORAGE_PRESETS/SPEC_PRESETS
    // already use for this exact value, so it stays visible and editable rather
    // than silently dropped.
    if (prefill.storage) {
      setSpecEntries([{ key: 'Storage', value: prefill.storage }]);
    }
    setModalVisible(true);
    navigation.setParams({ prefill: undefined });
    // Intentionally keyed only on the prefill param itself — resetForm/navigation
    // are stable enough for this purpose and including them would re-run this on
    // every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.prefill]);

  const addColor = (colorKey: ProductColor) => {
    if (!colorOptions.includes(colorKey) && colorOptions.length < MAX_OPTIONS) {
      setColorOptions([...colorOptions, colorKey]);
    }
  };

  const removeColor = (color: string) => {
    setColorOptions(colorOptions.filter(c => c !== color));
  };

  const addVariation = () => {
    const sizeText = newSizeValue.trim();
    const stockNum = parseInt(newSizeStock, 10) || 0;

    if (!sizeText) {
      Alert.alert(t('admin.common.error'), t('admin.products.invalidSizeValue', { defaultValue: 'Please enter a size' }));
      return;
    }
    if (variations.some(v => v.sizeValue === sizeText)) {
      Alert.alert(t('admin.common.error'), t('admin.products.duplicateSizeValue', { defaultValue: 'This size already exists' }));
      return;
    }
    if (stockNum < 0) {
      Alert.alert(t('admin.common.error'), t('admin.products.negativeStock', { defaultValue: 'Stock cannot be negative' }));
      return;
    }

    const priceNum = parseFloat(newSizePrice);
    const newVariation: ProductVariation = {
      variationId: `var_${Date.now()}_${sizeText}`,
      sizeValue: sizeText,
      sizeUnit: '',
      stockQuantity: stockNum,
      ...(newSizePrice.trim() !== '' && !isNaN(priceNum) && priceNum > 0 ? { priceUSD: priceNum } : {}),
    };

    setVariations([...variations, newVariation]);
    setNewSizeValue('');
    setNewSizeStock('');
    setNewSizePrice('');
  };





  /**
   * Set or CLEAR any of a variation's six price fields.
   *
   * Clearing means deleting the key, not writing 0 or null: these objects are
   * stored as opaque JSONB and every reader tests "is this field present", so a
   * leftover 0 would read as a real price of zero. The four price pairs behave
   * exactly like the product's — the dinar side wins — so switching a variant
   * price back to dollars has to remove the dinar key, which is why PriceField
   * always reports BOTH sides of a pair on every change.
   */
  type VariantPriceKey =
    | 'priceUSD' | 'priceIQD'
    | 'vipPriceUSD' | 'vipPriceIQD'
    | 'compareAtPriceUSD' | 'compareAtPriceIQD'
    | 'purchasePrice' | 'purchasePriceIQD';

  const applyVariantPrices = <T extends ProductVariation | ColorVariation>(
    variant: T,
    patch: Partial<Record<VariantPriceKey, number | undefined>>,
  ): T => {
    const next: any = { ...variant };
    (Object.keys(patch) as VariantPriceKey[]).forEach((key) => {
      const value = patch[key];
      if (value == null || !Number.isFinite(value) || value <= 0) delete next[key];
      else next[key] = value;
    });
    return next as T;
  };

  const patchVariationPrices = (
    variationId: string,
    patch: Partial<Record<VariantPriceKey, number | undefined>>,
  ) => {
    setVariations(prev => prev.map(v => (v.variationId === variationId ? applyVariantPrices(v, patch) : v)));
  };

  const patchColorVariationPrices = (
    variationId: string,
    patch: Partial<Record<VariantPriceKey, number | undefined>>,
  ) => {
    setColorVariations(prev => prev.map(v => (v.variationId === variationId ? applyVariantPrices(v, patch) : v)));
  };

  // ---- AI fill -------------------------------------------------------------
  // Type the product name, tap once, and the model drafts the Arabic and Kurdish
  // names, three descriptions, the brand, the category and the specifications.
  //
  // It fills a DRAFT and never saves. Fields the admin already typed are left
  // alone unless they say otherwise — and they are told exactly how many would be
  // replaced before they decide.
  // The Save button greys itself out and says nothing. On a ten-section form the
  // missing field is usually off screen, so the admin is left tapping a dead
  // button with no idea which one it wants. Name them, and let each one be
  // tapped to jump to the section it lives in.
  const missingRequired = useMemo(() => {
    const missing: Array<{ label: string; section: string }> = [];
    if (!formData.name.trim()) {
      missing.push({ label: t('admin.products.form.name'), section: 'basic' });
    }
    if (!formData.partNumber.trim()) {
      missing.push({ label: t('admin.products.form.partNumber'), section: 'basic' });
    }
    // Price is required only for an `available` product — a "Coming soon" listing
    // saves without one, and demanding it was a bug this form already had once.
    if (formData.status === 'available' && !formData.priceUSD.trim() && !(formData.priceIQD || '').trim()) {
      missing.push({ label: t('admin.products.form.price'), section: 'pricing' });
    }
    return missing;
  }, [formData.name, formData.partNumber, formData.status, formData.priceUSD, formData.priceIQD, t]);

  // ---- Section jump bar -----------------------------------------------------
  // The form runs to ten sections and roughly a dozen phone-heights. Editing one
  // price on an existing product meant scrolling past images, variations and
  // wholesale tiers to reach it, then scrolling all the way back to save.
  //
  // Every section card reports its offset; the bar scrolls straight to it. All
  // the cards are siblings inside one scroll view, so their y values are directly
  // comparable — no measure() round-trip needed.
  const formScrollRef = useRef<any>(null);
  const sectionYRef = useRef<Record<string, number>>({});
  const onSectionLayout = useCallback(
    (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
      sectionYRef.current[key] = e.nativeEvent.layout.y;
    },
    [],
  );
  const jumpToSection = useCallback((key: string) => {
    const y = sectionYRef.current[key];
    if (typeof y !== 'number') return;
    // A little headroom so the section title is not flush against the header.
    formScrollRef.current?.scrollToPosition?.(0, Math.max(0, y - 12), true);
  }, []);

  const FORM_SECTIONS: Array<{ key: string; label: string }> = useMemo(() => [
    { key: 'media', label: t('admin.products.form.media', { defaultValue: 'Photos' }) },
    { key: 'basic', label: t('admin.products.form.basicInfo') },
    { key: 'pricing', label: t('admin.products.form.pricingAndStock') },
    { key: 'variations', label: t('admin.products.form.variations') },
    { key: 'specs', label: t('admin.products.form.specifications', { defaultValue: 'Specifications' }) },
    { key: 'details', label: t('admin.products.form.details', { defaultValue: 'Details' }) },
    { key: 'description', label: t('admin.products.form.description') },
  ], [t]);

  // ---- Unsaved-changes guard ------------------------------------------------
  // This form runs to ten sections. Closing it discarded everything typed, with
  // no warning and no undo — the single most expensive thing it could do to
  // someone halfway through listing a phone.
  //
  // Dirtiness is a snapshot comparison rather than a flag set from three dozen
  // setState call sites: a flag set by hand goes stale the first time someone
  // adds a field and forgets to set it, and it also reports "dirty" for a value
  // typed and then typed back.
  const [isDirty, setIsDirty] = useState(false);
  const baselineRef = useRef<string>('');

  const formSnapshot = useCallback(() => JSON.stringify({
    formData,
    variations,
    colorVariations,
    specEntries,
    priceTiers,
    shippingRates,
    imageUrls,
    videoUrl,
    isFeatured,
    isActive,
  }), [formData, variations, colorVariations, specEntries, priceTiers, shippingRates, imageUrls, videoUrl, isFeatured, isActive]);

  useEffect(() => {
    if (!modalVisible) {
      baselineRef.current = '';
      setIsDirty(false);
      return;
    }
    // openAddModal / openEditModal set every field in the same batch that flips
    // modalVisible, so this commit already holds the loaded product.
    baselineRef.current = formSnapshot();
    setIsDirty(false);
    // Intentionally keyed on modalVisible alone: re-baselining on every edit is
    // exactly what would make the guard never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalVisible]);

  useEffect(() => {
    if (!modalVisible || !baselineRef.current) return;
    setIsDirty(formSnapshot() !== baselineRef.current);
  }, [modalVisible, formSnapshot]);

  const closeFormModal = useCallback(() => {
    // Blocked while work is in flight: closing mid-save/mid-upload is what let a
    // completion land on the next product the admin opened.
    if (saving || uploadingImage || uploadingVideo) return;
    const discard = () => {
      setModalVisible(false);
      resetForm();
    };
    if (!isDirty) {
      discard();
      return;
    }
    Alert.alert(
      t('admin.products.form.discardTitle', { defaultValue: 'Discard this product?' }),
      t('admin.products.form.discardBody', { defaultValue: 'What you have filled in will be lost. It has not been saved.' }),
      [
        { text: t('admin.products.form.keepEditing', { defaultValue: 'Keep editing' }), style: 'cancel' },
        { text: t('admin.products.form.discard', { defaultValue: 'Discard' }), style: 'destructive', onPress: discard },
      ],
    );
  }, [saving, uploadingImage, uploadingVideo, isDirty, t]);

  const [aiFilling, setAiFilling] = useState(false);

  // The draft is applied SECONDS after the button was tapped — the request takes a
  // few, and the Keep-mine/Replace choice takes longer still. The form stays
  // editable throughout, so a callback closed over `formData` writes back a
  // snapshot from before the admin's last few keystrokes and silently loses them.
  // These refs are what "the form, now" means at the moment of applying.
  const formDataRef = useRef(formData);
  const specEntriesRef = useRef(specEntries);
  useEffect(() => { formDataRef.current = formData; }, [formData]);
  useEffect(() => { specEntriesRef.current = specEntries; }, [specEntries]);

  const applyAiDraft = useCallback((draft: AiProductDraft, overwrite: boolean, session: number) => {
    // The live refs fixed one bug and opened another: "the form, now" is the wrong
    // form if the admin closed this product and opened a different one while the
    // request was in flight, or while the Keep-mine/Replace choice sat on screen.
    // Product A's name, descriptions and specs would be written into product B and
    // saved by someone who believed they were looking at B.
    //
    // Every other async writer in this file already captures editSessionRef before
    // its await; this one was the exception.
    if (!isSameEditSession(session)) return 0;
    const liveForm = formDataRef.current;
    const liveSpecs = specEntriesRef.current;
    const currentSpecs = liveSpecs.reduce<Record<string, string>>((acc, e) => {
      acc[e.key] = e.value;
      return acc;
    }, {});
    const { merged, specs, filled } = mergeDraft(liveForm, draft, currentSpecs, overwrite);
    // A new category has to drop the old translations with it. The category field
    // already does this on every manual edit; leaving them behind files the
    // product under the PREVIOUS category for Arabic and Kurdish shoppers, which
    // nothing on screen would show.
    if (merged.category !== liveForm.category) {
      merged.categoryAr = '';
      merged.categoryKu = '';
    }
    setFormData(merged);
    // Preserve the admin's ordering; append anything new after it. Compared
    // case-insensitively, or a model answering "cable" after the admin typed
    // "Cable" would add a second row for the same spec.
    const existingKeys = liveSpecs.map(e => e.key.trim().toLowerCase());
    setSpecEntries([
      ...liveSpecs.map(e => ({ key: e.key, value: specs[e.key] ?? e.value })),
      ...Object.keys(specs)
        .filter(k => !existingKeys.includes(k.trim().toLowerCase()))
        .map(k => ({ key: k, value: specs[k] })),
    ]);
    return filled.length;
  }, []);

  const handleAiFill = useCallback(async () => {
    if (aiFilling) return;
    const name = formData.name.trim();
    if (!name) {
      Alert.alert(
        t('admin.products.form.aiNeedNameTitle', { defaultValue: 'Type the product name first' }),
        t('admin.products.form.aiNeedName', { defaultValue: 'The name is all it needs — everything else is filled from it.' }),
      );
      return;
    }

    // Captured before the await, checked after it.
    const session = editSessionRef.current;

    setAiFilling(true);
    try {
      const draft = await fetchProductDraft({
        name,
        brand: formData.brand,
        category: formData.category,
        categories: managedCategories.map(c => c.name).filter(Boolean),
      });

      // Bail before the dry run and before any alert: a late answer for a product
      // the admin has already left must not even raise "Replace them too?" over
      // the form they are looking at now.
      if (!isSameEditSession(session)) return;

      // Dry run first, purely to count what would be overwritten. Reads the live
      // form for the same reason applyAiDraft does — the admin may have typed
      // while the request was in flight.
      const currentSpecs = specEntriesRef.current.reduce<Record<string, string>>((acc, e) => {
        acc[e.key] = e.value;
        return acc;
      }, {});
      const { skipped } = mergeDraft(formDataRef.current, draft, currentSpecs, false);

      if (skipped.length > 0) {
        Alert.alert(
          t('admin.products.form.aiFilledTitle', { defaultValue: 'Filled in' }),
          t('admin.products.form.aiSomeKept', {
            count: skipped.length,
            defaultValue: 'Your own {{count}} field(s) were left as they are. Replace them too?',
          }),
          [
            {
              text: t('admin.products.form.aiKeepMine', { defaultValue: 'Keep mine' }),
              style: 'cancel',
              onPress: () => { applyAiDraft(draft, false, session); },
            },
            {
              text: t('admin.products.form.aiReplaceMine', { defaultValue: 'Replace' }),
              style: 'destructive',
              onPress: () => { applyAiDraft(draft, true, session); },
            },
          ],
        );
        return;
      }

      const filledCount = applyAiDraft(draft, false, session);
      if (filledCount === 0) {
        Alert.alert(
          t('admin.products.form.aiNothingTitle', { defaultValue: 'Nothing to add' }),
          t('admin.products.form.aiNothing', { defaultValue: 'It had nothing to add to what you have already written.' }),
        );
      }
    } catch (err: any) {
      // Silent for a product the admin has already left — an error about a form
      // they closed is noise at best and misleading at worst.
      if (!isSameEditSession(session)) return;
      // Every failure here is recoverable by typing the fields, so it says so
      // rather than reading like something broke.
      const code = err?.message || '';
      Alert.alert(
        t('admin.products.form.aiFailedTitle', { defaultValue: 'Could not fill it in' }),
        code === 'AI_UNPARSEABLE'
          ? t('admin.products.form.aiUnparseable', { defaultValue: 'The answer came back in a form this could not read. Try again, or fill the fields yourself.' })
          : t('admin.products.form.aiFailed', { defaultValue: 'The assistant could not be reached. Check the connection, or fill the fields yourself.' }),
      );
    } finally {
      setAiFilling(false);
    }
  }, [aiFilling, formData.name, formData.brand, formData.category, managedCategories, applyAiDraft, t]);

  const addSpec = () => {
    const k = newSpecKey.trim();
    const v = newSpecValue.trim();
    if (!k || !v) return;
    if (specEntries.some(s => s.key.toLowerCase() === k.toLowerCase())) {
      Alert.alert(t('admin.common.error'), t('admin.products.form.duplicateSpec', { defaultValue: 'That spec already exists' }));
      return;
    }
    setSpecEntries([...specEntries, { key: k, value: v }]);
    setNewSpecKey('');
    setNewSpecValue('');
  };
  const removeSpec = (key: string) => setSpecEntries(specEntries.filter(s => s.key !== key));
  const updateSpecValue = (key: string, value: string) =>
    setSpecEntries(specEntries.map(s => (s.key === key ? { ...s, value } : s)));

  const removeVariation = (variationId: string) => {
    setVariations(variations.filter(v => v.variationId !== variationId));
  };

  const updateVariationStock = (variationId: string, newStock: string) => {
    const stockNum = parseInt(newStock, 10);
    if (isNaN(stockNum) || stockNum < 0) return;
    setVariations(variations.map(v =>
      v.variationId === variationId ? { ...v, stockQuantity: stockNum } : v
    ));
  };

  // ALIBABA VARIATION: Color variation management
  const addColorVariation = (colorKey: ProductColor) => {
    const stockNum = parseInt(newColorStock, 10) || 0;

    if (colorVariations.some(v => v.colorValue === colorKey)) {
      Alert.alert(t('admin.common.error'), t('admin.products.duplicateColor', { defaultValue: 'This color already exists' }));
      return;
    }
    if (stockNum < 0) {
      Alert.alert(t('admin.common.error'), t('admin.products.negativeStock', { defaultValue: 'Stock cannot be negative' }));
      return;
    }

    const colorOption = PRODUCT_COLOR_OPTIONS.find(c => c.key === colorKey);
    
    const newVariation: ColorVariation = {
      variationId: `color_${Date.now()}_${colorKey}`,
      colorValue: colorKey,
      colorHex: colorOption?.hex,
      stockQuantity: stockNum,
    };

    setColorVariations([...colorVariations, newVariation]);
    setNewColorStock('');
    setNewColorKey(null);
  };

  const removeColorVariation = (variationId: string) => {
    setColorVariations(colorVariations.filter(v => v.variationId !== variationId));
  };

  const updateColorVariationStock = (variationId: string, newStock: string) => {
    const stockNum = parseInt(newStock, 10);
    if (isNaN(stockNum) || stockNum < 0) return;
    setColorVariations(colorVariations.map(v =>
      v.variationId === variationId ? { ...v, stockQuantity: stockNum } : v
    ));
  };

  // Pick + upload an image for a color (swaps the hero when that color is selected).
  const pickColorVariationImage = async (variationId: string) => {
    const session = editSessionRef.current;
    try {
      const result = await ImageService.pickImage({ quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      if (!isSameEditSession(session)) return;
      setColorImgUploadingId(variationId);
      const up = await ImageService.uploadImage(result.assets[0].uri);
      // Admin may have switched products mid-upload — don't commit into another product.
      if (!isSameEditSession(session)) return;
      if (up.success && up.url) {
        const url = up.url;
        setColorVariations(prev => prev.map(v => v.variationId === variationId ? { ...v, imageUrl: url } : v));
      } else {
        Alert.alert(t('admin.common.error'), t('admin.products.form.imageUploadFailed', { defaultValue: 'Image upload failed' }));
      }
    } catch {
      if (!isSameEditSession(session)) return;
      Alert.alert(t('admin.common.error'), t('common.somethingWentWrong', { defaultValue: 'Something went wrong' }));
    } finally {
      if (isSameEditSession(session)) setColorImgUploadingId(null);
    }
  };
  const removeColorVariationImage = (variationId: string) =>
    setColorVariations(prev => prev.map(v => v.variationId === variationId ? { ...v, imageUrl: undefined } : v));

  const updateVariationSize = (variationId: string, newSize: string) => {
    const sizeText = newSize.trim();
    if (!sizeText) return;
    if (variations.some(v => v.variationId !== variationId && v.sizeValue === sizeText)) {
      Alert.alert(t('admin.common.error'), t('admin.products.duplicateSizeValue', { defaultValue: 'This size already exists' }));
      return;
    }
    setVariations(variations.map(v =>
      v.variationId === variationId ? { ...v, sizeValue: sizeText } : v
    ));
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = useCallback((product: Product) => {
    // Invalidate any in-flight image upload from a previously-open product so it
    // can't commit into THIS product's form (isSameEditSession guard).
    editSessionRef.current++;
    // Fresh product → the loaded historical value is the stored one, not a manual override.
    historicalTouchedRef.current = false;
    setEditingProduct(product);
    setIsFeatured(!!(product as any).isFeatured);
    setIsActive((product as any).isActive !== false);
    setFormData({
      name: product.name || '',
      nameAr: product.nameAr || '',
      nameKu: product.nameKu || '',
      partNumber: product.partNumber || '',
      category: product.category || '',
      categoryAr: (product as any).categoryAr || '',
      categoryKu: (product as any).categoryKu || '',
      priceUSD: product.priceUSD?.toString() || '',
      priceIQD: (product as any).priceIQD != null ? String((product as any).priceIQD) : '',
      compareAtPriceUSD: product.compareAtPriceUSD != null ? String(product.compareAtPriceUSD) : '',
      compareAtPriceIQD: (product as any).compareAtPriceIQD != null ? String((product as any).compareAtPriceIQD) : '',
      vipPriceUSD: product.vipPriceUSD != null ? String(product.vipPriceUSD) : '',
      vipPriceIQD: (product as any).vipPriceIQD != null ? String((product as any).vipPriceIQD) : '',
      purchasePrice: (product as any).purchasePrice?.toString() || '',
      purchasePriceIQD: (product as any).purchasePriceIQD != null ? String((product as any).purchasePriceIQD) : '',
      stockQty: product.stockQty?.toString() || '',
      historicalStockQty: product.historicalStockQty?.toString() || '',
      initialStock: product.initialStock?.toString() || '',
      shippingCost: product.shippingCost?.toString() || '',
      description: product.description || '',
      descriptionAr: (product as any).descriptionAr || '',
      descriptionKu: (product as any).descriptionKu || '',
      brand: product.brand || '',
      // Preserve an existing product's condition across edits. mapProduct always
      // returns a truthy string here (defaults unset rows to 'new' on read), so
      // without this an admin editing a 'used' trade-in listing — including one
      // created via the hand-off below — would silently flip it back to 'new' on
      // save, since handleSave now sends formData.condition unconditionally.
      condition: (product as any).condition || 'new',
      status: product.status || 'available',
      warranty: (product as any).warranty || '',
      sku: (product as any).sku || '',
      barcode: (product as any).barcode || '',
      weight: (product as any).weight != null ? String((product as any).weight) : '',
      dimLength: (product as any).dimensions?.length != null ? String((product as any).dimensions.length) : '',
      dimWidth: (product as any).dimensions?.width != null ? String((product as any).dimensions.width) : '',
      dimHeight: (product as any).dimensions?.height != null ? String((product as any).dimensions.height) : '',
    });
    const specObj = (product as any).specifications || {};
    setSpecEntries(Object.keys(specObj).map(k => ({ key: k, value: String(specObj[k]) })));
    setApplyShippingToAll(false);
    setShippingRates(product.shippingRates || []);
    setNewCityName('');
    setNewCityPrice('');
    setImageUrls(product.imageUrls || []);
    setPriceTiers((product.priceTiers || []).map(tr => ({ ...tr, _key: newTierKey() })));
    setColorOptions(product.options?.colors || []);
    setVariations(product.variations || []);
    setColorVariations(product.colorVariations || []);
    setNewSizeValue('');
    setNewSizeStock('');
    setNewSizePrice('');
    setNewColorStock('');
    // Video state from product
    setVideoUrl(product.videoUrl || null);
    setVideoUri(null);
    setVideoUploadProgress(0);
    setModalVisible(true);
  }, []);

  const handleSave = async (force = false) => {
    // Edit session this save belongs to; the tail of this function must not act on
    // a form the admin has since replaced.
    const session = editSessionRef.current;

    // Sanitize price strings (e.g. strip $). Defined here so the validation
    // below can use it too — it was previously declared inside the try block,
    // which made the `status === 'available'` price check throw a ReferenceError
    // and silently block adding any "Available" product.
    const sanitizePrice = (val: string) => {
      if (!val) return 0;
      const cleaned = val.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    };

    // Dinar has no minor unit and the column is numeric(12,0), so anything after
    // a decimal point would be silently rounded by Postgres. Strip it here
    // instead, where the admin can still see what was kept.
    const sanitizeIQD = (val: string) => {
      if (!val) return 0;
      const cleaned = val.replace(/[^0-9]/g, '');
      return parseInt(cleaned, 10) || 0;
    };
    const iqdPrice = sanitizeIQD(formData.priceIQD);
    // A dinar price wins: it is the figure the shop typed, and the dollar price
    // is derived from it rather than the other way round.
    const effectivePriceUSD = iqdPrice > 0
      ? convertIQDToUSD(iqdPrice, exchangeRateIQD)
      : sanitizePrice(formData.priceUSD);

    // Trimmed: " " is not a name — untrimmed truthiness let whitespace-only values save.
    // Price is checked below, and only for `available`, so a coming_soon product can be
    // saved without one (which the unconditional `!formData.priceUSD` test blocked).
    if (!formData.name.trim() || !formData.partNumber.trim()) {
      Alert.alert(t('admin.common.error'), t('admin.products.fillRequired'));
      return;
    }
    // Available products must have a real price; coming_soon/on_the_way may stay $0.
    if (formData.status === 'available' && !(effectivePriceUSD > 0)) {
      Alert.alert(t('admin.common.error'), t('admin.products.priceMustBePositive', { defaultValue: 'Available products need a price greater than 0.' }));
      return;
    }
    // validatePriceTiers rejects the ENTIRE tier array if any single tier is invalid, so
    // one freshly-added tier left at the seeded price of 0 silently kills wholesale
    // pricing for the whole product (the storefront just falls back to the base price).
    // Same rule as src/utils/pricingUtils.ts: positive minQty, positive price, ascending.
    const tiersByMinQty = [...priceTiers].sort((a, b) => a.minQty - b.minQty);
    const hasInvalidTier = tiersByMinQty.some((tier, i) =>
      !(tier.minQty > 0) || !(tier.priceUSD > 0) || (i > 0 && tier.minQty === tiersByMinQty[i - 1].minQty)
    );
    if (hasInvalidTier) {
      Alert.alert(
        t('admin.common.error'),
        t('admin.products.invalidPriceTiers', { defaultValue: 'Every wholesale tier needs a quantity and a price greater than 0, and two tiers cannot share the same minimum quantity.' })
      );
      return;
    }
    if (!tenantId) {
      Alert.alert(t('admin.common.error'), 'No tenant ID available');
      return;
    }

    // Pre-save safety warnings (skippable). Both re-call handleSave(true) to proceed.
    if (!force) {
      const price = effectivePriceUSD;
      // Costed in whichever currency it was typed in: a dinar cost has
      // purchasePrice empty, and comparing the price against 0 would let a
      // below-cost sale through the guard silently.
      const cost = costUSD(
        { purchasePrice: sanitizePrice(formData.purchasePrice), purchasePriceIQD: sanitizeIQD(formData.purchasePriceIQD) },
        exchangeRateIQD,
      );
      const tierBelow = priceTiers.some(tr => cost > 0 && tr.priceUSD > 0 && tr.priceUSD <= cost);
      if (cost > 0 && ((price > 0 && price <= cost) || tierBelow)) {
        Alert.alert(
          t('admin.products.belowCostTitle', { defaultValue: 'Price below cost' }),
          t('admin.products.belowCostWarn', { defaultValue: 'The selling price or a wholesale tier is at or below your cost. Save anyway?' }),
          [{ text: t('admin.common.cancel'), style: 'cancel' }, { text: t('admin.products.saveAnyway', { defaultValue: 'Save anyway' }), onPress: () => handleSave(true) }]
        );
        return;
      }
      const pn = formData.partNumber.trim().toLowerCase();
      const dup = pn.length > 0 && products.find(p => p.id !== editingProduct?.id && (p.partNumber || '').trim().toLowerCase() === pn);
      if (dup) {
        Alert.alert(
          t('admin.products.dupPartTitle', { defaultValue: 'Duplicate part number' }),
          t('admin.products.dupPartWarn', { name: dup.name, defaultValue: `Part number is already used by "${dup.name}". Continue anyway?` }),
          [{ text: t('admin.common.cancel'), style: 'cancel' }, { text: t('admin.common.continue', { defaultValue: 'Continue' }), onPress: () => handleSave(true) }]
        );
        return;
      }
    }

    setSaving(true);
    try {
      const service = createTenantAdminService(tenantId);

      const optionsData = (() => {
        const opts: { colors?: string[] } = {};
        const trimmedColors = colorOptions.map(c => c.trim()).filter(c => c);
        if (trimmedColors.length > 0) opts.colors = trimmedColors;
        return Object.keys(opts).length > 0 ? opts : null;
      })();

      const variationsData = variations.length > 0 ? variations : [];
      const colorVariationsData = colorVariations.length > 0 ? colorVariations : [];

      const payloadPurchasePrice = sanitizePrice(formData.purchasePrice);
      const payloadPurchasePriceIQD = (() => {
        const iqd = sanitizeIQD(formData.purchasePriceIQD);
        return iqd > 0 ? iqd : null;
      })();

      const newStockQty = parseInt(formData.stockQty) || 0;
      const newVariationStock = variations.reduce((s, v) => s + (v.stockQuantity || 0), 0);
      const newColorStock = colorVariations.reduce((s, v) => s + (v.stockQuantity || 0), 0);
      const newEffectiveStock = newStockQty + newVariationStock + newColorStock;

      let historicalStockQty = newEffectiveStock;

      if (formData.historicalStockQty && formData.historicalStockQty.trim() !== '') {
        historicalStockQty = parseInt(formData.historicalStockQty) || 0;
      } else if (editingProduct) {
        const oldEffectiveStock = getEffectiveStock(editingProduct);
        const oldHistorical = editingProduct.historicalStockQty || oldEffectiveStock;
        
        const stockDelta = newEffectiveStock - oldEffectiveStock;
        historicalStockQty = Math.max(0, oldHistorical + stockDelta);
      }

      // Store trimmed: trailing spaces break part-number matching and search.
      const trimmedName = formData.name.trim();
      const trimmedPartNumber = formData.partNumber.trim();

      const productData: any = {
        name: trimmedName,
        // NULL when blank, never a copy of the English name. Copying made the value
        // STICKY: the copy loads back into the form on the next edit, so renaming
        // the product in English no longer updated the Arabic/Kurdish columns and
        // those shoppers kept seeing the original name indefinitely.
        nameAr: formData.nameAr.trim() || null,
        nameKu: formData.nameKu.trim() || null,
        partNumber: trimmedPartNumber,
        // TRIMMED, like every other text field here. `category` and `brand` are the two
        // columns the storefront GROUPS by, so stray whitespace does not just look untidy —
        // it splits one brand into two. Three live rows already carry it ("Tecno ",
        // "Motorola ", "Honor "), which made the same phone brand appear twice in filters.
        category: formData.category.trim() || 'General',
        // Blank stays NULL, never the English text. Back-filling English here made
        // the customer-side fallback (`categoryAr?.trim() ? categoryAr : category`)
        // unreachable, so an Arabic shopper saw English for a field the admin had
        // simply left empty — and the app could never tell "not translated" from
        // "translated to the same words".
        categoryAr: (formData as any).categoryAr?.trim() || null,
        categoryKu: (formData as any).categoryKu?.trim() || null,
        // Derived, not typed, when the product is priced in dinar. Written so the
        // USD-only arithmetic elsewhere (cart subtotals, reports, sorting) still
        // has a sane number; it is never the source of the displayed dinar price.
        priceUSD: effectivePriceUSD,
        // null when blank, so clearing the field puts the product back on dollars.
        priceIQD: iqdPrice > 0 ? iqdPrice : null,
        // "Was" price (strike-through) and VIP-only price. Sent as null when blank
        // so clearing the field removes it; the service maps these to
        // compare_at_price_usd / vip_price_usd.
        compareAtPriceUSD: formData.compareAtPriceUSD.trim() !== '' ? sanitizePrice(formData.compareAtPriceUSD) : null,
        compareAtPriceIQD: (() => {
          const iqd = sanitizeIQD(formData.compareAtPriceIQD);
          return iqd > 0 ? iqd : null;
        })(),
        vipPriceUSD: formData.vipPriceUSD.trim() !== '' ? sanitizePrice(formData.vipPriceUSD) : null,
        // Always sent, null when blank, so clearing it actually clears the column.
        vipPriceIQD: (() => {
          const iqd = sanitizeIQD(formData.vipPriceIQD);
          return iqd > 0 ? iqd : null;
        })(),
        purchasePrice: payloadPurchasePrice,
        // Always sent, null when blank, so switching this price back to dollars
        // actually clears the dinar column instead of leaving it to outrank.
        purchasePriceIQD: payloadPurchasePriceIQD,
        stockQty: newStockQty,
        historicalStockQty: historicalStockQty,
        initialStock: parseInt(formData.initialStock) || 0,
        description: formData.description || '',
        // Same rule as the category fields above: an empty Arabic/Kurdish box is
        // stored as NULL, so the product page can fall back to English instead of
        // being handed English pretending to be a translation.
        descriptionAr: formData.descriptionAr?.trim() || null,
        descriptionKu: formData.descriptionKu?.trim() || null,
        brand: formData.brand.trim() || '',
        // Column is real and already read by mapProduct (defaults to 'new' when
        // absent) — condition was simply never written by this form before.
        // formData.condition is only ever populated by the trade-in prefill
        // effect above or by openEditModal seeding it back from an existing
        // product, so every other create/edit path keeps sending 'new' here,
        // matching the value mapProduct already assumed for them.
        condition: formData.condition || 'new',
        imageUrls: imageUrls,
        priceTiers: priceTiers.length > 0
          ? [...priceTiers].sort((a, b) => a.minQty - b.minQty).map(tier => ({
              minQty: tier.minQty,
              priceUSD: tier.priceUSD,
              ...(tier.maxQty !== undefined && { maxQty: tier.maxQty })
            }))
          : [],
        compatibleModels: editingProduct?.compatibleModels || [],
        isFeatured: isFeatured,
        isActive: isActive,
        status: formData.status,
        options: optionsData,
        variations: variationsData,
        colorVariations: colorVariationsData,
        // Always sent: spreading it in only when truthy made "no video" unrepresentable,
        // so a removed video was never cleared on the row and kept playing on the storefront.
        videoUrl: videoUrl || null,
        // STRICT: Set ownerAdminId to current admin to ensure chats are routed to them
        ownerAdminId: user?.uid || editingProduct?.ownerAdminId || null,
        // Legacy support
        adminId: user?.uid || editingProduct?.adminId || null,
        // Per-product shipping cost
        shippingCost: parseFloat(formData.shippingCost) || 0,
        // City-based shipping rates
        shippingRates: shippingRates.length > 0 ? shippingRates : [],
        // Extra product details (electronics/phone). Blank -> null so they clear.
        warranty: formData.warranty.trim() || null,
        sku: formData.sku.trim() || null,
        barcode: formData.barcode.trim() || null,
        weight: formData.weight.trim() !== '' ? (parseFloat(formData.weight) || null) : null,
        dimensions: (formData.dimLength.trim() || formData.dimWidth.trim() || formData.dimHeight.trim())
          ? {
              length: parseFloat(formData.dimLength) || 0,
              width: parseFloat(formData.dimWidth) || 0,
              height: parseFloat(formData.dimHeight) || 0,
            }
          : null,
        // Structured specs (RAM/screen/battery...) -> jsonb object
        specifications: specEntries.reduce((acc, s) => {
          const k = s.key.trim();
          if (k) acc[k] = s.value.trim();
          return acc;
        }, {} as Record<string, string>),
      };

      if (editingProduct) {
        await service.updateProduct(editingProduct.id, productData);
        Alert.alert(t('admin.common.success'), t('admin.products.updateSuccess'));
      } else {
        // Create new product. addProduct returns the new product id (a string).
        const newProductId = await service.addProduct(productData as any);

        // If there's a pending video to upload, upload it now
        if (videoUri && newProductId) {
          setUploadingVideo(true);
          setVideoUploadProgress(0);

          try {
            const result = await VideoService.uploadProductVideo(
              videoUri,
              newProductId,
              (progress) => setVideoUploadProgress(progress)
            );

            if (result.success && result.videoUrl) {
              // Update product with video URL
              await service.updateProduct(newProductId, { videoUrl: result.videoUrl });
              Alert.alert(t('admin.common.success'), t('admin.products.form.productCreatedVideoUploaded', { defaultValue: 'Product created and video uploaded successfully!' }));
            } else {
              Alert.alert(t('admin.common.success'), t('admin.products.form.productCreatedVideoFailedErr', { error: result.error || 'Unknown error', defaultValue: 'Product created, but video upload failed: {{error}}' }));
            }
          } catch (videoError) {
            Alert.alert(t('admin.common.success'), t('admin.products.form.productCreatedVideoFailed', { defaultValue: 'Product created, but video upload failed.' }));
          } finally {
            setUploadingVideo(false);
            setVideoUploadProgress(0);
          }
        } else {
          Alert.alert(t('admin.common.success'), t('admin.products.addSuccess'));
        }
      }

      // Close as soon as the row is written. Doing this only AFTER the apply-to-all loop
      // meant a failure in that loop left the modal open in create mode, and a second
      // Save inserted the product again (part_number has no UNIQUE constraint).
      // The isSameEditSession guard stays: saving a video takes tens of seconds, and the
      // admin may already be editing a different product by the time we get here.
      if (isSameEditSession(session)) {
        setModalVisible(false);
        resetForm();
      }

      // Apply ALL shipping settings (Cost + Rates) to all products if checkbox is checked.
      // Own try/catch: the product is already saved, so a failure here must not be
      // reported as a failed save (and must not re-open the create form).
      if (applyShippingToAll) {
        try {
          const allProducts = await service.getAllProducts();

          // No `> 0` / `length > 0` guards: switching the catalogue to FREE shipping means
          // propagating 0 and [], which the old guards skipped while still reporting success.
          const updates: any = {
            shippingCost: parseFloat(formData.shippingCost) || 0,
            shippingRates: shippingRates,
          };

          for (const p of allProducts) {
            if (p.id && p.id !== editingProduct?.id) {
              await service.updateProduct(p.id, updates);
            }
          }
        } catch (bulkError) {
          Alert.alert(
            t('admin.common.error'),
            t('admin.products.applyAllShippingFailed', { defaultValue: 'The product was saved, but applying the shipping settings to your other products failed.' })
          );
        }
      }

      await loadProducts();
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.products.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddImage = async () => {
    if (imageUrls.length >= 5) {
      Alert.alert(t('admin.products.limitReached'), t('admin.products.maxImages'));
      return;
    }

    const session = editSessionRef.current;

    try {
      setUploadingImage(true);
      const imageUri = await ImageService.showImagePicker();
      if (!isSameEditSession(session)) return;
      if (imageUri) {
        const result = await ImageService.uploadImage(imageUri);
        // The admin may have closed this product and opened another while the
        // upload ran; appending here would put this image in the other product's
        // gallery.
        if (!isSameEditSession(session)) return;
        if (result.success && result.url) {
          setImageUrls(prev => [...prev, result.url as string]);
        } else {
          Alert.alert(t('admin.products.uploadFailed'), result.error || t('admin.products.failedToUpload'));
        }
      }
    } catch (error) {
      if (!isSameEditSession(session)) return;
      Alert.alert(t('admin.common.error'), t('admin.products.failedToAddImage'));
    } finally {
      if (isSameEditSession(session)) setUploadingImage(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    Alert.alert(
      t('admin.products.removeImageTitle'),
      t('admin.products.removeImageMessage'),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        {
          text: t('admin.products.form.remove'),
          style: 'destructive',
          onPress: () => {
            setImageUrls(prev => prev.filter((_, i) => i !== index));
          },
        },
      ]
    );
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= imageUrls.length) return;
    setImageUrls(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  // VIDEO UPLOAD: Pick and upload video to BunnyCDN via Cloud Function
  const handleAddVideo = async () => {
    if (videoUrl || videoUri) {
      Alert.alert(
        t('admin.products.form.replaceVideoTitle', { defaultValue: 'Replace Video?' }),
        t('admin.products.form.replaceVideoMessage', { defaultValue: 'A video already exists. Do you want to replace it?' }),
        [
          { text: t('admin.common.cancel'), style: 'cancel' },
          { text: t('admin.products.form.replace', { defaultValue: 'Replace' }), onPress: () => pickAndUploadVideo() },
        ]
      );
      return;
    }
    await pickAndUploadVideo();
  };

  const pickAndUploadVideo = async () => {
    const session = editSessionRef.current;

    try {
      setUploadingVideo(true);
      setVideoUploadProgress(0);

      // Pick video
      const video = await VideoService.pickVideoFromGallery();
      if (!isSameEditSession(session)) return;
      if (!video) {
        setUploadingVideo(false);
        return;
      }

      // Validate size on client
      const validation = await VideoService.validateVideo(video.uri);
      if (!isSameEditSession(session)) return;
      if (!validation.valid) {
        Alert.alert(t('admin.common.error'), validation.error || t('admin.products.form.videoValidationFailed', { defaultValue: 'Video validation failed' }));
        setUploadingVideo(false);
        return;
      }

      setVideoUri(video.uri);
      setVideoUploadProgress(10);

      // For NEW products: just save the local URI, upload happens after product save
      if (!editingProduct) {
        Alert.alert(
          t('admin.common.success'),
          t('admin.products.form.videoSelectedMessage', { defaultValue: 'Video selected! It will be uploaded when you save the product.' }),
          [{ text: t('admin.common.ok', { defaultValue: 'OK' }) }]
        );
        setUploadingVideo(false);
        setVideoUploadProgress(0);
        return;
      }

      // For EXISTING products: upload immediately AND save to Firestore
      // Captured so the DB write below targets the product this upload was started
      // for, even if the admin has since opened a different one.
      const uploadTargetId = editingProduct.id;
      const result = await VideoService.uploadProductVideo(
        video.uri,
        uploadTargetId,
        (progress) => { if (isSameEditSession(session)) setVideoUploadProgress(progress); }
      );

      if (result.success && result.videoUrl) {
        // The DB write is still correct for uploadTargetId and must happen either
        // way, but the local form state belongs to whichever product is open now —
        // committing it blindly would attach this video to that other product and
        // the next Save would persist it there.
        if (isSameEditSession(session)) {
          setVideoUrl(result.videoUrl);
          setVideoUri(null);
        }

        // AUTO-SAVE: Immediately persist videoUrl to Firestore so it's not lost
        try {
          const service = createTenantAdminService(tenantId!);
          await service.updateProduct(uploadTargetId, { videoUrl: result.videoUrl });
          Alert.alert(t('admin.common.success'), t('admin.products.form.videoUploadedSaved', { defaultValue: 'Video uploaded and saved!' }));
        } catch (saveError) {
          console.error('Failed to save video URL:', saveError);
          Alert.alert(t('admin.common.success'), t('admin.products.form.videoUploadedClickSave', { defaultValue: 'Video uploaded! Click Save to persist.' }));
        }
      } else {
        Alert.alert(t('admin.common.error'), result.error || t('admin.products.form.videoUploadFailed', { defaultValue: 'Video upload failed' }));
        if (isSameEditSession(session)) setVideoUri(null);
      }
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.products.form.videoUploadFailed', { defaultValue: 'Failed to upload video' }));
      if (isSameEditSession(session)) setVideoUri(null);
    } finally {
      if (isSameEditSession(session)) {
        setUploadingVideo(false);
        setVideoUploadProgress(0);
      }
    }
  };

  const handleRemoveVideo = () => {
    Alert.alert(
      t('admin.products.form.removeVideoTitle', { defaultValue: 'Remove Video?' }),
      t('admin.products.form.removeVideoMessage', { defaultValue: 'Are you sure you want to remove the video?' }),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        {
          text: t('admin.products.form.remove'),
          style: 'destructive',
          onPress: async () => {
            setVideoUrl(null);
            setVideoUri(null);
            
            // AUTO-SAVE: Immediately persist removal to Firestore for existing products
            if (editingProduct && tenantId) {
              try {
                const service = createTenantAdminService(tenantId);
                await service.updateProduct(editingProduct.id, { videoUrl: '' });
                Alert.alert(t('admin.common.success'), t('admin.products.form.videoRemoved', { defaultValue: 'Video removed!' }));
              } catch (error) {
                console.error('Failed to remove video:', error);
                Alert.alert(t('admin.common.error'), t('admin.products.form.videoRemoveFailed', { defaultValue: 'Failed to remove video from server.' }));
              }
            }
          },
        },
      ]
    );
  };

  const handleDelete = useCallback((product: Product) => {
    Alert.alert(
      t('admin.products.deleteTitle'),
      t('admin.products.deleteMessage', { name: product.name }),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        {
          text: t('admin.common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!tenantId) return;
            try {
              const service = createTenantAdminService(tenantId);
              await service.deleteProduct(product.id);
              setProducts(prev => prev.filter(p => p.id !== product.id));
              Alert.alert(t('admin.common.success'), t('admin.products.deleteSuccess'));
            } catch (error) {
              Alert.alert(t('admin.common.error'), t('admin.products.deleteFailed'));
            }
          },
        },
      ]
    );
  }, [t, tenantId]);

  // Duplicate a product: copy everything except stock (reset to 0) and part number
  // (blanked so the owner sets a fresh one). Saves immediately and refreshes.
  const handleDuplicate = useCallback(async (product: Product) => {
    if (!tenantId) return;
    try {
      const service = createTenantAdminService(tenantId);
      // Spread the source instead of re-listing fields: the old explicit literal silently
      // dropped every column it forgot (compare-at/VIP price, AR/KU descriptions, specs,
      // warranty, sku, barcode, weight, dimensions, video, storage options), so the copy
      // came back stripped. Only the deliberate resets are overridden below.
      const { id, created_at, updated_at, createdAt, updatedAt, ...source } = product as any;
      const copy: any = {
        ...source,
        name: `${product.name} (copy)`,
        nameAr: product.nameAr || product.name,
        nameKu: product.nameKu || product.name,
        partNumber: '',
        stockQty: 0,
        historicalStockQty: 0,
        initialStock: 0,
        isFeatured: false,
        isActive: true,
        variations: [],
        colorVariations: [],
        ownerAdminId: user?.uid || null,
        adminId: user?.uid || null,
      };
      await service.addProduct(copy);
      Alert.alert(t('admin.common.success'), t('admin.products.duplicated', { defaultValue: 'Product copied. Edit it to set stock and a new part number.' }));
      loadProducts();
    } catch (e) {
      Alert.alert(t('admin.common.error'), t('admin.products.duplicateFailed', { defaultValue: 'Could not duplicate the product.' }));
    }
  }, [tenantId, user, t, loadProducts]);

  // Per-card actions menu — replaces the one-tap trash so a stray scroll-tap can't delete.
  const openProductActions = useCallback((product: Product) => {
    // Android renders at most three buttons: RN's Alert does buttons.slice(0, 3),
    // so a fourth "Cancel" was silently dropped — and Android defaults to
    // cancelable: false, which blocks the BACK key and outside taps too. The menu
    // therefore appeared on Android as Edit / Duplicate / Delete with no way out,
    // forcing the admin to pick one of three actions with the destructive one
    // promoted to the primary slot.
    //
    // Android gets three buttons plus dismissability; iOS keeps an explicit Cancel,
    // because an iOS alert cannot be dismissed by tapping outside — dropping the
    // button there would strand the user instead.
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: t('admin.products.form.edit', { defaultValue: 'Edit' }), onPress: () => openEditModal(product) },
      { text: t('admin.products.duplicate', { defaultValue: 'Duplicate' }), onPress: () => handleDuplicate(product) },
      { text: t('admin.common.delete'), style: 'destructive', onPress: () => handleDelete(product) },
    ];
    if (Platform.OS === 'ios') {
      buttons!.push({ text: t('admin.common.cancel'), style: 'cancel' });
    }

    Alert.alert(
      product.name || t('admin.products.title', { defaultValue: 'Product' }),
      undefined,
      buttons,
      { cancelable: true, onDismiss: () => {} }
    );
  }, [t, openEditModal, handleDuplicate, handleDelete]);

  // Bulk: set the same status on every selected product (e.g. a shipment arrived → all Available).
  // DECLARED ABOVE THE BULK CALLBACKS, not 100 lines below them. Both
  // useCallback dependency arrays below name `selectedIds`, and a dependency
  // array is built DURING RENDER at that line — so this state was read about a
  // hundred lines before its own `const` ran, on every render of the screen. It
  // survives today only because of how the bundle transpiles block scoping; under
  // a toolchain that keeps the temporal dead zone it is a hard crash on the
  // admin's product list. One of the errors `@ts-nocheck` was hiding.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const bulkSetStatus = useCallback((status: ProductStatus) => {
    const ids = Array.from(selectedIds);
    if (!tenantId || !ids.length) return;
    Alert.alert(
      t('admin.products.bulkTitle', { defaultValue: 'Update products' }),
      t('admin.products.bulkStatusMsg', { count: ids.length, defaultValue: `Update ${ids.length} products?` }),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        { text: t('admin.common.update'), onPress: async () => {
          setBulkBusy(true);
          try {
            const service = createTenantAdminService(tenantId);
            const results = await Promise.allSettled(ids.map(id => service.updateProduct(id, { status })));
            const failed = results.filter(r => r.status === 'rejected').length;
            setSelectionMode(false); setSelectedIds(new Set());
            // Reconcile with server truth instead of optimistically flipping local state,
            // so partial/total failures aren't silently shown as success.
            await loadProducts();
            if (failed) Alert.alert(t('admin.common.error'), t('admin.products.bulkFailed', { defaultValue: 'Bulk update failed.' }));
          } catch { Alert.alert(t('admin.common.error'), t('admin.products.bulkFailed', { defaultValue: 'Bulk update failed.' })); }
          finally { setBulkBusy(false); }
        } },
      ]
    );
  }, [selectedIds, tenantId, t, loadProducts]);

  const bulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (!tenantId || !ids.length) return;
    Alert.alert(
      t('admin.products.bulkDeleteTitle', { defaultValue: 'Delete products' }),
      t('admin.products.bulkDeleteMsg', { count: ids.length, defaultValue: `Delete ${ids.length} products permanently?` }),
      [
        { text: t('admin.common.cancel'), style: 'cancel' },
        { text: t('admin.common.delete'), style: 'destructive', onPress: async () => {
          setBulkBusy(true);
          try {
            const service = createTenantAdminService(tenantId);
            const results = await Promise.allSettled(ids.map(id => service.deleteProduct(id)));
            const failed = results.filter(r => r.status === 'rejected').length;
            setSelectionMode(false); setSelectedIds(new Set());
            // Reconcile with server truth instead of optimistically removing rows,
            // so failed deletes don't vanish from the UI while surviving on the server.
            await loadProducts();
            if (failed) Alert.alert(t('admin.common.error'), t('admin.products.bulkFailed', { defaultValue: 'Bulk update failed.' }));
          } catch { Alert.alert(t('admin.common.error'), t('admin.products.bulkFailed', { defaultValue: 'Bulk update failed.' })); }
          finally { setBulkBusy(false); }
        } },
      ]
    );
  }, [selectedIds, tenantId, t, loadProducts]);

  // ===== REORDER FUNCTIONS =====
  const enterReorderMode = useCallback(() => {
    setReorderedProducts([...products]);
    setReorderMode(true);
    setSearchQuery('');
    setFilterStatus('all');
  }, [products]);

  const exitReorderMode = useCallback(() => {
    setReorderMode(false);
    setReorderedProducts([]);
  }, []);

  const moveProduct = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= reorderedProducts.length) return;
    setReorderedProducts(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, [reorderedProducts.length]);

  const saveReorder = useCallback(async () => {
    if (!tenantId) return;
    setSavingOrder(true);
    try {
      const service = createTenantAdminService(tenantId);
      const sortOrders = reorderedProducts.map((p, index) => ({
        id: p.id,
        sortOrder: index,
      }));
      await service.updateProductSortOrders(sortOrders);
      // Update local state with new order
      setProducts(reorderedProducts.map((p, i) => ({ ...p, sortOrder: i })));
      setReorderMode(false);
      setReorderedProducts([]);
      Alert.alert(t('admin.common.success'), t('admin.products.reorderSuccess', { defaultValue: 'Product order saved!' }));
    } catch (error) {
      Alert.alert(t('admin.common.error'), t('admin.products.reorderFailed', { defaultValue: 'Failed to save product order' }));
    } finally {
      setSavingOrder(false);
    }
  }, [tenantId, reorderedProducts, t]);

  type FilterStatus = 'all' | 'in_stock' | 'low_stock' | 'coming_soon' | 'on_the_way' | 'out_of_stock';
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  type SortMode = 'default' | 'stock_low' | 'price_high' | 'price_low' | 'name' | 'newest';
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  // Debounce search so filtering all ~258 products doesn't run on every keystroke (smooth typing).
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const filteredProducts = products.filter(product => {
    // 1. STATUS FILTER
    const effectiveStock = getEffectiveStock(product);
    
    if (filterStatus === 'in_stock' && effectiveStock <= 0) return false;
    if (filterStatus === 'low_stock') {
      const threshold = product.initialStock && product.initialStock > 0 ? product.initialStock : 5;
      if (effectiveStock <= 0 || effectiveStock > threshold) return false;
    }
    if (filterStatus === 'out_of_stock' && effectiveStock > 0) return false;
    if (filterStatus === 'coming_soon' && product.status !== 'coming_soon') return false;
    if (filterStatus === 'on_the_way' && product.status !== 'on_the_way') return false;

    if (!debouncedQuery) return true;
    
    // Helper to normalize text (remove special chars) for flexible number matching
    // e.g. "12-34" becomes "1234"
    const normalize = (text: string | null | undefined) => {
      if (!text) return '';
      return text.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const searchTerms = debouncedQuery.toLowerCase().split(' ').filter(term => term.length > 0);
    const normalizedTerms = searchTerms.map(t => normalize(t));
    
    // Helper to check if a term exists in any product field
    const matchesTerm = (term: string, index: number) => {
      const normalizedTerm = normalizedTerms[index];
      const hasNormalizedTerm = normalizedTerm.length > 0;

      // 1. Basic Fields (Direct includes for text)
      if (
        (product.name && product.name.toLowerCase().includes(term)) ||
        (product.nameAr && product.nameAr.toLowerCase().includes(term)) ||
        (product.nameKu && product.nameKu.toLowerCase().includes(term)) ||
        (product.description && product.description.toLowerCase().includes(term)) ||
        (product.category && product.category.toLowerCase().includes(term)) ||
        (product.brand && product.brand.toLowerCase().includes(term))
      ) {
        return true;
      }

      // 2. Part Number / Serial (Flexible Match)
      // Check strict inclusion OR normalized inclusion
      if (product.partNumber) {
        const rawPart = product.partNumber.toLowerCase();
        const normPart = normalize(product.partNumber);
        if (rawPart.includes(term) || (hasNormalizedTerm && normPart.includes(normalizedTerm))) {
          return true;
        }
      }

      // 3. Compatible Models
      if (product.compatibleModels && product.compatibleModels.some(model => 
        model.toLowerCase().includes(term) || 
        (hasNormalizedTerm && normalize(model).includes(normalizedTerm))
      )) {
        return true;
      }

      // 4. Variations (Size, ID)
      if (product.variations && product.variations.some(v => {
        const rawId = v.variationId ? v.variationId.toLowerCase() : '';
        const normId = normalize(rawId);
        const size = v.sizeValue ? v.sizeValue.toLowerCase() : '';
        
        return (
          size.includes(term) ||
          rawId.includes(term) ||
          (hasNormalizedTerm && normId.includes(normalizedTerm))
        );
      })) {
        return true;
      }

      // 5. Color Variations (Color Name, ID)
      if (product.colorVariations && product.colorVariations.some(v => {
        const rawId = v.variationId ? v.variationId.toLowerCase() : '';
        const normId = normalize(rawId);
        const color = v.colorValue ? v.colorValue.toLowerCase() : '';

        return (
          color.includes(term) ||
          rawId.includes(term) ||
          (hasNormalizedTerm && normId.includes(normalizedTerm))
        );
      })) {
        return true;
      }

      // 6. Legacy Options
      if (product.options) {
        if (product.options.colors && product.options.colors.some(c => c.toLowerCase().includes(term))) return true;
        if (product.options.sizes && product.options.sizes.some(s => s.toLowerCase().includes(term))) return true;
      }
      
      return false;
    };

    // AND LOGIC: Every typed term must match *somewhere* in the product
    return searchTerms.every((term, index) => matchesTerm(term, index));
  });

  // Optional sort on top of the filter (manual reorder stays the default order).
  const sortedProducts = (() => {
    if (sortMode === 'default') return filteredProducts;
    const arr = [...filteredProducts];
    switch (sortMode) {
      case 'stock_low': arr.sort((a, b) => getEffectiveStock(a) - getEffectiveStock(b)); break;
      case 'price_high': arr.sort((a, b) => (b.priceUSD || 0) - (a.priceUSD || 0)); break;
      case 'price_low': arr.sort((a, b) => (a.priceUSD || 0) - (b.priceUSD || 0)); break;
      case 'name': arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'newest': arr.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime()); break;
    }
    return arr;
  })();


  const totalProducts = products.length;
  const inStockProducts = products.filter(p => getEffectiveStock(p) > 0).length;
  const outOfStockProducts = products.filter(p => getEffectiveStock(p) <= 0).length;
  const lowStockProducts = products.filter(p => {
    const stock = getEffectiveStock(p);
    const threshold = p.initialStock && p.initialStock > 0 ? p.initialStock : 5;
    return stock > 0 && stock <= threshold;
  }).length;
  const comingSoonProducts = products.filter(p => p.status === 'coming_soon').length;
  const onTheWayProducts = products.filter(p => p.status === 'on_the_way').length;

  // Inventory value: money sitting in stock (qty × cost / × price). Products currently shared
  // with a partner (extra_data.coAdminIds non-empty) belong to the partner, so they're excluded
  // from the owner's inventory money — consistent with the analytics/revenue surfaces. Un-sharing
  // brings them back here. (Counts above still include them, since they remain in the catalog.)
  const ownerStock = products.filter(p => !(Array.isArray((p as any).coAdminIds) && (p as any).coAdminIds.length));
  const invAtCost = ownerStock.reduce((s, p) => s + costUSD(p as any, exchangeRateIQD) * getEffectiveStock(p), 0);
  const invAtRetail = ownerStock.reduce((s, p) => s + (p.priceUSD || 0) * getEffectiveStock(p), 0);
  const invProfit = invAtRetail - invAtCost;

  const renderProductItem = useCallback(({ item, index }: { item: Product; index: number }) => {
    const effectiveStock = getEffectiveStock(item);
    const initialStock = item.initialStock || 0;
    
    let stockColor = '#4CAF50';
    let statusText = t('admin.products.stats.inStock');

    if (effectiveStock <= 0) {
      stockColor = '#F44336';
      statusText = t('admin.products.stats.outOfStock');
    } else if (effectiveStock <= (initialStock > 0 ? initialStock : 5)) {
      stockColor = '#FF9800';
      statusText = t('admin.products.stats.lowStock');
    }

    const stockStatus = statusText;
    const luxuryCardBg = isDark ? theme.colors.surface : '#FFFFFF';
    // Global auto-RTL is off (App.tsx), so mirror this row off the active language.
    const cardIsRTL = i18n.language === 'ar' || i18n.language === 'ku';

    // Money line + pending-status chip (computed once per card).
    const cost = costUSD(item as any, exchangeRateIQD);
    const profit = (item.priceUSD || 0) - cost;
    const belowCost = cost > 0 && (item.priceUSD || 0) <= cost;
    const isPending = item.status === 'coming_soon' || item.status === 'on_the_way';
    const pendingColor = item.status === 'coming_soon' ? '#9C27B0' : '#06b6d4';
    const pendingLabel = item.status === 'coming_soon'
      ? t('admin.products.stats.comingSoon', { defaultValue: 'Coming Soon' })
      : t('admin.products.stats.onTheWay', { defaultValue: 'On the Way' });
    const pendingIcon = item.status === 'coming_soon' ? 'time' : 'airplane';
    const allVars = [...((item as any).variations || []), ...((item as any).colorVariations || [])];
    const soldOutVars = allVars.filter((v: any) => (v.stockQuantity || 0) <= 0).length;

    // ===== REORDER MODE CARD =====
    if (reorderMode) {
      const listData = reorderedProducts;
      const realIndex = listData.findIndex(p => p.id === item.id);
      const isFirst = realIndex === 0;
      const isLast = realIndex === listData.length - 1;

      return (
        <View style={[styles.productCard, {
          flexDirection: cardIsRTL ? 'row-reverse' : 'row',
          backgroundColor: luxuryCardBg, borderRadius: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
        }]}>
          {/* Position Number */}
          <View style={{
            width: 32, height: 32, borderRadius: 10,
            backgroundColor: theme.colors.primary + '18',
            alignItems: 'center', justifyContent: 'center',
            marginRight: cardIsRTL ? 0 : 8, marginLeft: cardIsRTL ? 8 : 0,
          }}>
            <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '700', color: theme.colors.primary }}>
              {realIndex + 1}
            </Text>
          </View>

          {/* Image */}
          <View style={[styles.productImageContainer, {
            backgroundColor: isDark ? theme.colors.background : '#F5F5F7',
            borderRadius: 12, minWidth: 50, minHeight: 50,
          }]}>
            {item.imageUrls?.[0] ? (
              <ExpoImage source={{ uri: getThumbnailUrl(item.imageUrls[0], 200) }} style={styles.productImage} cachePolicy="memory-disk" contentFit="cover" transition={120} />
            ) : (
              <Ionicons name="cube-outline" size={24} color={theme.colors.textSecondary} />
            )}
          </View>

          {/* Name */}
          <View style={[styles.productInfo, { marginLeft: cardIsRTL ? 0 : 8, marginRight: cardIsRTL ? 8 : 0 }]}>
            <Text allowFontScaling={false} style={[styles.productName, { color: theme.colors.text, fontSize: 14, textAlign: cardIsRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {i18n.language === 'ar' && item.nameAr ? item.nameAr :
               i18n.language === 'ku' && item.nameKu ? item.nameKu :
               item.name}
            </Text>
            <Text allowFontScaling={false} style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              ${item.priceUSD?.toFixed(2)}
            </Text>
          </View>

          {/* Move Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              onPress={() => moveProduct(realIndex, 'up')}
              disabled={isFirst}
              activeOpacity={0.6}
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: isFirst ? 'transparent' : (theme.colors.primary + '14'),
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-up" size={20} color={isFirst ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)') : theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => moveProduct(realIndex, 'down')}
              disabled={isLast}
              activeOpacity={0.6}
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: isLast ? 'transparent' : (theme.colors.primary + '14'),
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-down" size={20} color={isLast ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)') : theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // ===== NORMAL MODE CARD =====
    return (
      <TouchableOpacity
        style={[styles.productCard, {
          flexDirection: cardIsRTL ? 'row-reverse' : 'row',
          backgroundColor: luxuryCardBg, borderRadius: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
          borderWidth: selectionMode && selectedIds.has(item.id) ? 2 : 0,
          borderColor: theme.colors.primary,
        }]}
        onLongPress={() => { setSelectionMode(true); setSelectedIds(prev => { const n = new Set(prev); n.add(item.id); return n; }); }}
        onPress={() => {
          if (selectionMode) { setSelectedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }); }
          else openEditModal(item);
        }}
        activeOpacity={0.7}
      >
        {selectionMode && (
          <View style={[styles.selCheck, { backgroundColor: selectedIds.has(item.id) ? theme.colors.primary : 'transparent', borderColor: selectedIds.has(item.id) ? theme.colors.primary : theme.colors.border + '99', marginRight: cardIsRTL ? 0 : 8, marginLeft: cardIsRTL ? 8 : 0 }]}>
            {selectedIds.has(item.id) && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        )}
        <View style={[styles.productImageContainer, {
          backgroundColor: isDark ? theme.colors.background : '#F5F5F7',
          borderRadius: 12,
        }]}>
          {item.imageUrls?.[0] ? (
            <ExpoImage source={{ uri: getThumbnailUrl(item.imageUrls[0], 200) }} style={styles.productImage} cachePolicy="memory-disk" contentFit="cover" transition={120} />
          ) : (
            <Ionicons name="cube-outline" size={32} color={theme.colors.textSecondary} />
          )}
        </View>

        <View style={[styles.productInfo, { marginLeft: cardIsRTL ? 0 : SPACING.md, marginRight: cardIsRTL ? SPACING.md : 0 }]}>
          <Text allowFontScaling={false} 
            style={[styles.productName, { color: theme.colors.text, textAlign: cardIsRTL ? 'right' : 'left' }]} 
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {i18n.language === 'ar' && item.nameAr ? item.nameAr :
             i18n.language === 'ku' && item.nameKu ? item.nameKu :
             item.name}
          </Text>

          <Text allowFontScaling={false}
            style={[styles.productPartNumber, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', textAlign: cardIsRTL ? 'right' : 'left' }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {item.partNumber}
          </Text>

          {(item as any).isActive === false && (
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: theme.colors.textSecondary + '22' }}>
              <Ionicons name="eye-off" size={11} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary }} numberOfLines={1}>
                {t('admin.products.form.hidden', { defaultValue: 'Hidden' })}
              </Text>
            </View>
          )}

          <View style={styles.productMeta}>
            <Text allowFontScaling={false}
              style={[styles.productPrice, { color: theme.colors.primary }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              ${item.priceUSD?.toFixed(2)}
            </Text>
            {isPending ? (
              <View style={[styles.stockBadge, { backgroundColor: pendingColor + '18', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                <Ionicons name={pendingIcon as any} size={11} color={pendingColor} />
                <Text allowFontScaling={false} style={[styles.stockText, { color: pendingColor }]} adjustsFontSizeToFit numberOfLines={1}>{pendingLabel}</Text>
              </View>
            ) : (
              <View style={[styles.stockBadge, { backgroundColor: stockColor + '15', borderRadius: 10 }]}>
                <Text allowFontScaling={false}
                  style={[styles.stockText, { color: stockColor }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {stockStatus} ({effectiveStock})
                </Text>
              </View>
            )}
          </View>
          {/* Money line: cost + profit (red flag when at/below cost). Hidden when no cost set. */}
          {cost > 0 && (
            <View style={styles.profitLine}>
              <Text allowFontScaling={false} style={[styles.profitText, { color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }]} numberOfLines={1}>
                {t('admin.products.cost', { defaultValue: 'Cost' })} ${cost.toFixed(2)}
              </Text>
              <Text allowFontScaling={false} style={[styles.profitText, { color: belowCost ? '#DC2626' : '#059669', fontWeight: '700' }]} numberOfLines={1}>
                {belowCost ? `⚠ ${t('admin.products.belowCost', { defaultValue: 'Below cost' })}` : `+$${profit.toFixed(2)}`}
              </Text>
            </View>
          )}
          {/* Per-variation stock: flag sold-out sizes/colors hidden behind the total. */}
          {allVars.length > 0 && soldOutVars > 0 && (
            <Text allowFontScaling={false} style={[styles.profitText, { color: '#DC2626', marginTop: 3 }]} numberOfLines={1}>
              {t('admin.products.variantsSoldOut', { count: soldOutVars, defaultValue: `${soldOutVars} variant(s) sold out` })}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12 }]}
          onPress={() => openProductActions(item)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [theme, isDark, i18n.language, t, openEditModal, openProductActions, reorderMode, reorderedProducts, moveProduct, selectionMode, selectedIds]);

  // Memoize ListHeader to prevent re-creation on render (fixes keyboard dismissal)
  // ListHeader now only contains stats - Search is moved outside to fix keyboard focus
  const luxuryStatBg = isDark ? theme.colors.surface : '#FFFFFF';

  const ListHeader = useCallback(() => (
    <View>
      <Animated.ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        entering={FadeInDown.delay(100).duration(400)} 
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {[
          { key: 'all' as FilterStatus, icon: 'cube' as const, color: theme.colors.primary, count: totalProducts, label: t('admin.products.stats.total') },
          { key: 'in_stock' as FilterStatus, icon: 'checkmark-circle' as const, color: '#4CAF50', count: inStockProducts, label: t('admin.products.stats.inStock') },
          { key: 'out_of_stock' as FilterStatus, icon: 'close-circle' as const, color: '#F44336', count: outOfStockProducts, label: t('admin.products.stats.outOfStock') },
          { key: 'low_stock' as FilterStatus, icon: 'alert-circle' as const, color: '#FF9800', count: lowStockProducts, label: t('admin.products.stats.lowStock') },
          { key: 'coming_soon' as FilterStatus, icon: 'time' as const, color: '#9C27B0', count: comingSoonProducts, label: t('admin.products.stats.comingSoon', { defaultValue: 'Coming Soon' }) },
          { key: 'on_the_way' as FilterStatus, icon: 'airplane' as const, color: '#2196F3', count: onTheWayProducts, label: t('admin.products.stats.onTheWay', { defaultValue: 'On the Way' }) },
        ].map((stat) => (
          <TouchableOpacity
            key={stat.key}
            style={[
              {
                width: 90,
                alignItems: 'center',
                paddingHorizontal: 4,
                paddingVertical: 12,
                backgroundColor: luxuryStatBg,
                borderRadius: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDark ? 0 : 0.06,
                shadowRadius: 8,
                elevation: 2,
              },
              filterStatus === stat.key && { borderColor: stat.color, borderWidth: 2 }
            ]}
            onPress={() => setFilterStatus(stat.key)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 28, height: 28, borderRadius: 8,
              backgroundColor: stat.color + '14',
              justifyContent: 'center', alignItems: 'center', marginBottom: 6,
            }}>
              <Ionicons name={stat.icon} size={14} color={stat.color} />
            </View>
            <Text allowFontScaling={false}
              style={[styles.statValue, { color: theme.colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {stat.count}
            </Text>
            <Text allowFontScaling={false}
              style={[styles.statLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', textAlign: 'center', lineHeight: 12 }]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {stat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.ScrollView>
      {/* Inventory value: money sitting in stock (scrolls with the header) */}
      <View style={[styles.invStrip, { backgroundColor: luxuryStatBg }]}>
        <View style={styles.invItem}>
          <Text allowFontScaling={false} style={[styles.invValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>${Math.round(invAtCost).toLocaleString()}</Text>
          <Text allowFontScaling={false} style={[styles.invLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]} numberOfLines={1}>{t('admin.products.invAtCost', { defaultValue: 'Stock at cost' })}</Text>
        </View>
        <View style={[styles.invDivider, { backgroundColor: theme.colors.border + '60' }]} />
        <View style={styles.invItem}>
          <Text allowFontScaling={false} style={[styles.invValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>${Math.round(invAtRetail).toLocaleString()}</Text>
          <Text allowFontScaling={false} style={[styles.invLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]} numberOfLines={1}>{t('admin.products.invAtRetail', { defaultValue: 'Retail value' })}</Text>
        </View>
        <View style={[styles.invDivider, { backgroundColor: theme.colors.border + '60' }]} />
        <View style={styles.invItem}>
          <Text allowFontScaling={false} style={[styles.invValue, { color: '#059669' }]} numberOfLines={1} adjustsFontSizeToFit>${Math.round(invProfit).toLocaleString()}</Text>
          <Text allowFontScaling={false} style={[styles.invLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]} numberOfLines={1}>{t('admin.products.invProfit', { defaultValue: 'Potential profit' })}</Text>
        </View>
      </View>
    </View>
  ), [theme, isDark, t, totalProducts, inStockProducts, outOfStockProducts, lowStockProducts, comingSoonProducts, onTheWayProducts, filterStatus, luxuryStatBg, invAtCost, invAtRetail, invProfit]);

  const pageBg = isDark ? theme.colors.background : '#F5F5F7';

  if (!tenantId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.tenantGate}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false} 
            style={[styles.tenantGateText, { color: theme.colors.text }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('admin.products.loadingTenant', { defaultValue: 'Loading business data...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false} 
            style={[styles.loadingText, { color: theme.colors.text }]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('admin.products.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';

  // The category field shows a TRANSLATED label. Typing into it used to write that label
  // back into `category`, so an admin working in Arabic renamed the product's category to
  // its Arabic label and the product dropped out of that category for every shopper.
  // A known/managed category is therefore read-only here — only the picker can change it.
  const managedCategory = managedCategories.find(c => c.name === formData.category);
  const isKnownCategory = !!managedCategory || !!CATEGORY_TRANSLATION_KEYS[formData.category];
  const categoryLabel = CATEGORY_TRANSLATION_KEYS[formData.category]
    ? t(CATEGORY_TRANSLATION_KEYS[formData.category])
    : managedCategory
      ? ((i18n.language === 'ar' && managedCategory.nameAr) ? managedCategory.nameAr
        : (i18n.language === 'ku' && managedCategory.nameKu) ? managedCategory.nameKu : managedCategory.name)
      : formData.category;

  // Price is only required for `available` products (see handleSave) — the button used to
  // demand one for every status, so a "Coming soon" product could never be saved.
  const canSubmitForm = !!formData.name.trim() && !!formData.partNumber.trim()
    && (formData.status !== 'available' || !!formData.priceUSD.trim() || !!(formData.priceIQD || '').trim());



  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Search Section / Reorder Header */}
      <View style={[styles.searchSection, { paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44) }]}>
        {reorderMode ? (
          /* ===== REORDER MODE HEADER ===== */
          <>
            <TouchableOpacity
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                borderRadius: 14, paddingVertical: 12, marginRight: 8,
              }}
              onPress={exitReorderMode}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
              <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600', marginLeft: 6 }}>
                {t('admin.common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 12,
                opacity: savingOrder ? 0.6 : 1,
              }}
              onPress={saveReorder}
              disabled={savingOrder}
              activeOpacity={0.8}
            >
              {savingOrder ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 6 }}>
                    {t('admin.common.save')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          /* ===== NORMAL SEARCH HEADER ===== */
          <>
            <View style={[styles.searchContainer, {
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              borderRadius: 14, shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
            }]}>
              <Ionicons name="search" size={20} color={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'} />
              <TextInput allowFontScaling={false}                style={[styles.searchInput, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
                placeholder={t('admin.products.searchPlaceholder')}
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                multiline={false}
                scrollEnabled={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear', { defaultValue: 'Clear' })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'} />
                </TouchableOpacity>
              )}
            </View>

            {/* Sort Button */}
            <TouchableOpacity
              style={[styles.addButton, {
                backgroundColor: sortMode !== 'default' ? theme.colors.primary : (isDark ? theme.colors.surface : '#FFFFFF'),
                borderRadius: 14, marginRight: 8,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
              }]}
              onPress={() => setSortSheetOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="funnel-outline" size={18} color={sortMode !== 'default' ? '#fff' : theme.colors.primary} />
            </TouchableOpacity>

            {/* Reorder Button */}
            <TouchableOpacity
              style={[styles.addButton, {
                backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                borderRadius: 14, marginRight: 8,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
              }]}
              onPress={enterReorderMode}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-vertical" size={18} color={theme.colors.primary} />
            </TouchableOpacity>

            {/* Add Button */}
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.colors.primary, borderRadius: 12 }]}
              onPress={openAddModal}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <FlashList
        ref={listRef}
        data={reorderMode ? reorderedProducts : sortedProducts}
        keyExtractor={(item) => `${tenantId}-${item.id}`}
        renderItem={renderProductItem}
        extraData={reorderMode ? reorderedProducts : undefined}
        contentContainerStyle={{ paddingBottom: ADMIN_TAB_HEIGHT + insets.bottom + SPACING.xl }}
        ListHeaderComponent={reorderMode ? null : ListHeader}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <View style={{
                width: 72, height: 72, borderRadius: 20,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                justifyContent: 'center', alignItems: 'center', marginBottom: 16,
              }}>
                <Ionicons name={searchQuery ? 'search' : 'cube-outline'} size={36} color={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'} />
              </View>
              <Text allowFontScaling={false} 
                style={[styles.emptyText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }]}
                adjustsFontSizeToFit
                numberOfLines={2}
              >
                {searchQuery ? t('admin.products.noSearchResults') : t('admin.products.noProducts')}
              </Text>
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={reorderMode ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setShowScrollHint(y > 200);
        }}
      />

      {showScrollHint && !modalVisible && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => listRef.current?.scrollToIndex({ index: 0, animated: true })}
          style={{
            position: 'absolute',
            bottom: ADMIN_TAB_HEIGHT + insets.bottom + 20,
            right: 20,
            backgroundColor: theme.colors.primary,
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 5,
            zIndex: 100,
          }}
        >
          <Ionicons name="chevron-up" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Bulk action bar — multi-select mode (long-press a product card to enter) */}
      {selectionMode && (
        <View style={[styles.bulkBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '50', bottom: ADMIN_TAB_HEIGHT + insets.bottom + 12 }]}>
          <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.bulkCount, { color: theme.colors.text }]} numberOfLines={1}>{t('admin.products.selectedCount', { count: selectedIds.size, defaultValue: `${selectedIds.size} selected` })}</Text>
          <View style={{ flex: 1 }} />
          {bulkBusy ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: '#4CAF50', opacity: selectedIds.size ? 1 : 0.5 }]} disabled={!selectedIds.size} onPress={() => bulkSetStatus('available' as ProductStatus)}>
                <Ionicons name="checkmark-circle" size={15} color="#fff" />
                <Text allowFontScaling={false} style={styles.bulkBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('admin.products.status.available', { defaultValue: 'Available' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bulkBtnIcon, { backgroundColor: '#EF4444', opacity: selectedIds.size ? 1 : 0.5 }]} disabled={!selectedIds.size} onPress={bulkDelete}>
                <Ionicons name="trash" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Sort sheet */}
      <Modal visible={sortSheetOpen} transparent animationType="slide" onRequestClose={() => setSortSheetOpen(false)}>
        <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={() => setSortSheetOpen(false)}>
          <TouchableOpacity style={[styles.sortSheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 12 }]} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sortHandle} />
            <Text allowFontScaling={false} style={[styles.sortTitle, { color: theme.colors.text }]}>{t('admin.products.sortBy', { defaultValue: 'Sort by' })}</Text>
            {([
              { key: 'default', label: t('admin.products.sortDefault', { defaultValue: 'Default order' }), icon: 'list' },
              { key: 'stock_low', label: t('admin.products.sortStockLow', { defaultValue: 'Lowest stock first' }), icon: 'trending-down' },
              { key: 'price_high', label: t('admin.products.sortPriceHigh', { defaultValue: 'Price: high to low' }), icon: 'arrow-down' },
              { key: 'price_low', label: t('admin.products.sortPriceLow', { defaultValue: 'Price: low to high' }), icon: 'arrow-up' },
              { key: 'name', label: t('admin.products.sortName', { defaultValue: 'Name (A to Z)' }), icon: 'text' },
              { key: 'newest', label: t('admin.products.sortNewest', { defaultValue: 'Recently added' }), icon: 'time' },
            ] as { key: SortMode; label: string; icon: any }[]).map(opt => (
              <TouchableOpacity key={opt.key} style={styles.sortRow} onPress={() => { setSortMode(opt.key); setSortSheetOpen(false); }} activeOpacity={0.7}>
                <Ionicons name={opt.icon} size={18} color={sortMode === opt.key ? theme.colors.primary : theme.colors.textSecondary} />
                <Text allowFontScaling={false} style={[styles.sortRowText, { color: sortMode === opt.key ? theme.colors.primary : theme.colors.text, fontWeight: sortMode === opt.key ? '700' : '500' }]}>{opt.label}</Text>
                {sortMode === opt.key && <Ionicons name="checkmark" size={18} color={theme.colors.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ✅ ONE Modal ONLY (fixed) */}
      <Modal
        visible={modalVisible}
        transparent={false}
        animationType="none"
        onRequestClose={closeFormModal}
      >
        <View style={[styles.modalContainer, { backgroundColor: pageBg, paddingTop: insets.top }]}>
          {/* Luxury Modal Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, minHeight: 56,
          }}>
            <Text allowFontScaling={false} style={{
              fontSize: 22, fontWeight: '700', color: theme.colors.text,
              letterSpacing: -0.3,
            }}
              adjustsFontSizeToFit numberOfLines={1}
            >
              {editingProduct ? t('admin.products.editProduct') : t('admin.products.addProduct')}
            </Text>
            <TouchableOpacity
              // Blocked while work is in flight: closing mid-save/mid-upload is what
              // let a completion land on the next product the admin opened.
              onPress={closeFormModal}
              disabled={saving || uploadingImage || uploadingVideo}
              accessibilityState={{ disabled: saving || uploadingImage || uploadingVideo }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                justifyContent: 'center', alignItems: 'center',
              }}
            >
              <Ionicons name="close" size={22} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} />
            </TouchableOpacity>
          </View>

          {/* Jump bar. Horizontal, so it is the one scroller allowed to sit beside
              the vertical one — the rule is one VERTICAL scroll owner. */}
          <View style={{ paddingBottom: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 8, flexDirection: isRTL ? 'row-reverse' : 'row' }}
            >
              {FORM_SECTIONS.map((sec) => (
                <TouchableOpacity
                  key={sec.key}
                  onPress={() => jumpToSection(sec.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 14,
                    minHeight: 34,
                    justifyContent: 'center',
                    borderRadius: 17,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  }}
                >
                  <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary }}>
                    {sec.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Delayed mount workaround for RN 0.81.x old-arch Modal ScrollView regression */}
          {modalReady ? (
          <KeyboardAwareScrollView
            ref={formScrollRef}
            enableOnAndroid
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            extraScrollHeight={20}
            showsVerticalScrollIndicator={false}
            style={styles.formScroll}
            contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: SPACING.md }}
            // @ts-expect-error renderScrollComponent exists but types are incomplete
            renderScrollComponent={(props: object) => <GHScrollView {...props} />}
          >
              {/* MEDIA SECTION CARD */}
              <View onLayout={onSectionLayout('media')} style={[styles.formSectionCard, {
                backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                borderRadius: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDark ? 0 : 0.06,
                shadowRadius: 8,
                elevation: 2,
              }]}>
                <Text allowFontScaling={false} 
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.media')}
                </Text>

                <Text allowFontScaling={false} 
                  style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.imagesLabel', { count: imageUrls.length })}
                </Text>

                {/* Reorder hint */}
                {imageUrls.length > 1 && reorderingIndex === null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
                    <Ionicons name="swap-horizontal" size={14} color={theme.colors.textSecondary} />
                    <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginLeft: 4, fontStyle: 'italic' }}>
                      {t('admin.products.form.holdToReorder', { defaultValue: 'Hold an image to reorder' })}
                    </Text>
                  </View>
                )}
                {reorderingIndex !== null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4, backgroundColor: theme.colors.primary + '15', paddingVertical: 6, borderRadius: 8 }}>
                    <Ionicons name="move" size={14} color={theme.colors.primary} />
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.primary, marginLeft: 6, fontWeight: '600' }}>
                      {t('admin.products.form.tapToPlace', { defaultValue: 'Tap where you want to place it' })}
                    </Text>
                    <TouchableOpacity onPress={() => setReorderingIndex(null)} style={{ marginLeft: 'auto', paddingHorizontal: 8 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.error || '#F44336', fontWeight: '600' }}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.imageSection}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {imageUrls.map((url, index) => {
                      const isSelected = reorderingIndex === index;
                      const isDropTarget = reorderingIndex !== null && reorderingIndex !== index;

                      return (
                        <TouchableOpacity
                          key={`${url}-${index}`}
                          activeOpacity={0.8}
                          onLongPress={() => {
                            if (imageUrls.length > 1) {
                              setReorderingIndex(index);
                            }
                          }}
                          onPress={() => {
                            if (reorderingIndex !== null && reorderingIndex !== index) {
                              LayoutAnimation.configureNext(LayoutAnimation.create(
                                250,
                                LayoutAnimation.Types.easeInEaseOut,
                                LayoutAnimation.Properties.opacity
                              ));
                              handleMoveImage(reorderingIndex, index);
                              setReorderingIndex(null);
                            }
                          }}
                          delayLongPress={300}
                          style={[
                            styles.imagePreviewContainer,
                            isSelected && {
                              transform: [{ scale: 1.08 }],
                              zIndex: 100,
                              borderWidth: 2,
                              borderColor: theme.colors.primary,
                              shadowColor: theme.colors.primary,
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.35,
                              shadowRadius: 12,
                              elevation: 12,
                            },
                            isDropTarget && {
                              opacity: 0.65,
                              borderWidth: 2,
                              borderColor: theme.colors.primary + '60',
                              borderStyle: 'dashed',
                            },
                          ]}
                        >
                          <Image source={{ uri: url }} style={styles.imagePreview} />
                          {/* Position badge */}
                          <View style={{
                            position: 'absolute', top: 6, left: 6,
                            backgroundColor: index === 0 ? theme.colors.primary : 'rgba(0,0,0,0.55)',
                            paddingHorizontal: 6, paddingVertical: 2,
                            borderRadius: 6, zIndex: 10,
                          }}>
                            <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                              {index === 0 ? t('admin.products.form.main', { defaultValue: 'MAIN' }) : `${index + 1}`}
                            </Text>
                          </View>
                          {/* Selected glow indicator */}
                          {isSelected && (
                            <View style={{
                              position: 'absolute', bottom: 6, left: 0, right: 0,
                              alignItems: 'center',
                            }}>
                              <View style={{
                                backgroundColor: theme.colors.primary,
                                paddingHorizontal: 8, paddingVertical: 3,
                                borderRadius: 8,
                              }}>
                                <Ionicons name="move" size={14} color="#fff" />
                              </View>
                            </View>
                          )}
                          {/* Drop target indicator */}
                          {isDropTarget && (
                            <View style={{
                              ...StyleSheet.absoluteFillObject,
                              justifyContent: 'center', alignItems: 'center',
                              backgroundColor: theme.colors.primary + '10',
                              borderRadius: 12,
                            }}>
                              <Ionicons name="arrow-down-circle" size={28} color={theme.colors.primary + '80'} />
                            </View>
                          )}
                          {/* Delete button - only show when not reordering */}
                          {reorderingIndex === null && (
                            <TouchableOpacity
                              style={[styles.removeImageButton, { backgroundColor: theme.colors.error || '#F44336' }]}
                              onPress={() => handleRemoveImage(index)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="close" size={14} color={theme.colors.surface} />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {imageUrls.length < 5 && reorderingIndex === null && (
                      <TouchableOpacity
                        style={[styles.addImageButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                        onPress={handleAddImage}
                        disabled={uploadingImage}
                        activeOpacity={0.7}
                      >
                        {uploadingImage ? (
                          <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : (
                          <>
                            <Ionicons name="camera" size={24} color={theme.colors.textSecondary} />
                            <Text allowFontScaling={false} 
                              style={[styles.addImageText, { color: theme.colors.textSecondary }]}
                              adjustsFontSizeToFit
                              numberOfLines={1}
                            >
                              {t('admin.products.form.add')}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>

                {/* VIDEO SECTION: One optional video per product */}
                <Text allowFontScaling={false} 
                  style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: SPACING.md }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.videoOptional')}
                </Text>
                <View style={{ marginTop: 8 }}>
                  {videoUrl || videoUri ? (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      // eslint-disable-next-line react-native/no-color-literals, react-native/no-inline-styles
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 12,
                      padding: 12,
                      width: '100%',
                      justifyContent: 'space-between'
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          backgroundColor: theme.colors.primary + '15',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12
                        }}>
                          <Ionicons name="videocam" size={24} color={theme.colors.primary} />
                        </View>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 }}>
                            {t('admin.products.form.videoAdded', { defaultValue: 'Video Added' })}
                          </Text>
                          <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 13 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                            {videoUri ? t('admin.products.form.readyToUpload', { defaultValue: 'Will upload on save' }) : t('admin.products.form.uploaded', { defaultValue: 'Uploaded successfully' })}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={handleRemoveVideo}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: (theme.colors.error || '#F44336') + '15',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error || '#F44336'} />
                      </TouchableOpacity>
                    </View>
                  ) : uploadingVideo ? (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      // eslint-disable-next-line react-native/no-color-literals, react-native/no-inline-styles
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 12,
                      padding: 16,
                      width: '100%'
                    }}>
                      <ActivityIndicator color={theme.colors.primary} size="small" style={{ marginRight: 8 }} />
                      <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 15, fontWeight: '500' }}>
                        {t('admin.products.form.uploadingVideo', { defaultValue: 'Uploading...' })} {videoUploadProgress}%
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isDark ? theme.colors.primary + '15' : theme.colors.primary + '10',
                        borderWidth: 1,
                        borderColor: theme.colors.primary + '30',
                        borderStyle: 'dashed',
                        borderRadius: 12,
                        padding: 16,
                        width: '100%'
                      }}
                      onPress={handleAddVideo}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="videocam-outline" size={24} color={theme.colors.primary} style={{ marginRight: 8 }} />
                      <Text allowFontScaling={false} style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '600' }}>
                        {t('admin.products.form.addVideo')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* BASIC INFO CARD */}
              <View onLayout={onSectionLayout('basic')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <Text allowFontScaling={false} 
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.basicInfo')}
                </Text>

                {/* Name */}
                <Text allowFontScaling={false} 
                  style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.name')}
                </Text>
                <TextInput allowFontScaling={false}                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                  value={formData.name}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                  placeholder={t('admin.products.form.namePlaceholder')}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline={false}
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                />

                {/* One tap fills the rest of this form from the name above. */}
                <TouchableOpacity
                  onPress={handleAiFill}
                  disabled={aiFilling}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 10,
                    minHeight: 46,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + '55',
                    backgroundColor: theme.colors.primary + '12',
                    opacity: aiFilling ? 0.6 : 1,
                  }}
                >
                  {aiFilling ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={17} color={theme.colors.primary} />
                  )}
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 14 }}
                  >
                    {aiFilling
                      ? t('admin.products.form.aiFilling', { defaultValue: 'Filling in\u2026' })
                      : t('admin.products.form.aiFill', { defaultValue: 'Fill in the rest with AI' })}
                  </Text>
                </TouchableOpacity>

                {/* Name Arabic */}
                <Text allowFontScaling={false} 
                  style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.nameAr')}
                </Text>
                <TextInput allowFontScaling={false}                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'right' }]}
                  value={formData.nameAr}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, nameAr: text }))}
                  placeholder={t('admin.products.form.nameArPlaceholder')}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline={false}
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                />

                {/* Name Kurdish */}
                <Text allowFontScaling={false} 
                  style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.nameKu')}
                </Text>
                <TextInput allowFontScaling={false}                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'right' }]}
                  value={formData.nameKu}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, nameKu: text }))}
                  placeholder={t('admin.products.form.nameKuPlaceholder')}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline={false}
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                />

                {/* Part Number */}
                <Text allowFontScaling={false} 
                  style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.partNumber')}
                </Text>
                <TextInput allowFontScaling={false}                  style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                  value={formData.partNumber}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, partNumber: text }))}
                  placeholder={t('admin.products.form.partNumberPlaceholder')}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline={false}
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                />

                {/* Category and Brand */}
                <View style={styles.rowInputs}>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.category')}
                    </Text>
                    <View style={[styles.input, { backgroundColor: theme.colors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 0, paddingHorizontal: 0 }]}>
                      {isKnownCategory ? (
                        // Display-only: the label is translated, so editing it would corrupt
                        // the stored English category name (see isKnownCategory above).
                        <TouchableOpacity
                          style={{ flex: 1, paddingHorizontal: 12, height: '100%', justifyContent: 'center' }}
                          onPress={() => setCategoryPickerVisible(true)}
                          activeOpacity={0.7}
                        >
                          <Text allowFontScaling={false}
                            style={{ fontSize: 15, color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }}
                            numberOfLines={1}
                          >
                            {categoryLabel}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TextInput allowFontScaling={false}                        style={{ flex: 1, paddingHorizontal: 12, height: '100%', color: theme.colors.text }}
                          value={formData.category}
                          // Clear the translations too: keeping the old categoryAr/categoryKu
                          // would leave the product filed under the previous category in AR/KU.
                          onChangeText={(text) => setFormData(prev => ({ ...prev, category: text, categoryAr: '', categoryKu: '' }))}
                          placeholder={t('admin.products.form.selectOrType')}
                          placeholderTextColor={theme.colors.textSecondary}
                        />
                      )}
                      <TouchableOpacity
                        onPress={() => setCategoryPickerVisible(true)}
                        style={{ padding: 12 }}
                      >
                        <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.brand')}
                    </Text>
                    {/* Brand is a PICKER, like Category beside it. It used to be a
                        bare text box with a row of chips underneath: the shop had to
                        know its own brand list by heart, and any typo silently created
                        a new brand ("Sumsung"), splitting a real brand's products in
                        two on the storefront. */}
                    <View style={[styles.input, {
                      backgroundColor: theme.colors.background,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      paddingHorizontal: 0,
                      paddingVertical: 0,
                      overflow: 'hidden',
                    }]}>
                      <TouchableOpacity
                        onPress={() => { setBrandSearch(''); setBrandPickerVisible(true); }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        style={{ flex: 1, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 }}
                      >
                        {(() => {
                          const picked = brandOptions.find(b => b.name.trim().toLowerCase() === formData.brand.trim().toLowerCase());
                          if (picked?.logoUrl) {
                            return (
                              <ExpoImage
                                source={{ uri: picked.logoUrl }}
                                style={{ width: 22, height: 22, borderRadius: 5 }}
                                contentFit="contain"
                              />
                            );
                          }
                          return null;
                        })()}
                        <Text
                          allowFontScaling={false}
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            color: formData.brand ? theme.colors.text : theme.colors.textSecondary,
                            textAlign: isRTL ? 'right' : 'left',
                          }}
                        >
                          {formData.brand || t('admin.products.form.selectBrand', { defaultValue: 'Select Brand' })}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setBrandSearch(''); setBrandPickerVisible(true); }}
                        style={{ padding: 12 }}
                        accessibilityRole="button"
                      >
                        <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* PRICING & STOCK CARD */}
              <View onLayout={onSectionLayout('pricing')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <Text allowFontScaling={false} 
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.pricingAndStock')}
                </Text>

                {/* PRICES — one box each, with a $ / IQD switch.
                    This card used to carry six boxes: a dollar price and a dinar
                    price for the normal price and again for VIP, plus dollar-only
                    "was" and cost. Two boxes per price is a trap, because the
                    dinar column silently outranks the dollar one — filling both
                    looked like giving two prices when one of them was dead. Each
                    price is now ONE box that says which currency it is in. */}
                <PriceField
                  label={t('admin.products.form.price')}
                  usd={formData.priceUSD}
                  iqd={formData.priceIQD}
                  onChange={({ usd, iqd }) => setFormData(prev => ({ ...prev, priceUSD: usd, priceIQD: iqd }))}
                  exchangeRateIQD={exchangeRateIQD}
                  theme={theme}
                  hint={(() => {
                    const iqd = parseInt((formData.priceIQD || '').replace(/[^0-9]/g, ''), 10) || 0;
                    if (iqd <= 0) {
                      return t('admin.products.form.priceUSDSwitchHint', {
                        defaultValue: 'Priced in dollars: the amount customers pay follows the exchange rate. Switch to IQD for stock you bought in dinar.',
                      });
                    }
                    return t('admin.products.form.priceIQDActive', {
                      iqd: formatCurrencyIQD(iqd),
                      usd: formatCurrencyUSD(convertIQDToUSD(iqd, exchangeRateIQD)),
                      rate: exchangeRateIQD,
                      defaultValue: 'Customers see {{iqd}} exactly. In dollars it shows as {{usd}} (at the current rate of {{rate}}); the dinar price itself will not change when you edit the rate.',
                    });
                  })()}
                />

                <PriceField
                  label={t('admin.products.form.compareAtPriceAny', { defaultValue: 'Was Price' })}
                  usd={formData.compareAtPriceUSD}
                  iqd={formData.compareAtPriceIQD}
                  onChange={({ usd, iqd }) => setFormData(prev => ({ ...prev, compareAtPriceUSD: usd, compareAtPriceIQD: iqd }))}
                  exchangeRateIQD={exchangeRateIQD}
                  theme={theme}
                  hint={t('admin.products.form.compareAtHint', { defaultValue: 'Shown crossed-out to display a discount. Leave blank for none.' })}
                />

                <PriceField
                  label={t('admin.products.form.vipPriceAny', { defaultValue: 'VIP Price' })}
                  usd={formData.vipPriceUSD}
                  iqd={formData.vipPriceIQD}
                  onChange={({ usd, iqd }) => setFormData(prev => ({ ...prev, vipPriceUSD: usd, vipPriceIQD: iqd }))}
                  exchangeRateIQD={exchangeRateIQD}
                  theme={theme}
                  accentColor="#7C3AED"
                  hint={(() => {
                    const vipIqd = parseInt((formData.vipPriceIQD || '').replace(/[^0-9]/g, ''), 10) || 0;
                    const vipUsd = parseFloat(formData.vipPriceUSD) || 0;
                    const baseIqd = parseInt((formData.priceIQD || '').replace(/[^0-9]/g, ''), 10) || 0;
                    const baseUsd = parseFloat(formData.priceUSD) || 0;
                    if (vipIqd <= 0 && vipUsd <= 0) {
                      return t('admin.products.form.vipPriceHint', { defaultValue: 'Special price for VIP customers only. Leave blank for none.' });
                    }
                    // Warn rather than silently discard: getEffectiveUnitPrice
                    // refuses a VIP price that is not actually cheaper. Compare
                    // like with like — a dinar figure is always numerically
                    // larger than a dollar one, so a raw < would read backwards.
                    const vipAsUsd = vipIqd > 0 ? convertIQDToUSD(vipIqd, exchangeRateIQD) : vipUsd;
                    const baseAsUsd = baseIqd > 0 ? convertIQDToUSD(baseIqd, exchangeRateIQD) : baseUsd;
                    if (baseAsUsd > 0 && vipAsUsd >= baseAsUsd) {
                      return t('admin.products.form.vipPriceNotCheaper', {
                        vip: vipIqd > 0 ? formatCurrencyIQD(vipIqd) : formatCurrencyUSD(vipUsd),
                        defaultValue: '{{vip}} is not below this product’s normal price, so VIPs will keep paying the normal price. Lower it, or clear it.',
                      });
                    }
                    return t('admin.products.form.vipPriceActive', {
                      vip: vipIqd > 0 ? formatCurrencyIQD(vipIqd) : formatCurrencyUSD(vipUsd),
                      defaultValue: 'VIP customers pay {{vip}}.',
                    });
                  })()}
                />

                <PriceField
                  label={t('admin.products.form.purchasePriceAny', { defaultValue: 'Purchase Price (cost)' })}
                  usd={formData.purchasePrice}
                  iqd={formData.purchasePriceIQD}
                  onChange={({ usd, iqd }) => setFormData(prev => ({ ...prev, purchasePrice: usd, purchasePriceIQD: iqd }))}
                  exchangeRateIQD={exchangeRateIQD}
                  theme={theme}
                  hint={t('admin.products.form.purchasePriceHint', {
                    defaultValue: 'What YOU paid. Never shown to customers — it is what every profit figure is worked out from. Switch to IQD for stock you bought in dinar.',
                  })}
                />

                {/* Stock */}
                <View style={styles.rowInputs}>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false}
                      style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.stockQty')}
                    </Text>
                    <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.stockQty}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, stockQty: text }))}
                      placeholder="0"
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                      multiline={false}
                      scrollEnabled={false}
                      disableFullscreenUI
                    />
                  </View>
                  <View style={styles.halfInput} />
                </View>

                {/* Initial Stock (Low Stock Alert Config) & Historical Stock */}
                <View style={[styles.rowInputs, { marginTop: SPACING.md }]}>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.initialStock', { defaultValue: 'Low Stock Threshold' })}
                    </Text>
                    <TextInput allowFontScaling={false}                      style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.initialStock}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, initialStock: text }))}
                      placeholder={t('admin.products.form.initialStockPlaceholder', { defaultValue: 'e.g. 15' })}
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                      multiline={false}
                      scrollEnabled={false}
                      disableFullscreenUI
                    />
                    <Text allowFontScaling={false} style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 4, paddingLeft: 4 }}>
                      {t('admin.products.form.initialStockHint', { defaultValue: 'Alerts when stock drops to or below this number' })}
                    </Text>
                  </View>
                  
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.historicalStock', { defaultValue: 'Total Historical Stock' })}
                    </Text>
                    <TextInput allowFontScaling={false}                      style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.historicalStockQty}
                      onChangeText={(text) => {
                        // Manual override — stop the auto-calc effect from overwriting it.
                        historicalTouchedRef.current = true;
                        setFormData(prev => ({ ...prev, historicalStockQty: text }));
                      }}
                      placeholder={t('admin.products.form.historicalStockPlaceholder', { defaultValue: 'Override History' })}
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                      multiline={false}
                      scrollEnabled={false}
                      disableFullscreenUI
                    />
                    <Text allowFontScaling={false} style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 4, paddingLeft: 4 }}>
                      {t('admin.products.form.historicalStockHint', { defaultValue: 'Leave empty for auto-calc' })}
                    </Text>
                  </View>
                </View>

                {/* Wholesale Pricing */}
                <View style={styles.priceTiersSection}>
                  <View style={styles.priceTiersHeader}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.wholesalePricing')}
                    </Text>
                      <TouchableOpacity
                        style={[styles.addTierButton, { backgroundColor: theme.colors.primary + '20' }]}
                        onPress={() => {
                          const lastTier = priceTiers[priceTiers.length - 1];
                          const newMinQty = lastTier ? (lastTier.maxQty || lastTier.minQty) + 1 : 5;
                          setPriceTiers([...priceTiers, { minQty: newMinQty, priceUSD: 0, _key: newTierKey() }]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={20} color={theme.colors.primary} />
                        <Text allowFontScaling={false} 
                          style={[styles.addTierButtonText, { color: theme.colors.primary }]}
                          adjustsFontSizeToFit
                          numberOfLines={1}
                        >
                          {t('admin.products.form.addTier')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {priceTiers.length === 0 ? (
                      <Text allowFontScaling={false} 
                        style={[styles.noTiersText, { color: theme.colors.textSecondary }]}
                        adjustsFontSizeToFit
                        numberOfLines={2}
                      >
                        {t('admin.products.form.noTiers')}
                      </Text>
                  ) : (
                    <View style={styles.priceTiersList}>
                      {priceTiers.map((tier, index) => (
                        <View key={tier._key ?? index} style={[styles.priceTierRow, { backgroundColor: theme.colors.background }]}>
                          {/* ✅ all single line - no multiline */}
                          <View style={styles.tierInputGroup}>
                            <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('admin.products.form.minQty')}</Text>
                            <TextInput allowFontScaling={false}                              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text }]}
                              value={tier.minQty ? tier.minQty.toString() : ''}
                              onChangeText={(text) => {
                                setPriceTiers(prev => prev.map((tr, i) => (i === index ? { ...tr, minQty: parseInt(text) || 0 } : tr)));
                              }}
                              keyboardType="number-pad"
                              multiline={false}
                              scrollEnabled={false}
                disableFullscreenUI
                              placeholder="10"
                              placeholderTextColor={theme.colors.textSecondary}
                            />
                          </View>

                          <View style={styles.tierInputGroup}>
                            <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('admin.products.form.maxQty')}</Text>
                            <TextInput allowFontScaling={false}                              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text }]}
                              value={tier.maxQty ? tier.maxQty.toString() : ''}
                              onChangeText={(text) => {
                                setPriceTiers(prev => prev.map((tr, i) => (i === index ? { ...tr, maxQty: text ? parseInt(text) : undefined } : tr)));
                              }}
                              keyboardType="number-pad"
                              multiline={false}
                              scrollEnabled={false}
                disableFullscreenUI
                              placeholder="∞"
                              placeholderTextColor={theme.colors.textSecondary}
                            />
                          </View>

                          <View style={styles.tierInputGroup}>
                            <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('admin.products.form.priceLabel')}</Text>
                            <TextInput allowFontScaling={false}                              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text }]}
                              defaultValue={tier.priceUSD ? tier.priceUSD.toString() : ''}
                              onEndEditing={(e) => {
                                const sanitized = e.nativeEvent.text.replace(',', '.');
                                const parsed = parseFloat(sanitized);
                                setPriceTiers(prev => prev.map((tr, i) => (i === index ? { ...tr, priceUSD: isNaN(parsed) ? 0 : parsed } : tr)));
                              }}
                              keyboardType="numeric"
                              multiline={false}
                              scrollEnabled={false}
                disableFullscreenUI
                              placeholder="0.00"
                              placeholderTextColor={theme.colors.textSecondary}
                            />
                          </View>

                          <TouchableOpacity
                            style={[styles.removeTierButton, { backgroundColor: '#F44336' + '20' }]}
                            onPress={() => setPriceTiers(priceTiers.filter((_, i) => i !== index))}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={16} color="#F44336" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Status Selector */}
                <View style={{ marginBottom: SPACING.md }}>
                  <Text allowFontScaling={false} 
                    style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                  >
                    {t('admin.products.form.status', { defaultValue: 'Availability Status' })}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {(['available', 'on_the_way', 'coming_soon'] as const).map((statusOption) => {
                      const isSelected = formData.status === statusOption;
                      // Color coding
                      const statusColor = 
                        statusOption === 'available' ? '#4CAF50' : 
                        statusOption === 'on_the_way' ? '#2196F3' : '#FF9800';
                      
                      return (
                        <TouchableOpacity
                          key={statusOption}
                          onPress={() => setFormData(prev => ({ ...prev, status: statusOption }))}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: isSelected ? statusColor : theme.colors.border,
                            backgroundColor: isSelected ? statusColor + '15' : 'transparent', // Light tint when selected
                            marginRight: 8,
                            marginBottom: 8,
                          }}
                        >
                           <View style={{ 
                             width: 12, 
                             height: 12, 
                             borderRadius: 6, 
                             backgroundColor: isSelected ? statusColor : theme.colors.textSecondary + '40', // Dim dot if not selected
                             marginRight: 6 
                           }} />
                          <Text allowFontScaling={false} style={{ 
                            color: isSelected ? statusColor : theme.colors.textSecondary,
                            fontWeight: isSelected ? '600' : '400',
                            fontSize: 14
                          }}>
                            {t(`admin.products.status.${statusOption}`, { defaultValue: statusOption.replace(/_/g, ' ') })}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={16} color={statusColor} style={{ marginLeft: 6 }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Featured toggle (pin to the customer "featured" row) */}
              <View onLayout={onSectionLayout('featured')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setIsFeatured(v => !v)} activeOpacity={0.7}>
                  <Ionicons name={isFeatured ? 'star' : 'star-outline'} size={22} color={isFeatured ? '#F59E0B' : theme.colors.textSecondary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.text, marginBottom: 2 }]} numberOfLines={1}>{t('admin.products.form.featured', { defaultValue: 'Featured (pin to top)' })}</Text>
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary }} numberOfLines={2}>{t('admin.products.form.featuredHint', { defaultValue: 'Show this part in the featured row for customers.' })}</Text>
                  </View>
                  <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: isFeatured ? '#F59E0B' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'), alignItems: isFeatured ? 'flex-end' : 'flex-start' }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Visible / hidden toggle — hide from the storefront without deleting */}
              <View onLayout={onSectionLayout('visible')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setIsActive(v => !v)} activeOpacity={0.7}>
                  <Ionicons name={isActive ? 'eye' : 'eye-off'} size={22} color={isActive ? '#22C55E' : theme.colors.textSecondary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.text, marginBottom: 2 }]} numberOfLines={1}>{t('admin.products.form.visible', { defaultValue: 'Visible in store' })}</Text>
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary }} numberOfLines={2}>{t('admin.products.form.visibleHint', { defaultValue: 'Turn off to hide this product from customers without deleting it.' })}</Text>
                  </View>
                  <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: isActive ? '#22C55E' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'), alignItems: isActive ? 'flex-end' : 'flex-start' }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Shipping Cost */}
              <View onLayout={onSectionLayout('shipping')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <View style={{ marginBottom: SPACING.md }}>
                  <Text allowFontScaling={false} 
                    style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                  >
                    {t('admin.products.form.defaultShippingCost', { defaultValue: 'Default Shipping Cost (USD)' })}
                  </Text>
                  <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 }}>
                    {t('admin.products.form.defaultShippingHint', { defaultValue: 'Applies to any region not listed below' })}
                  </Text>
                  <View style={styles.rowInputs}>
                    <View style={[styles.halfInput, { marginRight: 0 }]}>
                      <TextInput allowFontScaling={false}                        style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                        value={formData.shippingCost}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, shippingCost: text }))}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline={false}
                        scrollEnabled={false}
                        disableFullscreenUI
                      />
                    </View>
                  </View>
                  
                </View>

                {/* Region-Based Shipping Rates (Formerly City-Based) */}
                <View style={{ marginBottom: SPACING.md }}>
                  <Text allowFontScaling={false} 
                    style={[styles.inputLabel, { color: theme.colors.textSecondary }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                  >
                    {t('admin.products.form.cityShippingRates', { defaultValue: 'Region-Based Shipping (Optional)' })}
                  </Text>
                  
                  {/* Add new region rate */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
                    <View style={{ flex: 1, marginRight: SPACING.xs }}>
                      <TextInput allowFontScaling={false}                        style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                        value={newCityName}
                        onChangeText={setNewCityName}
                        placeholder={t('admin.products.form.cityName', { defaultValue: 'Region / Country' })}
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline={false}
                        scrollEnabled={false}
                        disableFullscreenUI
                      />
                    </View>
                    <View style={{ width: 80, marginRight: SPACING.xs }}>
                      <TextInput allowFontScaling={false}                        style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                        value={newCityPrice}
                        onChangeText={setNewCityPrice}
                        placeholder="$0.00"
                        keyboardType="decimal-pad"
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline={false}
                        scrollEnabled={false}
                        disableFullscreenUI
                      />
                    </View>
                    <TouchableOpacity
                      style={{
                        backgroundColor: theme.colors.primary,
                        paddingHorizontal: SPACING.md,
                        paddingVertical: SPACING.sm,
                        borderRadius: 8,
                      }}
                      onPress={() => {
                        if (newCityName.trim()) {
                          const priceText = newCityPrice.trim();
                          const price = priceText === '' ? 0 : (parseFloat(priceText) || 0);
                          setShippingRates([...shippingRates, { city: newCityName.trim(), price }]);
                          setNewCityName('');
                          setNewCityPrice('');
                        }
                      }}
                    >
                      <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                  </View>

                  {/* List of region rates */}
                  {shippingRates.length > 0 && (
                    <View style={{ 
                      backgroundColor: theme.colors.background, 
                      borderRadius: 8, 
                      padding: SPACING.sm,
                      marginBottom: SPACING.sm,
                    }}>
                      {shippingRates.map((rate, index) => (
                        <View 
                          key={index} 
                          style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            paddingVertical: SPACING.xs,
                            borderBottomWidth: index < shippingRates.length - 1 ? 1 : 0,
                            borderBottomColor: theme.colors.border,
                          }}
                        >
                          <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>
                            {rate.city}
                          </Text>
                          {/* shipping_rates is JSONB and passes through mapProduct raw, so
                              price is whatever the writer stored. A string "5" fails
                              === 0, reaches .toFixed and throws, taking down the whole
                              edit-modal render. Coerce once. */}
                          {(() => {
                            const ratePrice = Number(rate.price) || 0;
                            return (
                              <Text allowFontScaling={false} style={{ color: ratePrice === 0 ? theme.colors.success : theme.colors.primary, fontSize: 14, fontWeight: '600', marginRight: SPACING.sm }}>
                                {ratePrice === 0 ? t('admin.products.form.free', { defaultValue: 'Free' }) : `$${ratePrice.toFixed(2)}`}
                              </Text>
                            );
                          })()}
                          <TouchableOpacity
                            onPress={() => {
                              setShippingRates(shippingRates.filter((_, i) => i !== index));
                            }}
                          >
                            <Ionicons name="close-circle" size={20} color={theme.colors.error || '#FF5252'} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  </View>

                  {/* UNIFIED APPLY TO ALL CHECKBOX */}
                  <TouchableOpacity
                    style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      paddingVertical: SPACING.sm,
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.border,
                      marginTop: SPACING.xs,
                    }}
                    onPress={() => setApplyShippingToAll(!applyShippingToAll)}
                    activeOpacity={0.7}
                  >
                    <View style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: applyShippingToAll ? theme.colors.primary : theme.colors.border,
                      backgroundColor: applyShippingToAll ? theme.colors.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: SPACING.sm,
                    }}>
                      {applyShippingToAll && (
                        <Ionicons name="checkmark" size={14} color="white" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
                        {t('admin.products.form.applyShippingSettingsToAll', { defaultValue: 'Apply shipping settings to all my products' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
              </View>

              {/* VARIATIONS (SIZE/COLOR) CARD */}
              <View onLayout={onSectionLayout('variations')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <Text allowFontScaling={false} 
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.variations')}
                </Text>

                {/* ALIBABA VARIATION: Size Variations */}
                <View style={styles.priceTiersSection}>
                  <View style={styles.priceTiersHeader}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.sizeVariations')}
                    </Text>
                    <View style={{ backgroundColor: theme.colors.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
                      <Text allowFontScaling={false} style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>
                        {t('product.total', { defaultValue: 'Total' })}: {totalSizeStock}
                      </Text>
                    </View>
                  </View>

                  {/* Quick-add common phone storage tiers */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {STORAGE_PRESETS.map((preset) => {
                      const already = variations.some(v => v.sizeValue.toLowerCase() === preset.toLowerCase());
                      return (
                        <TouchableOpacity
                          key={preset}
                          onPress={() => setNewSizeValue(preset)}
                          disabled={already}
                          activeOpacity={0.7}
                          style={{
                            paddingVertical: 5,
                            paddingHorizontal: 12,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: already ? theme.colors.border : theme.colors.primary,
                            backgroundColor: already ? 'transparent' : theme.colors.primary + '12',
                            marginRight: 6,
                            marginBottom: 6,
                            opacity: already ? 0.4 : 1,
                          }}
                        >
                          <Text allowFontScaling={false} style={{ fontSize: 12, color: already ? theme.colors.textSecondary : theme.colors.primary, fontWeight: '600' }}>
                            {preset}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Value on its own line so the label isn't cramped */}
                  <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, width: '100%', marginBottom: 10 }]}
                    value={newSizeValue}
                    onChangeText={setNewSizeValue}
                    placeholder={t('admin.products.form.sizePlaceholder')}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline={false}
                    scrollEnabled={false}
                    disableFullscreenUI
                  />
                  {/* Stock + Price + Add on the next line, each labelled + roomy */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]} numberOfLines={1}>{t('admin.products.form.stock')}</Text>
                      <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'center' }]}
                        value={newSizeStock}
                        onChangeText={setNewSizeStock}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline={false} scrollEnabled={false} disableFullscreenUI
                      />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]} numberOfLines={1}>{t('admin.products.form.priceLabel', { defaultValue: 'Price ($)' })}</Text>
                      <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'center' }]}
                        value={newSizePrice}
                        onChangeText={setNewSizePrice}
                        keyboardType="decimal-pad"
                        placeholder={t('admin.products.form.optional', { defaultValue: 'optional' })}
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline={false} scrollEnabled={false} disableFullscreenUI
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.addTierButton, { backgroundColor: theme.colors.primary + '20', minHeight: 48, paddingHorizontal: 18 }]}
                      onPress={addVariation}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={18} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.addTierButtonText, { color: theme.colors.primary }]} numberOfLines={1}>
                        {t('admin.products.form.add')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: -6, marginBottom: 10 }} numberOfLines={2}>
                    {t('admin.products.form.storageTierHint', { defaultValue: 'Value / stock / optional price. Set a price only for tiers that cost more (e.g. 512GB); blank uses the base price.' })}
                  </Text>

                  {variations.length === 0 ? (
                    <Text allowFontScaling={false} 
                      style={[styles.noTiersText, { color: theme.colors.textSecondary }]}
                      adjustsFontSizeToFit
                      numberOfLines={2}
                    >
                      {t('admin.products.form.noSizeVariations')}
                    </Text>
                  ) : (
                    <View style={styles.priceTiersList}>
                      {variations.map((variation) => (
                        <View key={variation.variationId} style={[styles.variantCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                        <View style={[styles.priceTierRow, { padding: 0 }]}>
                          <View style={styles.tierInputGroup}>
                            <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingVertical: 2, includeFontPadding: true }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('product.size', 'Size')}</Text>
                            <TextInput allowFontScaling={false}                              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text, paddingHorizontal: 0, minHeight: 48, paddingVertical: 10, minWidth: 60, textAlign: 'center', lineHeight: 22, includeFontPadding: true, fontWeight: Platform.OS === 'android' ? 'normal' : undefined }]}
                              value={variation.sizeValue.toString()}
                              onChangeText={(text) => updateVariationSize(variation.variationId, text)}
                              placeholder={t('product.size', 'Size')}
                              placeholderTextColor={theme.colors.textSecondary}
                              multiline={false}
                              scrollEnabled={false}
                  disableFullscreenUI
                            />
                          </View>
                          <View style={styles.tierInputGroup}>
                            <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingVertical: 2, includeFontPadding: true }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('product.stock', 'Stock')}</Text>
                            <TextInput allowFontScaling={false}                              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text, paddingHorizontal: 0, minHeight: 48, paddingVertical: 10, minWidth: 60, textAlign: 'center', lineHeight: 22, includeFontPadding: true, fontWeight: Platform.OS === 'android' ? 'normal' : undefined }]}
                              value={variation.stockQuantity.toString()}
                              onChangeText={(text) => updateVariationStock(variation.variationId, text)}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={theme.colors.textSecondary}
                              multiline={false}
                              scrollEnabled={false}
                  disableFullscreenUI
                            />
                          </View>
                          <TouchableOpacity
                            style={[styles.removeTierButton, { backgroundColor: '#F44336' + '20' }]}
                            onPress={() => removeVariation(variation.variationId)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={16} color="#F44336" />
                          </TouchableOpacity>
                        </View>
                        <VariantPriceBlock
                          variant={variation}
                          basePriceUSD={parseFloat(formData.priceUSD) || 0}
                          basePriceIQD={parseInt(formData.priceIQD || '0', 10) || undefined}
                          exchangeRateIQD={exchangeRateIQD}
                          onPatch={(patch) => patchVariationPrices(variation.variationId, patch)}
                          theme={theme}
                          isRTL={isRTL}
                          t={t}
                        />
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* ALIBABA VARIATION: Color Variations */}
                <View style={styles.priceTiersSection}>
                  <View style={styles.priceTiersHeader}>
                    <Text allowFontScaling={false} 
                      style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {t('admin.products.form.colorVariations')}
                    </Text>
                    <View style={{ backgroundColor: theme.colors.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
                      <Text allowFontScaling={false} style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>
                        {t('product.total', { defaultValue: 'Total' })}: {totalColorStock}
                      </Text>
                    </View>
                  </View>

                  {/* Color Picker Row */}
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    style={{ marginBottom: 12 }}
                    contentContainerStyle={{ alignItems: 'center' }}
                  >
                    {PRODUCT_COLOR_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => setNewColorKey(option.key)}
                        style={{
                          marginRight: 10,
                          padding: 2,
                          borderRadius: 20,
                          borderWidth: 2,
                          borderColor: newColorKey === option.key ? theme.colors.primary : 'transparent',
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: option.hex,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                          }}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Stock Input & Add Button */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Text allowFontScaling={false} 
                      style={{ marginRight: 8, color: theme.colors.text }}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {newColorKey ? t('admin.products.form.selectedColor', { color: newColorKey }) : t('admin.products.form.selectColorAbove')}
                    </Text>
                    
                    {newColorKey && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
                        <TextInput allowFontScaling={false}                          style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, width: 80, marginRight: 8 }]}
                          value={newColorStock}
                          onChangeText={setNewColorStock}
                          keyboardType="number-pad"
                          placeholder={t('admin.products.form.stock')}
                          placeholderTextColor={theme.colors.textSecondary}
                          multiline={false}
                          scrollEnabled={false}
                  disableFullscreenUI
                        />
                        <TouchableOpacity
                          style={[styles.addTierButton, { backgroundColor: theme.colors.primary + '20' }]}
                          onPress={() => newColorKey && addColorVariation(newColorKey)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="add" size={16} color={theme.colors.primary} />
                          <Text allowFontScaling={false} 
                            style={[styles.addTierButtonText, { color: theme.colors.primary }]}
                            adjustsFontSizeToFit
                            numberOfLines={1}
                          >
                            {t('admin.products.form.add')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {colorVariations.length === 0 ? (
                    <Text allowFontScaling={false} 
                      style={[styles.noTiersText, { color: theme.colors.textSecondary }]}
                      adjustsFontSizeToFit
                      numberOfLines={2}
                    >
                      {t('admin.products.form.noColorVariations')}
                    </Text>
                  ) : (
                    <View style={styles.priceTiersList}>
                      {colorVariations.map((variation) => (
                        <View key={variation.variationId} style={[styles.variantCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                        <View style={[styles.priceTierRow, { padding: 0 }]}>
                          <View style={styles.tierInputGroup}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 80 }}>
                              <View
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 12,
                                  backgroundColor: variation.colorHex || variation.colorValue,
                                  borderWidth: 1,
                                  borderColor: theme.colors.border,
                                  marginRight: 8,
                                }}
                              />
                              <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary, marginBottom: 0, paddingVertical: 4, textAlign: 'left', lineHeight: 18, includeFontPadding: true }, isRTL && { textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                                {variation.colorValue}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.tierInputGroup}>
                            <Text allowFontScaling={false} style={[styles.tierLabel, { color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingVertical: 2, includeFontPadding: true }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('product.stock', 'Stock')}</Text>
                            <TextInput allowFontScaling={false}                              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text, paddingHorizontal: 0, minHeight: 48, paddingVertical: 10, minWidth: 60, textAlign: 'center', lineHeight: 22, includeFontPadding: true, fontWeight: Platform.OS === 'android' ? 'normal' : undefined }]}
                              value={variation.stockQuantity.toString()}
                              onChangeText={(text: string) => updateColorVariationStock(variation.variationId, text)}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={theme.colors.textSecondary}
                              multiline={false}
                              scrollEnabled={false}
                  disableFullscreenUI
                            />
                          </View>
                          {/* Per-color image (swaps the hero when selected) */}
                          <TouchableOpacity
                            onPress={() => variation.imageUrl ? removeColorVariationImage(variation.variationId) : pickColorVariationImage(variation.variationId)}
                            activeOpacity={0.7}
                            disabled={colorImgUploadingId === variation.variationId}
                            style={{ width: 44, height: 44, borderRadius: 10, marginHorizontal: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
                          >
                            {colorImgUploadingId === variation.variationId ? (
                              <ActivityIndicator size="small" color={theme.colors.primary} />
                            ) : variation.imageUrl ? (
                              <ExpoImage source={{ uri: variation.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                            ) : (
                              <Ionicons name="camera-outline" size={18} color={theme.colors.textSecondary} />
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.removeTierButton, { backgroundColor: '#F44336' + '20' }]}
                            onPress={() => removeColorVariation(variation.variationId)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={16} color="#F44336" />
                          </TouchableOpacity>
                        </View>
                        <VariantPriceBlock
                          variant={variation}
                          basePriceUSD={parseFloat(formData.priceUSD) || 0}
                          basePriceIQD={parseInt(formData.priceIQD || '0', 10) || undefined}
                          exchangeRateIQD={exchangeRateIQD}
                          onPatch={(patch) => patchColorVariationPrices(variation.variationId, patch)}
                          theme={theme}
                          isRTL={isRTL}
                          t={t}
                        />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* SPECIFICATIONS CARD (RAM / screen / battery ...) */}
              <View onLayout={onSectionLayout('specs')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {t('admin.products.form.specifications', { defaultValue: 'Specifications' })}
                </Text>
                {/* Quick-add common spec keys */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {SPEC_PRESETS.map((preset) => {
                    const already = specEntries.some(s => s.key.toLowerCase() === preset.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => setNewSpecKey(preset)}
                        disabled={already}
                        activeOpacity={0.7}
                        style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: already ? theme.colors.border : theme.colors.primary, backgroundColor: already ? 'transparent' : theme.colors.primary + '12', marginRight: 6, marginBottom: 6, opacity: already ? 0.4 : 1 }}
                      >
                        <Text allowFontScaling={false} style={{ fontSize: 12, color: already ? theme.colors.textSecondary : theme.colors.primary, fontWeight: '600' }}>{preset}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Value suggestions for the spec being typed. Only appears for keys
                    with a small fixed answer set, so 'Cable' becomes two taps
                    instead of a typed string that varies shop-wide. */}
                {(SPEC_VALUE_SUGGESTIONS[newSpecKey.trim().toLowerCase()] || []).length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {SPEC_VALUE_SUGGESTIONS[newSpecKey.trim().toLowerCase()].map((val) => {
                      const chosen = newSpecValue.trim().toLowerCase() === val.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setNewSpecValue(val)}
                          activeOpacity={0.7}
                          style={{
                            paddingVertical: 5, paddingHorizontal: 12, borderRadius: 16,
                            borderWidth: 1,
                            borderColor: chosen ? theme.colors.primary : theme.colors.border,
                            backgroundColor: chosen ? theme.colors.primary + '15' : 'transparent',
                            marginRight: 6, marginBottom: 6,
                          }}
                        >
                          <Text allowFontScaling={false} style={{ fontSize: 12, color: chosen ? theme.colors.primary : theme.colors.textSecondary, fontWeight: chosen ? '700' : '500' }}>
                            {val}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, flex: 1, marginRight: 6 }]}
                    value={newSpecKey}
                    onChangeText={setNewSpecKey}
                    placeholder={t('admin.products.form.specName', { defaultValue: 'Spec (e.g. RAM)' })}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline={false} scrollEnabled={false} disableFullscreenUI
                  />
                  <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, flex: 1, marginRight: 6 }]}
                    value={newSpecValue}
                    onChangeText={setNewSpecValue}
                    placeholder={t('admin.products.form.specValue', { defaultValue: 'Value (e.g. 8GB)' })}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline={false} scrollEnabled={false} disableFullscreenUI
                  />
                  <TouchableOpacity style={[styles.addTierButton, { backgroundColor: theme.colors.primary + '20' }]} onPress={addSpec} activeOpacity={0.7}>
                    <Ionicons name="add" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                {specEntries.length === 0 ? (
                  <Text allowFontScaling={false} style={[styles.noTiersText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                    {t('admin.products.form.noSpecs', { defaultValue: 'No specifications added' })}
                  </Text>
                ) : (
                  <View style={styles.priceTiersList}>
                    {specEntries.map((spec) => (
                      <View key={spec.key} style={[styles.priceTierRow, { backgroundColor: theme.colors.background }]}>
                        <View style={{ width: 100, justifyContent: 'center' }}>
                          <Text allowFontScaling={false} style={{ color: theme.colors.text, fontWeight: '600', fontSize: 13, textAlign: isRTL ? 'right' : 'left' }} numberOfLines={1}>{spec.key}</Text>
                        </View>
                        <TextInput allowFontScaling={false} style={[styles.input, { flex: 1, backgroundColor: theme.colors.surface, color: theme.colors.text, minHeight: 44, paddingVertical: 8, marginHorizontal: 8 }]}
                          value={spec.value}
                          onChangeText={(text) => updateSpecValue(spec.key, text)}
                          placeholder={t('admin.products.form.specValue', { defaultValue: 'Value' })}
                          placeholderTextColor={theme.colors.textSecondary}
                          multiline={false} scrollEnabled={false} disableFullscreenUI
                        />
                        <TouchableOpacity style={[styles.removeTierButton, { backgroundColor: '#F44336' + '20' }]} onPress={() => removeSpec(spec.key)} activeOpacity={0.7}>
                          <Ionicons name="trash-outline" size={16} color="#F44336" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* DETAILS CARD (SKU / barcode / weight / warranty / dimensions) */}
              <View onLayout={onSectionLayout('details')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2 }]}>
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {t('admin.products.form.details', { defaultValue: 'Details' })}
                </Text>
                <View style={styles.rowInputs}>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]} numberOfLines={1}>{t('admin.products.form.sku', { defaultValue: 'SKU' })}</Text>
                    <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.sku}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, sku: text }))}
                      placeholder={t('admin.products.form.skuPlaceholder', { defaultValue: 'e.g. IP17PM-256-BLK' })}
                      placeholderTextColor={theme.colors.textSecondary}
                      autoCapitalize="characters" autoCorrect={false}
                      multiline={false} scrollEnabled={false} disableFullscreenUI
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]} numberOfLines={1}>{t('admin.products.form.barcode', { defaultValue: 'Barcode' })}</Text>
                    <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.barcode}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, barcode: text }))}
                      placeholder={t('admin.products.form.barcodePlaceholder', { defaultValue: 'e.g. 194253000000' })}
                      placeholderTextColor={theme.colors.textSecondary}
                      keyboardType="number-pad" autoCorrect={false}
                      multiline={false} scrollEnabled={false} disableFullscreenUI
                    />
                  </View>
                </View>
                <View style={[styles.rowInputs, { marginTop: SPACING.md }]}>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]} numberOfLines={1}>{t('admin.products.form.warranty', { defaultValue: 'Warranty' })}</Text>
                    <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.warranty}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, warranty: text }))}
                      placeholder={t('admin.products.form.warrantyPlaceholder', { defaultValue: 'e.g. 1 year' })}
                      placeholderTextColor={theme.colors.textSecondary}
                      multiline={false} scrollEnabled={false} disableFullscreenUI
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 0 }]} numberOfLines={1}>{t('admin.products.form.weight', { defaultValue: 'Weight (kg)' })}</Text>
                    <TextInput allowFontScaling={false} style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
                      value={formData.weight}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, weight: text }))}
                      placeholder="0.0"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                      multiline={false} scrollEnabled={false} disableFullscreenUI
                    />
                  </View>
                </View>
                <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: SPACING.md }]} numberOfLines={1}>{t('admin.products.form.dimensions', { defaultValue: 'Dimensions (cm) — L / W / H' })}</Text>
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <TextInput allowFontScaling={false} style={[styles.input, { flex: 1, backgroundColor: theme.colors.background, color: theme.colors.text, marginRight: 6, textAlign: 'center' }]}
                    value={formData.dimLength} onChangeText={(text) => setFormData(prev => ({ ...prev, dimLength: text }))}
                    placeholder="L" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSecondary} multiline={false} scrollEnabled={false} disableFullscreenUI />
                  <TextInput allowFontScaling={false} style={[styles.input, { flex: 1, backgroundColor: theme.colors.background, color: theme.colors.text, marginRight: 6, textAlign: 'center' }]}
                    value={formData.dimWidth} onChangeText={(text) => setFormData(prev => ({ ...prev, dimWidth: text }))}
                    placeholder="W" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSecondary} multiline={false} scrollEnabled={false} disableFullscreenUI />
                  <TextInput allowFontScaling={false} style={[styles.input, { flex: 1, backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'center' }]}
                    value={formData.dimHeight} onChangeText={(text) => setFormData(prev => ({ ...prev, dimHeight: text }))}
                    placeholder="H" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSecondary} multiline={false} scrollEnabled={false} disableFullscreenUI />
                </View>
              </View>

              {/* DESCRIPTION CARD */}
              <View onLayout={onSectionLayout('description')} style={[styles.formSectionCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2, marginBottom: 100 }]}>
                <Text allowFontScaling={false} 
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {t('admin.products.form.description')}
                </Text>
                
                <TextInput allowFontScaling={false}                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: theme.colors.background,
                      color: theme.colors.text,
                      height: undefined,
                      minHeight: 120,
                      paddingVertical: 12,
                    }
                  ]}
                  value={formData.description}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                  placeholder={t('admin.products.form.descriptionPlaceholder')}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                  textAlignVertical="top"
                />

                <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: SPACING.md }]} numberOfLines={1}>
                  {t('admin.products.form.descriptionAr', { defaultValue: 'Description (Arabic)' })}
                </Text>
                <TextInput allowFontScaling={false} style={[styles.input, styles.textArea, { backgroundColor: theme.colors.background, color: theme.colors.text, height: undefined, minHeight: 100, paddingVertical: 12, textAlign: 'right' }]}
                  value={formData.descriptionAr}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, descriptionAr: text }))}
                  placeholder={t('admin.products.form.descriptionArPlaceholder', { defaultValue: 'وصف المنتج بالعربية (اختياري)' })}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                  textAlignVertical="top"
                />

                <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: SPACING.md }]} numberOfLines={1}>
                  {t('admin.products.form.descriptionKu', { defaultValue: 'Description (Kurdish)' })}
                </Text>
                <TextInput allowFontScaling={false} style={[styles.input, styles.textArea, { backgroundColor: theme.colors.background, color: theme.colors.text, height: undefined, minHeight: 100, paddingVertical: 12, textAlign: 'right' }]}
                  value={formData.descriptionKu}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, descriptionKu: text }))}
                  placeholder={t('admin.products.form.descriptionKuPlaceholder', { defaultValue: 'وەسفی بەرهەم بە کوردی (ئارەزوومەندانە)' })}
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  scrollEnabled={false}
                  disableFullscreenUI
                  autoComplete="off"
                  textAlignVertical="top"
                />
              </View>
            </KeyboardAwareScrollView>
          ) : null}

            {/* Luxury Sticky CTA Bar */}
            <View style={{
              paddingHorizontal: 20, paddingTop: 16,
              paddingBottom: insets.bottom || 16,
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: isDark ? 0 : 0.06,
              shadowRadius: 8,
              elevation: 8,
            }}>
              {missingRequired.length > 0 && (
                <View style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                }}>
                  <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                    {t('admin.products.form.stillNeeded', { defaultValue: 'Still needed:' })}
                  </Text>
                  {missingRequired.map((m) => (
                    <TouchableOpacity
                      key={m.label}
                      onPress={() => jumpToSection(m.section)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      style={{
                        paddingHorizontal: 10,
                        minHeight: 28,
                        justifyContent: 'center',
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: '#F44336' + '55',
                        backgroundColor: '#F44336' + '12',
                      }}
                    >
                      <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#F44336' }}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={{
                  alignItems: 'center', borderRadius: 16, flexDirection: 'row',
                  justifyContent: 'center', paddingVertical: 16,
                  backgroundColor: theme.colors.primary,
                  opacity: canSubmitForm ? 1 : 0.5,
                }}
                onPress={() => handleSave()}
                disabled={saving || !canSubmitForm}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={editingProduct ? "checkmark" : "add"} size={20} color="#fff" />
                    <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 17, fontWeight: '600', marginLeft: 8 }}
                      adjustsFontSizeToFit numberOfLines={1}
                    >
                      {editingProduct ? t('admin.products.form.updateProduct') : t('admin.products.form.addProduct')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
        {/* Category Picker Modal - MUST be inside parent Modal for iOS */}
        {/* Luxury Category Picker */}
        <Modal
          visible={brandPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBrandPickerVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
            activeOpacity={1}
            onPress={() => setBrandPickerVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={{
              width: '88%', maxHeight: '75%', overflow: 'hidden',
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              borderRadius: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 10,
            }}>
              <View style={{
                flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 20, paddingVertical: 16,
                borderBottomWidth: 0.5,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              }}>
                <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3 }}
                  adjustsFontSizeToFit numberOfLines={1}
                >
                  {t('admin.products.form.selectBrand', { defaultValue: 'Select Brand' })}
                </Text>
                <TouchableOpacity
                  onPress={() => setBrandPickerVisible(false)}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                    justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <Ionicons name="close" size={18} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} />
                </TouchableOpacity>
              </View>

              {/* Search. A shop with forty brands should not scroll to find one. */}
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                <View style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 12, paddingHorizontal: 12, minHeight: 44,
                }}>
                  <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
                  <TextInput
                    allowFontScaling={false}
                    value={brandSearch}
                    onChangeText={setBrandSearch}
                    placeholder={t('admin.products.form.searchBrand', { defaultValue: 'Search brands' })}
                    placeholderTextColor={theme.colors.textSecondary}
                    style={{ flex: 1, color: theme.colors.text, paddingVertical: 10, textAlign: isRTL ? 'right' : 'left' }}
                    autoCorrect={false}
                    autoCapitalize="none"
                    multiline={false}
                    scrollEnabled={false}
                    disableFullscreenUI
                  />
                </View>
              </View>

              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Brand is optional, and the text box this replaced could be
                    select-all-deleted. The picker could only ever SET one, so a
                    generic cable mis-tagged "Samsung" — or a listing born from a
                    trade-in prefill — could not shed it without being deleted and
                    recreated. Hidden while searching, where it would compete with
                    the one-off hatch below. */}
                {brandSearch.trim().length === 0 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ selected: !formData.brand.trim() }}
                    onPress={() => {
                      setFormData(prev => ({ ...prev, brand: '' }));
                      setBrandPickerVisible(false);
                    }}
                    style={{
                      flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: 20, paddingVertical: 12,
                      borderBottomWidth: 0.5,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                      backgroundColor: !formData.brand.trim() ? theme.colors.primary + '10' : 'transparent',
                    }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 9,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}>
                      <Ionicons name="remove-outline" size={18} color={theme.colors.textSecondary} />
                    </View>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={{
                        flex: 1, fontSize: 15,
                        fontWeight: !formData.brand.trim() ? '700' : '500',
                        color: !formData.brand.trim() ? theme.colors.primary : theme.colors.text,
                        textAlign: isRTL ? 'right' : 'left',
                      }}
                    >
                      {t('admin.products.form.brandNone', { defaultValue: 'No brand' })}
                    </Text>
                    {!formData.brand.trim() && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                )}
                {filteredBrands.length === 0 ? (
                  <Text allowFontScaling={false} style={{ padding: 24, textAlign: 'center', color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                    {brandOptions.length === 0
                      ? t('admin.products.form.brandPickerEmpty', { defaultValue: 'No brands yet. Add them in Settings \u2192 Brands.' })
                      : t('admin.products.form.brandNoMatch', { defaultValue: 'No brand matches that.' })}
                  </Text>
                ) : filteredBrands.map((b) => {
                  const isSelected = formData.brand.trim().toLowerCase() === b.name.trim().toLowerCase();
                  return (
                    <TouchableOpacity
                      key={b.id || b.name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      style={{
                        flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12,
                        paddingHorizontal: 20, paddingVertical: 12,
                        borderBottomWidth: 0.5,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                        backgroundColor: isSelected ? theme.colors.primary + '10' : 'transparent',
                      }}
                      onPress={() => {
                        setFormData(prev => ({ ...prev, brand: b.name }));
                        setBrandPickerVisible(false);
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 9, overflow: 'hidden',
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      }}>
                        {b.logoUrl ? (
                          <ExpoImage source={{ uri: b.logoUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                        ) : (
                          <Text allowFontScaling={false} style={{ fontWeight: '800', fontSize: 14, color: theme.colors.textSecondary }}>
                            {b.name.trim().charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <Text
                        allowFontScaling={false}
                        numberOfLines={1}
                        style={{
                          flex: 1, fontSize: 15,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          textAlign: isRTL ? 'right' : 'left',
                        }}
                      >
                        {b.name}
                      </Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                    </TouchableOpacity>
                  );
                })}

                {/* An escape hatch, not the default. Typing a brand is how the
                    catalogue drifted, so it costs a deliberate tap and says what
                    it will do. */}
                {brandSearch.trim().length > 0 &&
                  !brandOptions.some(b => b.name.trim().toLowerCase() === brandSearch.trim().toLowerCase()) && (
                  <TouchableOpacity
                    onPress={() => {
                      setFormData(prev => ({ ...prev, brand: brandSearch.trim() }));
                      setBrandPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 20, paddingVertical: 14,
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
                    <Text allowFontScaling={false} numberOfLines={2} style={{ flex: 1, color: theme.colors.primary, fontSize: 14, textAlign: isRTL ? 'right' : 'left' }}>
                      {t('admin.products.form.brandUseTyped', {
                        name: brandSearch.trim(),
                        defaultValue: 'Use \u201C{{name}}\u201D as a one-off brand',
                      })}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={categoryPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerVisible(false)}
        >
          <TouchableOpacity 
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
            activeOpacity={1}
            onPress={() => setCategoryPickerVisible(false)}
          >
            <View style={{
              width: '88%', maxHeight: '75%', overflow: 'hidden',
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              borderRadius: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 10,
            }}>
              {/* Picker Header */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 20, paddingVertical: 16,
                borderBottomWidth: 0.5,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              }}>
                <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3 }}
                  adjustsFontSizeToFit numberOfLines={1}
                >
                  {t('admin.products.form.selectCategory')}
                </Text>
                <TouchableOpacity
                  onPress={() => setCategoryPickerVisible(false)}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                    justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <Ionicons name="close" size={18} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} />
                </TouchableOpacity>
              </View>
              {/* Picker Options */}
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {managedCategories.length === 0 ? (
                  <Text allowFontScaling={false} style={{ padding: 24, textAlign: 'center', color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                    {t('admin.categories.pickerEmpty', 'No categories yet. Add them in Settings → Categories.')}
                  </Text>
                ) : managedCategories.map((cat) => {
                  const label = (i18n.language === 'ar' && cat.nameAr) ? cat.nameAr
                    : (i18n.language === 'ku' && cat.nameKu) ? cat.nameKu : cat.name;
                  const isSelected = formData.category === cat.name;
                  return (
                    <TouchableOpacity
                      key={cat.id || cat.name}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingHorizontal: 20, paddingVertical: 12,
                        borderBottomWidth: 0.5,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                        backgroundColor: isSelected ? (theme.colors.primary + '10') : 'transparent',
                      }}
                      onPress={() => {
                        // Empty, not the English name, when the category has no
                        // translation — otherwise the stored ar/ku value is English
                        // and the customer-side fallback can never fire.
                        setFormData(prev => ({ ...prev, category: cat.name, categoryAr: cat.nameAr || '', categoryKu: cat.nameKu || '' }));
                        setCategoryPickerVisible(false);
                      }}
                      activeOpacity={0.6}
                    >
                      {cat.imageUrl
                        ? <ExpoImage source={{ uri: cat.imageUrl }} style={{ width: 32, height: 32, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" />
                        : <Ionicons name="cube-outline" size={24} color={theme.colors.textSecondary} />}
                      <Text allowFontScaling={false} style={{
                        flex: 1,
                        fontSize: 16, fontWeight: isSelected ? '600' : '400',
                        color: isSelected ? theme.colors.primary : theme.colors.text,
                      }}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      {isSelected && (
                        <View style={{
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: theme.colors.primary + '15',
                          justifyContent: 'center', alignItems: 'center',
                        }}>
                          <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Button & Actions
  addButton: { alignItems: 'center', aspectRatio: 1, borderRadius: 12, justifyContent: 'center', minHeight: 42, minWidth: 42 },
  addImageButton: { alignItems: 'center', aspectRatio: 1, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1.5, justifyContent: 'center', minHeight: 80, minWidth: 80 },
  addImageText: { fontSize: 11, marginTop: 4 },
  addTierButton: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', paddingHorizontal: SPACING.sm, paddingVertical: 6 },
  addTierButtonText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },

  // Layout
  container: { flex: 1 },
  deleteButton: { alignItems: 'center', aspectRatio: 1, borderRadius: 12, justifyContent: 'center', minHeight: 36, minWidth: 36 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 16, marginBottom: SPACING.lg, marginTop: 0 },

  // Form
  formScroll: { marginBottom: 0 },
  halfInput: { width: '48%' },
  imagePreview: { aspectRatio: 1, borderRadius: 12, height: undefined, width: 80 },
  imagePreviewContainer: { marginRight: SPACING.sm, position: 'relative' },
  imageSection: { marginBottom: SPACING.sm, marginTop: SPACING.sm },

  // Luxury Input Styling
  input: { borderRadius: 12, fontSize: 15, height: 48, includeFontPadding: false, paddingHorizontal: SPACING.md, paddingVertical: 0, textAlignVertical: 'center' },
  inputLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginBottom: 6, marginTop: SPACING.md },

  // Loading
  loadingContainer: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { fontSize: 16, marginTop: SPACING.md },

  // Modal (header/close now inline)
  modalContainer: { flex: 1 },
  noTiersText: { fontSize: 12, fontStyle: 'italic', paddingVertical: SPACING.sm, textAlign: 'center' },

  // Price Tiers & Variations
  priceTierRow: { alignItems: 'flex-end', borderRadius: 10, flexDirection: 'row', gap: 8, padding: SPACING.sm },
  variantCard: { borderRadius: 12, borderWidth: 1, padding: SPACING.sm },
  priceTiersHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  priceTiersList: { gap: SPACING.sm },
  priceTiersSection: { borderColor: 'rgba(0,0,0,0.06)', borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, marginTop: SPACING.lg, padding: SPACING.md },

  // Product Card (luxury overrides applied inline)
  productCard: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', marginBottom: 12, padding: SPACING.md },
  productImage: { height: '100%', resizeMode: 'cover', width: '100%' },
  productImageContainer: { alignItems: 'center', aspectRatio: 1, borderRadius: 12, justifyContent: 'center', minHeight: 70, minWidth: 70, overflow: 'hidden' },

  // Form Section Cards (luxury overrides applied inline)
  formSectionCard: { borderRadius: 16, marginBottom: 12, padding: SPACING.md },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: SPACING.sm, textTransform: 'uppercase' },

  // Product Info
  productInfo: { flex: 1, marginLeft: SPACING.md },
  productMeta: { alignItems: 'center', flexDirection: 'row' },
  profitLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, gap: 8 },
  profitText: { fontSize: 11.5, fontWeight: '600' },
  sortOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sortSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  sortHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: SPACING.md },
  sortTitle: { fontSize: 17, fontWeight: '700', marginBottom: SPACING.sm, marginLeft: 4 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  sortRowText: { fontSize: 15 },
  invStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  invItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  invValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  invLabel: { fontSize: 10, marginTop: 2, fontWeight: '600' },
  invDivider: { width: 1, height: 28 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepBtn: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.3, alignItems: 'center', justifyContent: 'center' },
  selCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  bulkBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, zIndex: 50, elevation: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, gap: 8 },
  bulkCount: { fontSize: 14, fontWeight: '700', marginLeft: 8 },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  bulkBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bulkBtnIcon: { width: 40, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  productPartNumber: { fontSize: 12, marginBottom: 8 },
  productPrice: { fontSize: 16, fontWeight: 'bold', marginRight: SPACING.sm },

  // Image Management
  removeImageButton: { alignItems: 'center', aspectRatio: 1, borderRadius: 10, justifyContent: 'center', minHeight: 20, minWidth: 20, position: 'absolute', right: -5, top: -5 },
  removeTierButton: { alignItems: 'center', aspectRatio: 1, borderRadius: 8, justifyContent: 'center', minHeight: 32, minWidth: 32 },

  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },

  // Search
  searchContainer: { alignItems: 'center', borderRadius: 12, flex: 1, flexDirection: 'row', marginRight: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 15, height: 38, includeFontPadding: false, marginLeft: SPACING.sm, paddingVertical: 0, textAlignVertical: 'center' },
  searchSection: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: SPACING.md },

  // Stats
  statItem: { alignItems: 'center', borderRadius: 14, flex: 1, marginHorizontal: 3, paddingHorizontal: 4, paddingVertical: 10 },
  statLabel: { fontSize: 10, marginTop: 2 },
  statValue: { fontSize: 18, fontWeight: 'bold', marginTop: 2 },
  statsRow: { flexDirection: 'row', marginBottom: SPACING.md, paddingHorizontal: 4 },

  // Stock
  stockBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  stockText: { fontSize: 10, fontWeight: '600' },

  // Tenant Gate
  tenantGate: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  tenantGateText: { fontSize: 16, marginTop: SPACING.md },

  // Text Area
  textArea: { minHeight: 100, textAlignVertical: 'top' },

  // Tier Labels
  tierInputGroup: { flex: 1 },
  tierLabel: { flexShrink: 0, fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined, fontSize: 12, fontWeight: Platform.OS === 'android' ? 'normal' : '500', includeFontPadding: true, lineHeight: Platform.OS === 'android' ? 18 : 14, marginBottom: 4 },
});

export default AdminProductsScreen;
