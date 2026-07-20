import React, { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal, BackHandler, I18nManager,
} from 'react-native';
// expo-image (memory+disk cached) instead of RN Image — RN Image re-decodes the
// thumbnail on every re-render, which is the intermittent jank on add/increase.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { COUNTRIES } from '../../constants/countries';
import { useTenant } from '../../contexts/TenantContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTenantAdminService, TenantProduct } from '../../services/tenantAdminService';
import { calculateTieredPrice } from '../../utils/pricingUtils';
import PhoneInput from '../../components/PhoneInput';
import { CountryInfo, getAllCountries } from '../../utils/phoneUtils';
import { City } from 'country-state-city';

// `manual` = admin typed a custom price; we then stop auto-recomputing it on
// VIP/qty changes. Otherwise price follows the tiered/VIP pricing for the qty.
interface VariationSel { variationId: string; label: string; priceUSD: number; stockQuantity: number; kind: 'size' | 'color'; }
interface CartLine { product: TenantProduct; quantity: number; price: number; manual?: boolean; variation?: VariationSel; }

// A product whose stock/price live in per-size or per-color variations (each its own SKU).
const hasVariations = (p: any) => !!((p?.variations?.length) || (p?.colorVariations?.length));

const money = (n: number) => `$${(n || 0).toFixed(2)}`;

// Decoupled price field: keeps the raw text the admin is typing (so "10.50",
// a lone ".", trailing zeros etc. aren't reformatted out from under the cursor).
// Only syncs from the authoritative price while NOT being edited.
const PriceInput = React.memo(function PriceInput({
  value, onChange, color, borderColor, subColor, eachLabel,
}: {
  value: number; onChange: (v: string) => void; color: string; borderColor: string; subColor: string; eachLabel: string;
}) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  return (
    <View style={styles.priceEdit}>
      <Text allowFontScaling={false} style={{ color: subColor, fontSize: 13 }}>$</Text>
      <TextInput allowFontScaling={false}
        value={text}
        onChangeText={(v) => {
          setText(v);
          onChange(v);
        }}
        onFocus={() => { editing.current = true; }}
        onBlur={() => {
          editing.current = false;
          setText(String(value));
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={[styles.priceInput, { color, borderColor }]}
      />
      <Text allowFontScaling={false} style={{ color: subColor, fontSize: 12 }}>{eachLabel}</Text>
    </View>
  );
});

// Editable quantity — tap the number and type (e.g. "12") instead of tapping + a dozen
// times. Decoupled like PriceInput so the cursor never fights the controlled value.
const QtyInput = React.memo(function QtyInput({ value, onChange, color, borderColor }: {
  value: number; onChange: (v: number) => void; color: string; borderColor: string;
}) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(String(value)); }, [value]);
  return (
    <TextInput allowFontScaling={false}
      value={text}
      onChangeText={(v) => {
        const clean = v.replace(/[^0-9]/g, '');
        setText(clean);
        const n = parseInt(clean, 10);
        if (!isNaN(n)) onChange(n);
      }}
      onFocus={() => { editing.current = true; }}
      onBlur={() => {
        editing.current = false;
        const n = parseInt(text, 10);
        const safe = isNaN(n) || n < 1 ? 1 : n;
        onChange(safe);
        setText(String(safe));
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      style={[styles.qtyInput, { color, borderColor }]}
    />
  );
});

// One cart row, memoized so deleting / editing a single line doesn't re-render
// every other line (which made deleting feel laggy with many items, worst on
// low-end Androids). Labels are passed as PRE-RESOLVED STRINGS (not the `t`
// function) so every prop is referentially stable — the only object prop is the
// theme `C`, which only changes on a theme switch. Unchanged lines keep the same
// `line` ref + `unitPrice`, so React.memo reliably skips them on delete/add.
const ReviewLine = React.memo(function ReviewLine({
  line, cartKey, unitPrice, C, fieldBg, eachLabel, removeLabel, customLabel, oversellLabel, costLabel, onSetPrice, onResetPrice, onSetQty, onSetQtyValue, onRemove,
}: {
  line: CartLine; cartKey: string; unitPrice: number; C: any; fieldBg: string;
  eachLabel: string; removeLabel: string; customLabel: string; oversellLabel: string; costLabel: string;
  onSetPrice: (id: string, v: string) => void;
  onResetPrice: (id: string) => void;
  onSetQty: (id: string, delta: number) => void;
  onSetQtyValue: (id: string, value: number) => void;
  onRemove: (id: string) => void;
}) {
  // The cart key (productId, or `${productId}__${variationId}` for a variation) — every
  // handler must use THIS, not product.id, or variation lines edit/remove the wrong entry.
  const id = cartKey;
  const cost = (line.product as any).purchasePrice;
  const hasCost = cost != null && cost > 0;
  const marginPct = hasCost && unitPrice > 0 ? Math.round(((unitPrice - cost) / unitPrice) * 100) : null;
  const marginColor = marginPct == null ? C.textSecondary : marginPct < 0 ? '#EF4444' : marginPct < 15 ? '#F59E0B' : '#10B981';
  return (
    <View style={[styles.reviewLine, { borderTopColor: C.border }]}>
      {line.product.imageUrls?.[0] ? (
        <Image source={{ uri: line.product.imageUrls[0] }} style={styles.reviewImg} />
      ) : (
        <View style={[styles.reviewImg, { backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="cube-outline" size={20} color={C.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: SPACING.sm }}>
        <Text allowFontScaling={false} style={[styles.cartName, { color: C.text }]} numberOfLines={2}>{line.product.name}</Text>
        {line.variation ? (
          <View style={[styles.variationTag, { backgroundColor: C.primary + '14' }]}>
            <Ionicons name={line.variation.kind === 'color' ? 'color-palette-outline' : 'resize-outline'} size={11} color={C.primary} />
            <Text allowFontScaling={false} style={{ color: C.primary, fontSize: 11, fontWeight: '700', marginLeft: 3 }} numberOfLines={1}>{line.variation.label}</Text>
          </View>
        ) : null}
        <View style={styles.cartLineControls}>
          <PriceInput
            value={unitPrice}
            onChange={(v) => onSetPrice(id, v)}
            color={C.text}
            borderColor={C.border}
            subColor={C.textSecondary}
            eachLabel={eachLabel}
          />
          {line.manual && (
            <TouchableOpacity onPress={() => onResetPrice(id)} style={[styles.customChip, { backgroundColor: C.primary + '15' }]} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Text allowFontScaling={false} style={[styles.customChipText, { color: C.primary }]}>{customLabel}</Text>
              <Ionicons name="refresh" size={12} color={C.primary} style={{ marginLeft: 3 }} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <View style={styles.qtyCtrl}>
            <TouchableOpacity onPress={() => onSetQty(id, -1)} style={[styles.qtyBtn, { borderColor: C.border }]}><Ionicons name="remove" size={16} color={C.text} /></TouchableOpacity>
            <QtyInput value={line.quantity} onChange={(v) => onSetQtyValue(id, v)} color={C.text} borderColor={C.border} />
            <TouchableOpacity onPress={() => onSetQty(id, 1)} style={[styles.qtyBtn, { borderColor: C.border }]}><Ionicons name="add" size={16} color={C.text} /></TouchableOpacity>
          </View>
        </View>
        {(hasCost || oversellLabel) && (
          <View style={styles.metaRow}>
            {hasCost ? (
              <Text allowFontScaling={false} style={{ color: marginColor, fontSize: 11, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                {costLabel} {money(cost)}{marginPct != null ? `  ·  ${marginPct >= 0 ? '+' : ''}${marginPct}%` : ''}
              </Text>
            ) : <View />}
            {oversellLabel ? (
              <Text allowFontScaling={false} style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700', flexShrink: 0, marginLeft: 8 }} numberOfLines={1}>⚠ {oversellLabel}</Text>
            ) : null}
          </View>
        )}
        <View style={styles.reviewLineFooter}>
          <TouchableOpacity onPress={() => onRemove(id)} style={{ flexDirection: 'row', alignItems: 'center' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={15} color={C.error} />
            <Text allowFontScaling={false} style={{ color: C.error, fontSize: 12.5, marginLeft: 4, fontWeight: '600' }}>{removeLabel}</Text>
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.cartLineTotal, { color: C.primary }]}>{money(unitPrice * line.quantity)}</Text>
        </View>
      </View>
    </View>
  );
});

// One catalog row, memoized so adding/removing an item only re-renders the row
// whose in-cart count changed — not every visible product. With expo-image's cache,
// thumbnails never re-decode on re-render. Together these kill the intermittent
// add/increase lag on the POS browse list.
const ProductRow = React.memo(function ProductRow({
  item, inCart, C, fieldBg, onAdd, t,
}: {
  item: TenantProduct; inCart: number; C: any; fieldBg: string;
  onAdd: (p: TenantProduct) => void; t: (k: string, o?: any) => string;
}) {
  const status = (item as any).status;
  const canAdd = (item as any).inStock !== false;
  // Variation products keep stock in their variations, not stock_qty — sum it for display.
  const variantProduct = hasVariations(item);
  const effStock = variantProduct
    ? ((item as any).variations || []).reduce((s: number, v: any) => s + (v.stockQuantity || 0), 0) + ((item as any).colorVariations || []).reduce((s: number, v: any) => s + (v.stockQuantity || 0), 0)
    : (item.stockQty ?? 0);
  const badgeLabel = status === 'coming_soon'
    ? t('product.comingSoon', { defaultValue: 'Coming soon' })
    : status === 'on_the_way'
      ? t('product.onTheWay', { defaultValue: 'On the way' })
      : t('admin.inStore.outOfStock', { defaultValue: 'Out of stock' });
  const badgeColor = status === 'coming_soon' || status === 'on_the_way' ? '#F59E0B' : '#E84855';
  return (
    <TouchableOpacity
      style={[styles.prodRow, { backgroundColor: C.surface }, !canAdd && { opacity: 0.6 }]}
      activeOpacity={canAdd ? 0.85 : 1}
      onPress={() => canAdd && onAdd(item)}
      disabled={!canAdd}
    >
      {item.imageUrls?.[0] ? (
        <Image source={{ uri: item.imageUrls[0] }} style={styles.prodImg} contentFit="cover" />
      ) : (
        <View style={[styles.prodImg, { backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="cube-outline" size={22} color={C.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, marginHorizontal: SPACING.md }}>
        <Text allowFontScaling={false} style={[styles.prodName, { color: C.text }]} numberOfLines={2}>{item.name}</Text>
        <View style={styles.prodMetaRow}>
          <Text allowFontScaling={false} style={[styles.prodPrice, { color: C.primary }]}>{money(item.priceUSD)}</Text>
          <View style={[styles.dot, { backgroundColor: C.textSecondary }]} />
          <Text allowFontScaling={false} style={[styles.prodMeta, { color: effStock > 0 ? C.textSecondary : '#E84855' }]} numberOfLines={1}>
            {item.partNumber ? `${item.partNumber} · ` : ''}{t('admin.inStore.stock', { defaultValue: 'Stock' })} {effStock}{variantProduct ? ` · ${t('admin.inStore.options', { defaultValue: 'options' })}` : ''}
          </Text>
        </View>
      </View>
      {!canAdd ? (
        <View style={[styles.statusBadge, { backgroundColor: badgeColor + '1A' }]}>
          <Text allowFontScaling={false} style={[styles.statusBadgeText, { color: badgeColor }]} numberOfLines={1}>{badgeLabel}</Text>
        </View>
      ) : (
        <View style={[styles.addBtn, inCart ? { backgroundColor: C.primary } : { backgroundColor: C.primary + '14', borderWidth: 1.5, borderColor: C.primary + '40' }]}>
          {inCart ? <Text allowFontScaling={false} style={styles.addBtnQty}>{inCart}</Text> : <Ionicons name="add" size={22} color={C.primary} />}
        </View>
      )}
    </TouchableOpacity>
  );
});

// Home-style grid card (image on top) — used in the New Sale catalog.
const ProductGridCard = React.memo(function ProductGridCard({
  item, inCart, C, fieldBg, onAdd, t,
}: {
  item: TenantProduct; inCart: number; C: any; fieldBg: string;
  onAdd: (p: TenantProduct) => void; t: (k: string, o?: any) => string;
}) {
  const status = (item as any).status;
  const canAdd = (item as any).inStock !== false;
  const variantProduct = hasVariations(item);
  const effStock = variantProduct
    ? ((item as any).variations || []).reduce((s: number, v: any) => s + (v.stockQuantity || 0), 0) + ((item as any).colorVariations || []).reduce((s: number, v: any) => s + (v.stockQuantity || 0), 0)
    : (item.stockQty ?? 0);
  const badgeLabel = status === 'coming_soon'
    ? t('product.comingSoon', { defaultValue: 'Coming soon' })
    : status === 'on_the_way'
      ? t('product.onTheWay', { defaultValue: 'On the way' })
      : t('admin.inStore.outOfStock', { defaultValue: 'Out of stock' });
  const badgeColor = status === 'coming_soon' || status === 'on_the_way' ? '#F59E0B' : '#E84855';
  return (
    <TouchableOpacity
      style={[styles.prodCard, { backgroundColor: C.surface }, !canAdd && { opacity: 0.6 }]}
      activeOpacity={canAdd ? 0.85 : 1}
      onPress={() => canAdd && onAdd(item)}
      disabled={!canAdd}
    >
      <View style={styles.prodCardImgWrap}>
        {item.imageUrls?.[0] ? (
          <Image source={{ uri: item.imageUrls[0] }} style={styles.prodCardImg} contentFit="cover" />
        ) : (
          <View style={[styles.prodCardImg, { backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="cube-outline" size={30} color={C.textSecondary} />
          </View>
        )}
        {!canAdd ? (
          <View style={[styles.prodCardBadge, { backgroundColor: badgeColor }]}>
            <Text allowFontScaling={false} style={styles.prodCardBadgeText} numberOfLines={1}>{badgeLabel}</Text>
          </View>
        ) : (
          <View style={[styles.prodCardAdd, inCart ? { backgroundColor: C.primary } : { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.primary + '55' }]}>
            {inCart ? <Text allowFontScaling={false} style={styles.prodCardAddQty}>{inCart}</Text> : <Ionicons name="add" size={20} color={C.primary} />}
          </View>
        )}
      </View>
      <View style={styles.prodCardBody}>
        <Text allowFontScaling={false} style={[styles.prodCardName, { color: C.text }]} numberOfLines={2}>{item.name}</Text>
        {item.partNumber ? (
          <Text allowFontScaling={false} style={[styles.prodCardPart, { color: C.textSecondary }]} numberOfLines={1}>{item.partNumber}</Text>
        ) : null}
        <View style={styles.prodCardMetaRow}>
          <Text allowFontScaling={false} style={[styles.prodCardPrice, { color: C.primary }]}>{money(item.priceUSD)}</Text>
          <Text allowFontScaling={false} style={[styles.prodCardStock, { color: effStock > 0 ? C.textSecondary : '#E84855' }]} numberOfLines={1}>{t('admin.inStore.stock', { defaultValue: 'Stock' })} {effStock}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// Localized ar-IQ/ku numeric keypads emit Eastern-Arabic (٠-٩) or Persian (۰-۹) digits
// and the Arabic decimal separator (٫). Without normalising them to ASCII first, the
// `[^0-9.]` strip below removes every glyph the admin typed, parseFloat('') is NaN and
// `|| 0` turns it into 0 — so a sale paid in full with cash entered as ٥٠ was written
// as amount_paid_usd: 0 / payment_status: 'pending', and a discount typed the same way
// was silently applied as $0. Same helper as AdminPartnerDashboardScreen.
const normalizeDigits = (s: string): string =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, '.');

const AdminCreateOrderScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // When launched from Partner Management, this order is attributed to the partner
  // (the partner can see it, and it's tagged on the owner's books). Optional.
  const partner: { uid: string; name: string } | undefined = route.params?.partner;
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { theme, isDark } = useTheme();
  const { tenantId } = useTenant();
  const { exchangeRateIQD } = useCurrency();
  // The customer pays cash in IQD — show the dinar amount alongside USD using the live rate.
  const iqd = (n: number) => `${Math.round((n || 0) * exchangeRateIQD).toLocaleString()} IQD`;

  const [step, setStep] = useState<'browse' | 'review'>('browse');
  const [products, setProducts] = useState<TenantProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const [discountMode, setDiscountMode] = useState<'flat' | 'percent'>('flat');
  const [cashText, setCashText] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  // Synchronous re-entry lock: `creating` state doesn't commit within one JS tick,
  // so a fast double-tap would pass the guard twice and ring up two orders. The ref
  // flips instantly and is the real gate; `creating` stays for the visual/disabled state.
  const creatingRef = useRef(false);
  // Distinguishes a failed product load (show retry) from a genuinely empty catalog.
  const [loadError, setLoadError] = useState(false);

  // Region (country) is the single source of truth for the phone code. Defaults
  // to Iraq (+964); the phone selector below stays in sync with it.
  const allCountries = useMemo(() => getAllCountries(), []);
  const [country, setCountry] = useState<CountryInfo>(() => allCountries.find((c) => c.code === 'IQ') || allCountries[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    return q
      ? allCountries.filter((c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.code.toLowerCase().includes(q))
      : allCountries;
  }, [countrySearch, allCountries]);

  // Changing country clears the city (the Iraqi-cities list only applies to Iraq;
  // other countries fall back to a free-text city field).
  const selectCountry = useCallback((c: CountryInfo) => {
    if (c.code !== country.code) setCustomerCity('');
    setCountry(c);
  }, [country.code]);

  // City picker — cities for the selected country (offline dataset). For Iraq we
  // use the curated, localized city list so names show in the app language.
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const cityList = useMemo(() => {
    const lang = i18n.language;
    // Prefer the curated, localized city list for any country we have data for
    // (Iraq, Syria, Iran, Turkey, the Gulf, …) so admins see cities in their
    // language; fall back to the English-only library for the rest.
    const curated = COUNTRIES.find((c) => c.code === country.code);
    const base: string[] = curated?.cities?.length
      ? curated.cities.map((c) => (lang === 'ar' ? c.nameAr : lang === 'ku' ? c.nameKu : c.name) || c.name)
      : (City.getCitiesOfCountry(country.code) || []).map((c) => c.name);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of base) {
      const key = name.trim().toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); out.push(name); }
    }
    return out.sort((a, b) => a.localeCompare(b, lang));
  }, [country.code, i18n.language]);
  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    return q ? cityList.filter((c) => c.toLowerCase().includes(q)) : cityList;
  }, [citySearch, cityList]);

  // Effective unit price: a manual override wins; otherwise the tiered price for
  // this quantity, with VIP unlocking wholesale pricing below the tier minimums.
  const priceOf = useCallback((l: CartLine) => {
    if (l.manual) return l.price;
    const base = l.variation ? l.variation.priceUSD : (l.product.priceUSD || 0);
    return calculateTieredPrice(l.quantity, base, (l.product as any).priceTiers, isVip);
  }, [isVip]);

  // Persist the in-progress sale so an app crash/kill mid-sale doesn't lose the cart.
  const hydratedRef = useRef(false);

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const svc = createTenantAdminService(tenantId);
      const list = await svc.getAllProducts();
      setProducts(list);
      // Restore a saved draft, rebuilding cart lines from the freshly-loaded products.
      try {
          const raw = await AsyncStorage.getItem(`pos_draft_${tenantId}`);
          if (raw) {
            const d = JSON.parse(raw);
            const byId = new Map(list.map((p) => [p.id, p]));
            const restored: Record<string, CartLine> = {};
            for (const it of (d.items || [])) {
              const p = byId.get(it.id);
              if (!p) continue;
              if (it.variationId) {
                // Re-resolve the variation from the product's CURRENT data (fresh price/stock).
                const sizeV = ((p as any).variations || []).find((v: any) => v.variationId === it.variationId);
                const colorV = ((p as any).colorVariations || []).find((v: any) => v.variationId === it.variationId);
                const vv = sizeV || colorV;
                if (!vv) continue; // variation no longer exists → drop the line
                const kind: 'size' | 'color' = sizeV ? 'size' : 'color';
                const label = sizeV ? `${vv.sizeValue || ''}${vv.sizeUnit ? ' ' + vv.sizeUnit : ''}`.trim() : (vv.colorValue || '');
                const priceUSD = (typeof vv.priceUSD === 'number' && vv.priceUSD > 0) ? vv.priceUSD : (p.priceUSD || 0);
                restored[it.key || `${p.id}__${it.variationId}`] = { product: p, price: it.price ?? priceUSD, manual: it.manual, quantity: it.quantity || 1, variation: { variationId: it.variationId, label, priceUSD, stockQuantity: vv.stockQuantity ?? 0, kind } };
              } else {
                restored[it.key || it.id] = { product: p, price: it.price ?? (p.priceUSD || 0), manual: it.manual, quantity: it.quantity || 1 };
              }
            }
            if (Object.keys(restored).length) setCart(restored);
            if (d.customerName) setCustomerName(d.customerName);
            if (d.customerPhone) setCustomerPhone(d.customerPhone);
            if (d.customerAddress) setCustomerAddress(d.customerAddress);
            if (d.customerCity) setCustomerCity(d.customerCity);
            if (d.isVip) setIsVip(true);
            if (d.discountText) setDiscountText(d.discountText);
            if (d.discountMode) setDiscountMode(d.discountMode);
            if (d.cashText) setCashText(d.cashText);
            if (d.note) setNote(d.note);
          }
        } catch { /* ignore a corrupt draft */ }
    } catch (e) {
      console.error('Failed to load products', e);
      // Surface a retry affordance instead of masquerading as an empty catalog.
      setLoadError(true);
    } finally {
      setLoading(false);
      hydratedRef.current = true;
    }
  }, [tenantId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Typing stays instant (the input keeps `value={search}`), but the full-catalog
  // refilter + FlatList reconcile run at low priority off the keystroke's sync tick.
  // This shrinks the window where the controlled value is rewritten to native while
  // the keyboard still owns a composing span — defense-in-depth for the search jitter.
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      (p.name || '').toLowerCase().includes(q) || (p.partNumber || '').toLowerCase().includes(q));
  }, [products, deferredSearch]);

  const [variationPicker, setVariationPicker] = useState<TenantProduct | null>(null);

  const addToCart = useCallback((p: TenantProduct) => {
    if (!p.id) return;
    setCart((prev) => {
      const line = prev[p.id!];
      return { ...prev, [p.id!]: { product: p, price: line?.price ?? (p.priceUSD || 0), manual: line?.manual, quantity: (line?.quantity || 0) + 1 } };
    });
  }, []);

  // Add a specific size/color (its own SKU). Keyed per variation so two sizes are two lines.
  const addVariation = useCallback((p: TenantProduct, variationId: string, label: string, vPrice: number | undefined, stockQuantity: number, kind: 'size' | 'color') => {
    if (!p.id) return;
    const key = `${p.id}__${variationId}`;
    const priceUSD = (typeof vPrice === 'number' && vPrice > 0) ? vPrice : (p.priceUSD || 0);
    setCart((prev) => {
      const line = prev[key];
      return { ...prev, [key]: {
        product: p,
        price: line?.price ?? priceUSD,
        manual: line?.manual,
        quantity: (line?.quantity || 0) + 1,
        variation: { variationId, label, priceUSD, stockQuantity, kind },
      } };
    });
  }, []);

  // Tapping a product: variation products open the picker, simple ones add straight to cart.
  const handleTapProduct = useCallback((p: TenantProduct) => {
    if (hasVariations(p)) setVariationPicker(p);
    else addToCart(p);
  }, [addToCart]);

  const setQty = useCallback((id: string, delta: number) => {
    setCart((prev) => {
      const line = prev[id];
      if (!line) return prev;
      const q = line.quantity + delta;
      const next = { ...prev };
      if (q <= 0) delete next[id]; else next[id] = { ...line, quantity: q };
      return next;
    });
  }, []);

  // Absolute set (from typing a quantity). Stays ≥1 — use − or Remove to drop a line.
  const setQtyValue = useCallback((id: string, value: number) => {
    setCart((prev) => {
      const line = prev[id];
      if (!line) return prev;
      return { ...prev, [id]: { ...line, quantity: Math.max(1, Math.floor(value || 0)) } };
    });
  }, []);

  const setPrice = useCallback((id: string, value: string) => {
    const n = parseFloat(normalizeDigits(value).replace(/[^0-9.]/g, ''));
    setCart((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], price: isNaN(n) ? 0 : n, manual: true } } : prev));
  }, []);

  // Snap a hand-typed price back to automatic VIP/wholesale pricing.
  const resetPrice = useCallback((id: string) => {
    setCart((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], manual: false } } : prev));
  }, []);

  const removeLine = useCallback((id: string) => {
    setCart((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  // Full reset so NOTHING (customer, VIP, paid) carries into the next walk-in's sale.
  const resetSale = useCallback(() => {
    setCart({});
    setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setCustomerCity('');
    setIsVip(false); setSearch('');
    setDiscountText(''); setDiscountMode('flat'); setCashText(''); setNote('');
    setStep('browse');
    if (tenantId) AsyncStorage.removeItem(`pos_draft_${tenantId}`).catch(() => {});
  }, [tenantId]);

  // Guard against losing a built-up cart: review→browse first, then confirm before leaving.
  const handleBack = useCallback(() => {
    // Blocked entirely while a sale is being written. The Create button is correctly
    // disabled during the write, which left back as the only escape — and taking it
    // was destructive: back once fell through to browse (looking like nothing
    // happened), back again offered "Discard this sale?", and Discard wiped the cart
    // and popped the screen while the insert was still in flight. The order then
    // committed with stock deducted, the success navigation was dropped because the
    // route was already gone, and the admin — having just been shown a discard
    // confirmation — rang the same sale up again. The service's idempotency key is
    // released in its finally, so the second sale went through.
    if (creatingRef.current) return;
    if (step === 'review') { setStep('browse'); return; }
    if (Object.keys(cart).length > 0) {
      Alert.alert(
        t('admin.inStore.discardTitle', { defaultValue: 'Discard this sale?' }),
        t('admin.inStore.discardMsg', { defaultValue: 'You have items in the cart — leaving will clear them.' }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { text: t('admin.inStore.discard', { defaultValue: 'Discard' }), style: 'destructive', onPress: () => { resetSale(); navigation.goBack(); } },
        ]
      );
      return;
    }
    navigation.goBack();
  }, [step, cart, resetSale, navigation, t]);

  // Android hardware back → same guard.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => { handleBack(); return true; });
      return () => sub.remove();
    }, [handleBack])
  );

  // Debounced persist of the draft. Gated on hydratedRef so the empty initial state
  // never clobbers a saved draft before restore runs.
  useEffect(() => {
    if (!hydratedRef.current || !tenantId) return;
    const key = `pos_draft_${tenantId}`;
    const items = Object.entries(cart).map(([key, l]) => ({ key, id: l.product.id, variationId: l.variation?.variationId, price: l.price, manual: l.manual, quantity: l.quantity }));
    const hasContent = items.length > 0 || !!customerName || !!customerPhone || !!customerAddress || !!note;
    const h = setTimeout(() => {
      if (hasContent) {
        AsyncStorage.setItem(key, JSON.stringify({ items, customerName, customerPhone, customerAddress, customerCity, isVip, discountText, discountMode, cashText, note })).catch(() => {});
      } else {
        AsyncStorage.removeItem(key).catch(() => {});
      }
    }, 400);
    return () => clearTimeout(h);
  }, [cart, customerName, customerPhone, customerAddress, customerCity, isVip, discountText, discountMode, cashText, note, tenantId]);

  const lines = Object.values(cart);
  const subtotal = lines.reduce((s, l) => s + (priceOf(l) || 0) * l.quantity, 0);
  const profit = lines.reduce((s, l) => {
    const cost = (l.product as any).purchasePrice;
    return cost != null && cost > 0 ? s + (priceOf(l) - cost) * l.quantity : s;
  }, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  // Whole-sale discount (flat $ or %), final total, net profit, and cash/change due.
  const discountInput = parseFloat(normalizeDigits(discountText).replace(/[^0-9.]/g, '')) || 0;
  const discountUSD = Math.max(0, Math.min(discountMode === 'percent' ? (subtotal * discountInput) / 100 : discountInput, subtotal));
  const total = Math.max(0, subtotal - discountUSD);
  const netProfit = profit - discountUSD;
  const cashUSD = parseFloat(normalizeDigits(cashText).replace(/[^0-9.]/g, '')) || 0;
  const changeDue = cashText.trim() ? cashUSD - total : 0;

  // If everything is removed while reviewing, slide back to browsing.
  useEffect(() => {
    if (step === 'review' && lines.length === 0) setStep('browse');
  }, [step, lines.length]);

  const handleCreate = async (force = false) => {
    if (!tenantId || !lines.length || creatingRef.current) return;

    // Never silently ring up a loss — confirm if any line is $0 or at/below its cost.
    if (!force) {
      const bad = lines.find((l) => {
        const price = priceOf(l);
        const cost = (l.product as any).purchasePrice;
        return price <= 0 || (cost != null && cost > 0 && price <= cost);
      });
      if (bad) {
        Alert.alert(
          t('admin.inStore.lossTitle', { defaultValue: 'Price below cost' }),
          t('admin.inStore.lossMsg', { name: bad.product.name, defaultValue: `"${bad.product.name}" is priced at or below your cost (or $0). Sell anyway?` }),
          [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('admin.inStore.sellAnyway', { defaultValue: 'Sell anyway' }), onPress: () => handleCreate(true) },
          ]
        );
        return;
      }
    }

    try {
      // Flip the ref synchronously (before the first await) so a second tap in the
      // same tick sees the lock; the loss-confirmation path above deliberately runs
      // before this, so the recursive handleCreate(true) is never blocked.
      creatingRef.current = true;
      setCreating(true);
      const items = lines.map((l) => ({
        productId: l.product.id,
        // Put the chosen size/color in the name so it shows on the order + printed receipt.
        productName: l.variation ? `${l.product.name} (${l.variation.label})` : l.product.name,
        partNumber: l.product.partNumber,
        imageUrl: l.product.imageUrls?.[0],
        priceUSD: priceOf(l),
        originalPriceUSD: l.variation ? l.variation.priceUSD : l.product.priceUSD,
        purchasePrice: (l.product as any).purchasePrice,
        quantity: l.quantity,
        variationId: l.variation?.variationId,
      }));
      const fullPhone = customerPhone ? `${country.dialCode}${customerPhone}` : '';
      const { orderId } = await createTenantAdminService(tenantId).createManualOrder({
        items, customerName, customerPhone: fullPhone, customerAddress, customerCity, isVip,
        discountUSD,
        amountPaidUSD: cashText.trim() ? cashUSD : 0,
        notes: note.trim() || undefined,
        exchangeRate: exchangeRateIQD,
        partner,
      });
      // Straight to the order (no extra OK tap), and reset so nothing carries to the next sale.
      resetSale();
      navigation.replace('AdminInStoreOrders', { source: 'in-store', orderId });
    } catch (e: any) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), e.message || t('admin.inStore.createFailed', { defaultValue: 'Failed to create sale' }));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const C = theme.colors;
  const fieldBg = isDark ? C.background : '#F0F2F5';

  // ───────────────────────── Browse step ─────────────────────────
  // Thin wrapper: hands each row its own in-cart count. ProductRow (memoized) then
  // re-renders only the single row whose count changed, not the whole visible list.
  // Sum every cart line for this product (a variation product can have several lines).
  const inCartFor = useCallback((productId?: string) => (
    productId ? Object.values(cart).reduce((s, l) => s + (l.product.id === productId ? l.quantity : 0), 0) : 0
  ), [cart]);

  const renderProduct = useCallback(({ item }: { item: TenantProduct }) => (
    <ProductGridCard
      item={item}
      inCart={inCartFor(item.id)}
      C={C}
      fieldBg={fieldBg}
      onAdd={handleTapProduct}
      t={t}
    />
  ), [inCartFor, C, fieldBg, handleTapProduct, t]);

  const renderBrowse = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: C.surface, borderColor: C.border }, isRTL && { flexDirection: 'row-reverse' }]}>
        <Ionicons name="search" size={18} color={C.textSecondary} />
        <TextInput allowFontScaling={false}
          value={search} onChangeText={setSearch}
          // A part query never wants autocorrect/prediction. Disabling the IME's
          // composing/predictive span stops the newest Samsung Keyboard (S26 Ultra)
          // from fighting the controlled value mid-type (cursor jump / char reorder
          // / suggestion-bar bounce) — the in-store search "jitter".
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          importantForAutofill="no"
          placeholder={t('admin.inStore.searchProducts', { defaultValue: 'Search parts to add…' })}
          placeholderTextColor={C.placeholder}
          style={[styles.searchInput, { color: C.text, textAlign: isRTL ? 'right' : 'left' }]}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear', { defaultValue: 'Clear' })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close-circle" size={18} color={C.textSecondary} /></TouchableOpacity>
        ) : null}
      </View>

      {/* Catalog */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.primary} /></View>
      ) : loadError && products.length === 0 ? (
        // A failed fetch must not masquerade as an empty catalog — give a way to retry.
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={C.textSecondary} />
          <Text allowFontScaling={false} style={[styles.empty, { color: C.textSecondary, marginTop: 12 }]}>
            {t('admin.inStore.loadFailed', { defaultValue: "Couldn't load products" })}
          </Text>
          <TouchableOpacity onPress={loadProducts} activeOpacity={0.85} style={[styles.retryBtn, { borderColor: C.primary }]}>
            <Ionicons name="refresh" size={18} color={C.primary} />
            <Text allowFontScaling={false} style={{ color: C.primary, fontWeight: '700', marginLeft: 6, fontSize: 14.5 }}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id || p.partNumber}
          renderItem={renderProduct}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          extraData={cart}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingBottom: lines.length > 0 ? 96 : 8 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text allowFontScaling={false} style={[styles.empty, { color: C.textSecondary }]}>{t('admin.inStore.noProducts', { defaultValue: 'No products found' })}</Text>}
        />
      )}

      {/* Sticky "Review cart" bar */}
      {lines.length > 0 && (
        <View style={[styles.viewCartWrap, { backgroundColor: 'transparent' }]} pointerEvents="box-none">
          <TouchableOpacity onPress={() => setStep('review')} activeOpacity={0.9}>
            <LinearGradient
              colors={['#FF8A3D', '#FF6A00']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.viewCartBar}
            >
              <View style={styles.viewCartBadge}>
                <Text allowFontScaling={false} style={styles.viewCartBadgeText}>{itemCount}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.viewCartText}>{t('admin.inStore.reviewCart', { defaultValue: 'Review cart' })}</Text>
              <View style={{ flex: 1 }} />
              <Text allowFontScaling={false} style={styles.viewCartTotal}>{money(subtotal)}</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );

  // ───────────────────────── Review step ─────────────────────────
  const renderReview = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: SPACING.md, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Customer card */}
        <View style={[styles.card, { backgroundColor: C.surface }]}>
          <Text allowFontScaling={false} style={[styles.cardLabel, { color: C.textSecondary }]}>{t('admin.inStore.customer', { defaultValue: 'Customer' })}</Text>
          <TextInput allowFontScaling={false}
            value={customerName} onChangeText={setCustomerName}
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="words"
            importantForAutofill="no"
            placeholder={t('admin.inStore.customerName', { defaultValue: 'Customer name (optional)' })}
            placeholderTextColor={C.placeholder}
            style={[styles.cardInput, { backgroundColor: fieldBg, color: C.text }]}
          />
          {/* Phone with country-code selector (kept in sync with the Region field) */}
          <View style={{ marginTop: SPACING.sm }}>
            <PhoneInput
              value={customerPhone}
              onChangeText={setCustomerPhone}
              defaultCountry={country.code}
              onCountryChange={(c: CountryInfo) => selectCountry(c)}
              placeholder={t('admin.inStore.phone', { defaultValue: 'Phone' })}
              style={{ backgroundColor: fieldBg, borderColor: 'transparent', borderRadius: 12, height: 52 }}
            />
          </View>

          {/* Region (country) — pick from all countries; drives the phone code */}
          <TouchableOpacity
            onPress={() => setShowCountryPicker(true)}
            activeOpacity={0.7}
            style={[styles.cardInput, styles.selectField, { backgroundColor: fieldBg, marginTop: SPACING.sm }]}
          >
            <Text allowFontScaling={false} style={{ fontSize: 20 }}>{country.flag}</Text>
            <Text allowFontScaling={false} style={{ flex: 1, marginLeft: 8, fontSize: 14.5, color: C.text }} numberOfLines={1}>
              {country.name}
            </Text>
            <Ionicons name="chevron-down" size={18} color={C.textSecondary} />
          </TouchableOpacity>

          <TextInput allowFontScaling={false}
            value={customerAddress} onChangeText={setCustomerAddress}
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="words"
            importantForAutofill="no"
            placeholder={t('admin.inStore.address', { defaultValue: 'Address (optional)' })}
            placeholderTextColor={C.placeholder}
            style={[styles.cardInput, { backgroundColor: fieldBg, color: C.text, marginTop: SPACING.sm }]}
          />

          {/* City — picker of the selected country's cities; free text if none */}
          {cityList.length > 0 ? (
            <TouchableOpacity
              onPress={() => setShowCityPicker(true)}
              activeOpacity={0.7}
              style={[styles.cardInput, styles.selectField, { backgroundColor: fieldBg, marginTop: SPACING.sm }]}
            >
              <Ionicons name="location-outline" size={18} color={C.textSecondary} />
              <Text allowFontScaling={false}
                style={{ flex: 1, marginLeft: 8, fontSize: 14.5, color: customerCity ? C.text : C.placeholder }}
                numberOfLines={1}
              >
                {customerCity || t('admin.inStore.selectCity', { defaultValue: 'Select city (optional)' })}
              </Text>
              {customerCity ? (
                <TouchableOpacity onPress={() => setCustomerCity('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear', { defaultValue: 'Clear' })}>
                  <Ionicons name="close-circle" size={18} color={C.textSecondary} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-down" size={18} color={C.textSecondary} />
              )}
            </TouchableOpacity>
          ) : (
            <TextInput allowFontScaling={false}
              value={customerCity} onChangeText={setCustomerCity}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="words"
              importantForAutofill="no"
              placeholder={t('admin.inStore.city', { defaultValue: 'City (optional)' })}
              placeholderTextColor={C.placeholder}
              style={[styles.cardInput, { backgroundColor: fieldBg, color: C.text, marginTop: SPACING.sm }]}
            />
          )}

          {/* VIP toggle — applies VIP wholesale pricing to all (non-manually-priced) items */}
          <TouchableOpacity
            onPress={() => setIsVip((v) => !v)}
            activeOpacity={0.85}
            style={[
              styles.vipToggle,
              isVip
                ? { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }
                : { backgroundColor: 'transparent', borderColor: C.border },
            ]}
          >
            <Ionicons name={isVip ? 'star' : 'star-outline'} size={18} color={isVip ? '#fff' : C.textSecondary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text allowFontScaling={false} style={[styles.vipTitle, { color: isVip ? '#fff' : C.text }]}>
                {t('admin.inStore.vipCustomer', { defaultValue: 'VIP customer' })}
              </Text>
              <Text allowFontScaling={false} style={[styles.vipHint, { color: isVip ? 'rgba(255,255,255,0.85)' : C.textSecondary }]}>
                {t('admin.inStore.vipHint', { defaultValue: 'Apply exclusive VIP pricing' })}
              </Text>
            </View>
            <Ionicons
              name={isVip ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={isVip ? '#fff' : C.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Items card */}
        <View style={[styles.card, { backgroundColor: C.surface }]}>
          <View style={styles.cartHeader}>
            <Text allowFontScaling={false} style={[styles.cardLabel, { color: C.textSecondary, marginBottom: 0 }]}>
              {t('admin.inStore.items', { defaultValue: 'Items' })} · {itemCount}
            </Text>
            <TouchableOpacity onPress={resetSale} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text allowFontScaling={false} style={{ color: C.error, fontSize: 13, fontWeight: '600' }}>{t('admin.inStore.clear', { defaultValue: 'Clear' })}</Text>
            </TouchableOpacity>
          </View>
          {Object.entries(cart).map(([cartKey, l]) => (
            <ReviewLine
              key={cartKey}
              cartKey={cartKey}
              line={l}
              unitPrice={priceOf(l)}
              C={C}
              fieldBg={fieldBg}
              eachLabel={t('admin.inStore.each', { defaultValue: 'each' })}
              removeLabel={t('admin.inStore.remove', { defaultValue: 'Remove' })}
              customLabel={t('admin.inStore.custom', { defaultValue: 'custom' })}
              oversellLabel={(() => {
                // Variation lines check their own SKU stock; simple products check stock_qty.
                const stk = l.variation ? l.variation.stockQuantity : (hasVariations(l.product) ? null : l.product.stockQty);
                return typeof stk === 'number' && l.quantity > stk
                  ? t('admin.inStore.onlyInStock', { n: stk, defaultValue: `Only ${stk} in stock` })
                  : '';
              })()}
              costLabel={t('admin.products.cost', { defaultValue: 'Cost' })}
              onSetPrice={setPrice}
              onResetPrice={resetPrice}
              onSetQtyValue={setQtyValue}
              onSetQty={setQty}
              onRemove={removeLine}
            />
          ))}
          <TouchableOpacity onPress={() => setStep('browse')} style={styles.addMoreBtn} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={18} color={C.primary} />
            <Text allowFontScaling={false} style={{ color: C.primary, fontWeight: '700', marginLeft: 6, fontSize: 14 }}>{t('admin.inStore.addMore', { defaultValue: 'Add more items' })}</Text>
          </TouchableOpacity>
        </View>

        {/* Summary card */}
        <View style={[styles.card, { backgroundColor: C.surface }]}>
          {/* Whole-sale discount ($ or %) */}
          <View style={styles.totalsRow}>
            <Text allowFontScaling={false} style={[styles.totalLabel, { color: C.textSecondary }]}>{t('admin.inStore.discount', { defaultValue: 'Discount' })}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setDiscountMode((m) => (m === 'flat' ? 'percent' : 'flat'))} style={[styles.modeToggle, { borderColor: C.border }]}>
                <Text allowFontScaling={false} style={{ color: C.primary, fontWeight: '800', fontSize: 14 }}>{discountMode === 'percent' ? '%' : '$'}</Text>
              </TouchableOpacity>
              <TextInput allowFontScaling={false}
                value={discountText}
                onChangeText={setDiscountText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={C.textSecondary}
                style={[styles.amountInput, { color: C.text, borderColor: C.border }]}
              />
            </View>
          </View>

          {/* Subtotal */}
          <View style={[styles.totalsRow, { marginTop: 10 }]}>
            <Text allowFontScaling={false} style={[styles.totalLabel, { color: C.textSecondary }]}>{t('admin.orders.subtotal', { defaultValue: 'Subtotal' })}</Text>
            <Text allowFontScaling={false} style={[styles.totalValue, { color: C.textSecondary, fontWeight: '600' }]}>{money(subtotal)}</Text>
          </View>
          {discountUSD > 0 && (
            <View style={[styles.totalsRow, { marginTop: 4 }]}>
              <Text allowFontScaling={false} style={[styles.totalLabel, { color: '#EF4444' }]}>{t('admin.inStore.discount', { defaultValue: 'Discount' })}</Text>
              <Text allowFontScaling={false} style={[styles.totalValue, { color: '#EF4444' }]}>− {money(discountUSD)}</Text>
            </View>
          )}

          {/* Total (the number the customer pays) */}
          <View style={[styles.totalsRow, { marginTop: 6 }]}>
            <Text allowFontScaling={false} style={[styles.totalLabel, { color: C.text, fontWeight: '800', fontSize: 15 }]}>{t('admin.inStore.total', { defaultValue: 'Total' })}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text allowFontScaling={false} style={[styles.totalValue, { color: C.text, fontSize: 18 }]}>{money(total)}</Text>
              <Text allowFontScaling={false} style={{ color: C.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 1 }}>{iqd(total)}</Text>
            </View>
          </View>

          {/* Net profit / loss (after discount) */}
          {netProfit !== 0 && (
            <View style={[styles.totalsRow, { marginTop: 6 }]}>
              <Text allowFontScaling={false} style={[styles.totalLabel, { color: netProfit < 0 ? '#EF4444' : '#10B981' }]}>
                {netProfit < 0 ? t('admin.inStore.loss', { defaultValue: 'Loss' }) : t('admin.orders.profit', { defaultValue: 'Profit' })}
              </Text>
              <Text allowFontScaling={false} style={[styles.totalValue, { color: netProfit < 0 ? '#EF4444' : '#10B981' }]}>{money(Math.abs(netProfit))}</Text>
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* Cash received → change due / remaining */}
          <View style={styles.totalsRow}>
            <Text allowFontScaling={false} style={[styles.totalLabel, { color: C.textSecondary }]}>{t('admin.inStore.cashReceived', { defaultValue: 'Cash received' })}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setCashText(total.toFixed(2))} style={[styles.modeToggle, { borderColor: C.border, paddingHorizontal: 8 }]}>
                <Text allowFontScaling={false} style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>{t('admin.inStore.paidFull', { defaultValue: 'Full' })}</Text>
              </TouchableOpacity>
              <TextInput allowFontScaling={false}
                value={cashText}
                onChangeText={setCashText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={C.textSecondary}
                style={[styles.amountInput, { color: C.text, borderColor: C.border }]}
              />
            </View>
          </View>
          {cashText.trim() !== '' && (
            <View style={[styles.totalsRow, { marginTop: 4 }]}>
              <Text allowFontScaling={false} style={[styles.totalLabel, { color: changeDue >= 0 ? '#10B981' : '#F59E0B', fontWeight: '700' }]}>
                {changeDue >= 0 ? t('admin.inStore.changeDue', { defaultValue: 'Change due' }) : t('admin.inStore.remaining', { defaultValue: 'Remaining' })}
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text allowFontScaling={false} style={[styles.totalValue, { color: changeDue >= 0 ? '#10B981' : '#F59E0B' }]}>{money(Math.abs(changeDue))}</Text>
                <Text allowFontScaling={false} style={{ color: C.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 1 }}>{iqd(Math.abs(changeDue))}</Text>
              </View>
            </View>
          )}

          {/* Optional note (prints on the order/receipt) */}
          <TextInput allowFontScaling={false}
            value={note}
            onChangeText={setNote}
            placeholder={t('admin.inStore.notePlaceholder', { defaultValue: 'Add a note (optional)…' })}
            placeholderTextColor={C.textSecondary}
            multiline
            style={[styles.noteInput, { color: C.text, borderColor: C.border, backgroundColor: fieldBg }]}
          />
        </View>
      </ScrollView>

      {/* Sticky create button */}
      <View style={[styles.createBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
        <TouchableOpacity onPress={() => handleCreate()} disabled={creating} activeOpacity={0.9}>
          <LinearGradient
            colors={['#FF8A3D', '#FF6A00']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.createBtn, { opacity: creating ? 0.7 : 1 }]}
          >
            {creating ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                <View style={{ alignItems: 'center' }}>
                  <Text allowFontScaling={false} style={styles.createBtnText}>
                    {t('admin.inStore.create', { defaultValue: 'Create Sale' })} · {money(total)}
                  </Text>
                  <Text allowFontScaling={false} style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', marginTop: 1 }}>{iqd(total)}</Text>
                </View>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Region (country) picker — all countries */}
      <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.citySheet, { backgroundColor: C.surface }]}>
            <View style={[styles.grabber, { backgroundColor: C.border }]} />
            <View style={styles.cartHeader}>
              <Text allowFontScaling={false} style={[styles.title, { color: C.text, fontSize: 18 }]}>
                {t('admin.inStore.selectRegion', { defaultValue: 'Select region' })}
              </Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBar, { backgroundColor: fieldBg, borderColor: 'transparent', marginHorizontal: 0, marginTop: 8 }]}>
              <Ionicons name="search" size={18} color={C.textSecondary} />
              <TextInput allowFontScaling={false}
                value={countrySearch} onChangeText={setCountrySearch}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                importantForAutofill="no"
                placeholder={t('admin.inStore.searchCountry', { defaultValue: 'Search country…' })}
                placeholderTextColor={C.placeholder}
                style={[styles.searchInput, { color: C.text }]}
              />
              {countrySearch ? (
                <TouchableOpacity onPress={() => setCountrySearch('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear', { defaultValue: 'Clear' })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close-circle" size={18} color={C.textSecondary} /></TouchableOpacity>
              ) : null}
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: 6 }}
              initialNumToRender={20}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.cityRow, { borderBottomColor: C.border }]}
                  activeOpacity={0.7}
                  onPress={() => { selectCountry(item); setShowCountryPicker(false); setCountrySearch(''); }}
                >
                  <Text allowFontScaling={false} style={{ fontSize: 22 }}>{item.flag}</Text>
                  <Text allowFontScaling={false} style={{ flex: 1, marginLeft: 10, fontSize: 15, color: C.text }} numberOfLines={1}>{item.name}</Text>
                  <Text allowFontScaling={false} style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginRight: 8 }}>{item.dialCode}</Text>
                  {country.code === item.code && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* City picker */}
      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.citySheet, { backgroundColor: C.surface }]}>
            <View style={[styles.grabber, { backgroundColor: C.border }]} />
            <View style={styles.cartHeader}>
              <Text allowFontScaling={false} style={[styles.title, { color: C.text, fontSize: 18 }]}>
                {t('admin.inStore.selectCity', { defaultValue: 'Select city' })}
              </Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBar, { backgroundColor: fieldBg, borderColor: 'transparent', marginHorizontal: 0, marginTop: 8 }]}>
              <Ionicons name="search" size={18} color={C.textSecondary} />
              <TextInput allowFontScaling={false}
                value={citySearch} onChangeText={setCitySearch}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                importantForAutofill="no"
                placeholder={t('admin.inStore.searchCity', { defaultValue: 'Search city…' })}
                placeholderTextColor={C.placeholder}
                style={[styles.searchInput, { color: C.text }]}
              />
              {citySearch ? (
                <TouchableOpacity onPress={() => setCitySearch('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear', { defaultValue: 'Clear' })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close-circle" size={18} color={C.textSecondary} /></TouchableOpacity>
              ) : null}
            </View>
            <FlatList
              data={filteredCities}
              keyExtractor={(c, i) => `${c}-${i}`}
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: 6 }}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.cityRow, { borderBottomColor: C.border }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setCustomerCity(item);
                    setShowCityPicker(false); setCitySearch('');
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={C.textSecondary} />
                  <Text allowFontScaling={false} style={{ flex: 1, marginLeft: 10, fontSize: 15, color: C.text }}>{item}</Text>
                  {customerCity === item && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? C.background : '#F5F5F7' }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.backBtn, { backgroundColor: C.surface }, isRTL && { marginRight: 0, marginLeft: SPACING.md }]}
          activeOpacity={0.7}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text allowFontScaling={false} style={[styles.title, { color: C.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
            {step === 'review'
              ? t('admin.inStore.reviewTitle', { defaultValue: 'Review Cart' })
              : t('admin.inStore.newSale', { defaultValue: 'New Sale' })}
          </Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: C.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
            {step === 'review'
              ? t('admin.inStore.reviewSubtitle', { defaultValue: 'Confirm items, customer & payment' })
              : t('admin.inStore.subtitle', { defaultValue: 'Tap parts to add them to the cart' })}
          </Text>
        </View>
      </View>

      {/* Partner attribution banner — order is created on behalf of this partner */}
      {partner?.uid && (
        <View style={[styles.partnerBanner, { backgroundColor: isDark ? 'rgba(139,92,246,0.16)' : 'rgba(139,92,246,0.10)' }]}>
          <Ionicons name="people" size={16} color="#8B5CF6" />
          <Text allowFontScaling={false} style={[styles.partnerBannerText, { color: '#8B5CF6' }]} numberOfLines={1}>
            {t('admin.partners.orderForPartner', { name: partner.name, defaultValue: `Order for partner: ${partner.name}` })}
          </Text>
        </View>
      )}

      {step === 'browse' ? renderBrowse() : renderReview()}

      {/* Variation picker — choose a size/color (each its own SKU, stock & price) */}
      <Modal visible={!!variationPicker} transparent animationType="slide" onRequestClose={() => setVariationPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.citySheet, { backgroundColor: C.surface }]}>
            <View style={[styles.grabber, { backgroundColor: C.border }]} />
            <View style={styles.cartHeader}>
              <Text allowFontScaling={false} style={[styles.title, { color: C.text, fontSize: 18, flex: 1 }]} numberOfLines={1}>
                {variationPicker?.name || t('admin.inStore.pickVariation', { defaultValue: 'Choose variant' })}
              </Text>
              <TouchableOpacity onPress={() => setVariationPicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <Text allowFontScaling={false} style={{ color: C.textSecondary, fontSize: 13, marginBottom: 8 }}>
              {t('admin.inStore.pickVariationHint', { defaultValue: 'Tap a variant to add it to the cart' })}
            </Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {[
                ...(((variationPicker as any)?.variations || []).map((v: any) => ({ v, kind: 'size' as const, label: `${v.sizeValue || ''}${v.sizeUnit ? ' ' + v.sizeUnit : ''}`.trim() }))),
                ...(((variationPicker as any)?.colorVariations || []).map((v: any) => ({ v, kind: 'color' as const, label: v.colorValue || '' }))),
              ].map(({ v, kind, label }) => {
                const key = `${variationPicker!.id}__${v.variationId}`;
                const c = cart[key]?.quantity || 0;
                const price = (typeof v.priceUSD === 'number' && v.priceUSD > 0) ? v.priceUSD : (variationPicker!.priceUSD || 0);
                const soldOut = (v.stockQuantity ?? 0) <= 0;
                return (
                  <TouchableOpacity
                    key={v.variationId}
                    disabled={soldOut}
                    onPress={() => addVariation(variationPicker!, v.variationId, label, v.priceUSD, v.stockQuantity ?? 0, kind)}
                    style={[styles.varRow, { borderColor: c > 0 ? C.primary : C.border, opacity: soldOut ? 0.45 : 1 }]}
                    activeOpacity={0.8}
                  >
                    {kind === 'color' && v.colorHex
                      ? <View style={[styles.colorDot, { backgroundColor: v.colorHex }]} />
                      : <Ionicons name={kind === 'color' ? 'color-palette-outline' : 'resize-outline'} size={18} color={C.textSecondary} />}
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                      <Text allowFontScaling={false} style={{ color: C.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{label || '—'}</Text>
                      <Text allowFontScaling={false} style={{ color: soldOut ? '#E84855' : C.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                        {money(price)} · {soldOut ? t('admin.inStore.outOfStock', { defaultValue: 'Out of stock' }) : `${t('admin.inStore.stock', { defaultValue: 'Stock' })} ${v.stockQuantity ?? 0}`}
                      </Text>
                    </View>
                    {c > 0 ? (
                      <View style={[styles.varCount, { backgroundColor: C.primary }]}><Text allowFontScaling={false} style={styles.varCountText}>{c}</Text></View>
                    ) : !soldOut ? (
                      <Ionicons name="add-circle" size={24} color={C.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setVariationPicker(null)} style={[styles.varDoneBtn, { backgroundColor: C.primary }]} activeOpacity={0.9}>
              <Text allowFontScaling={false} style={styles.varDoneText}>{t('common.done', { defaultValue: 'Done' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const softShadow = {
  shadowColor: '#0B1220', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
} as const;

// Stops the Android "text bounces up/down while typing" jitter. Applied inline
// because the global TextInput monkeypatch can silently no-op on New Architecture.
const inputFix = {
  includeFontPadding: false,
  textAlignVertical: 'center' as const,
  paddingVertical: 0,
};

const styles = StyleSheet.create({
  prodCard: { width: '48.5%', borderRadius: 14, marginBottom: 12, overflow: 'hidden', ...SHADOW_STYLES.small },
  prodCardImgWrap: { width: '100%', aspectRatio: 1, position: 'relative' },
  prodCardImg: { width: '100%', height: '100%' },
  prodCardAdd: { position: 'absolute', right: 8, bottom: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', ...SHADOW_STYLES.small },
  prodCardAddQty: { color: '#fff', fontWeight: '800', fontSize: 14 },
  prodCardBadge: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  prodCardBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  prodCardBody: { padding: 10 },
  prodCardName: { fontSize: 13, fontWeight: '600', minHeight: 34 },
  prodCardPart: { fontSize: 11, marginTop: 2 },
  prodCardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  prodCardPrice: { fontSize: 15, fontWeight: '800' },
  prodCardStock: { fontSize: 10, flexShrink: 1, marginLeft: 6, textAlign: 'right' },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.xs, paddingBottom: SPACING.md },
  backBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md, ...softShadow },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 12.5, marginTop: 1 },
  partnerBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.md, marginBottom: SPACING.sm, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  partnerBannerText: { fontSize: 13.5, fontWeight: '700', marginLeft: 8, flex: 1 },

  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.md, paddingHorizontal: 14, height: 50, borderRadius: 14, marginBottom: SPACING.sm, ...softShadow },
  searchInput: { flex: 1, height: 38, marginHorizontal: 10, fontSize: 14.5, ...inputFix },

  prodRow: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 18, marginBottom: 10, ...softShadow },
  prodImg: { width: 52, height: 52, borderRadius: 13 },
  prodName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  prodMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  prodPrice: { fontSize: 14, fontWeight: '800' },
  prodMeta: { fontSize: 12.5, flexShrink: 1 },
  dot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 7, opacity: 0.5 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addBtnQty: { color: '#fff', fontWeight: '800', fontSize: 15 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'center', alignSelf: 'flex-start', flexShrink: 0 },
  statusBadgeText: { fontSize: 11, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 },
  empty: { textAlign: 'center', marginTop: 50, fontSize: 14.5 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },

  // "Review cart" sticky bar (browse step)
  viewCartWrap: { position: 'absolute', left: SPACING.md, right: SPACING.md, bottom: SPACING.md },
  viewCartBar: {
    height: 58, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    shadowColor: '#FF6A00', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8,
  },
  viewCartBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 10 },
  viewCartBadgeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  viewCartText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  viewCartTotal: { color: '#fff', fontWeight: '800', fontSize: 16.5 },

  // Review step cards
  card: { borderRadius: 18, padding: SPACING.md, marginBottom: SPACING.md, ...softShadow },
  cardLabel: { fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  cardInput: { borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 14.5, ...inputFix },
  selectField: { flexDirection: 'row', alignItems: 'center' },

  vipToggle: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  vipTitle: { fontSize: 14.5, fontWeight: '800', letterSpacing: -0.2 },
  vipHint: { fontSize: 12, marginTop: 1 },

  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewLine: { flexDirection: 'row', paddingTop: 12, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  reviewImg: { width: 48, height: 48, borderRadius: 12 },
  reviewLineFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 8 },
  priceEdit: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  // Fixed height + zero vertical padding (via inputFix) is what actually stops the
  // Android "number jiggles up/down on touch" jitter — a small TextInput with no
  // fixed height lets the text scroll vertically. 32 keeps it inline with the 30px qty buttons.
  priceInput: { minWidth: 54, height: 32, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, fontSize: 13.5, fontWeight: '700', marginHorizontal: 3, ...inputFix },
  cartName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },
  variationTag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, marginTop: 3 },
  varRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  varCount: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  varCountText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  colorDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  varDoneBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  varDoneText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cartLineControls: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  qtyCtrl: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 6 },
  qtyBtn: { width: 30, height: 30, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { minWidth: 40, height: 30, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 15, fontWeight: '800', marginHorizontal: 4, paddingHorizontal: 2, ...inputFix },
  customChip: { flexDirection: 'row', alignItems: 'center', marginLeft: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  customChipText: { fontSize: 11, fontWeight: '700' },
  cartLineTotal: { fontSize: 14, fontWeight: '800', minWidth: 62, textAlign: 'right' },
  addMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 6 },

  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeToggle: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  amountInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 34, minWidth: 86, textAlign: 'right', fontSize: 15, fontWeight: '700', ...inputFix },
  divider: { height: 1, marginVertical: 10, opacity: 0.6 },
  noteInput: { ...inputFix, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, marginTop: 10, fontSize: 14, minHeight: 44, textAlignVertical: 'top' },
  totalLabel: { fontSize: 13.5, fontWeight: '500' },
  totalValue: { fontSize: 15, fontWeight: '800' },

  createBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },

  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 10, opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  citySheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SPACING.md, paddingTop: 10, paddingBottom: 24, maxHeight: '82%' },
  cityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  createBtn: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', shadowColor: '#FF6A00', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8 },
  createBtnText: { color: '#fff', fontSize: 16.5, fontWeight: '800', letterSpacing: 0.2 },
});

export default AdminCreateOrderScreen;
