import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, FlatList, Dimensions, Platform, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService } from '../../services/tenantAdminService';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { LOGO_BASE64 } from '../../constants/logoBase64';
import { formatPrice } from '../../utils/currency';
import { BRAND } from '../../constants/config';
import { useNavigation } from '@react-navigation/native';

// expo-print won't wait for remote <img> to download, so product images came out
// blank on the PDF. Download each one and inline it as a base64 data URI (small/cropped
// via the wsrv.nl proxy, ~1KB) so it's embedded before the PDF renders. Falls back to
// the original URL, then null (→ 📦 placeholder).
const fetchInvoiceImageAsDataUri = async (url: string, index: number): Promise<string | null> => {
  const candidates = [
    `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=120&h=120&fit=cover&output=jpg&q=80`,
    url,
  ];
  // Unique per call+run so a double-tapped print can't collide on the same temp file.
  const target = `${FileSystem.cacheDirectory}unpaid_img_${Date.now()}_${index}.jpg`;
  for (const candidate of candidates) {
    try {
      const { status } = await FileSystem.downloadAsync(candidate, target);
      if (status !== 200) continue;
      const b64 = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.Base64 });
      FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (b64 && b64.length > 100) return `data:image/jpeg;base64,${b64}`;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
};

// Wholesale unit price = the best (lowest) wholesale tier price; falls back to the base price when
// a product has no wholesale tiers. The owner's revenue report values every sale at this WHOLESALE
// price (not the per-piece price actually charged), per the owner's requirement.
const wholesaleUnitPrice = (p: any): number => {
  const tiers = (Array.isArray(p?.priceTiers) ? p.priceTiers : [])
    .filter((t: any) => t && t.minQty > 0 && t.priceUSD > 0);
  return tiers.length ? Math.min(...tiers.map((t: any) => Number(t.priceUSD))) : (Number(p?.priceUSD) || 0);
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

// Available (sellable) stock on hand: main + size-variation + color-variation quantities.
const getAvailableStock = (p: any): number => {
  const main = Number(p?.stockQty) || 0;
  const size = (Array.isArray(p?.variations) ? p.variations : [])
    .reduce((s: number, v: any) => s + (Number(v?.stockQuantity) || 0), 0);
  const color = (Array.isArray(p?.colorVariations) ? p.colorVariations : [])
    .reduce((s: number, v: any) => s + (Number(v?.stockQuantity) || 0), 0);
  return main + size + color;
};

// Order part numbers LEXICALLY — by the FIRST character, then the next, etc. — so the list groups
// by the leading digit ("10000" before "2000" because '1' < '2'), and two parts starting with the
// same digit sit together. Plain string compare (no Intl → Hermes-safe). Empty parts sort last.
const partNumberCompare = (a: any, b: any): number => {
  const sa = String(a ?? ''), sb = String(b ?? '');
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

export const ReportsGenerator = () => {
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const { tenantId } = useTenant();
  const navigation = useNavigation<any>();

  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [unpaidModalVisible, setUnpaidModalVisible] = useState(false);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [totalUnpaidAmountUSD, setTotalUnpaidAmountUSD] = useState(0);
  const [selectedUnpaidUser, setSelectedUnpaidUser] = useState<any | null>(null);

  const fetchInvoiceSettings = async (service: any) => {
    return await service.getSettings('invoiceSettings');
  };

  const handleRevenueReport = async () => {
    if (!tenantId) return;

    Alert.alert(
      t('admin.stockReport.selectLanguage', { defaultValue: 'Select Invoice Language' }),
      t('admin.stockReport.selectLanguageMessage', { defaultValue: 'Choose the language for the report' }),
      [
        { text: '🇬🇧 English', onPress: () => generateRevenuePDF('en') },
        { text: '🇸🇦 العربية', onPress: () => generateRevenuePDF('ar') },
        { text: '🇮🇶 کوردی', onPress: () => generateRevenuePDF('ku') },
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      ]
    );
  };

  const generateRevenuePDF = async (lang: 'en' | 'ar' | 'ku') => {
    if (!tenantId) return;
    setLoadingType('revenue');
    try {
      const service = createTenantAdminService(tenantId);
      const [products, orders, invoiceSettings] = await Promise.all([
        service.getAllProducts(),
        service.getAllOrders(1000),
        fetchInvoiceSettings(service)
      ]);

      const { rows, totals } = aggregateRevenueRows(products, orders);
      if (rows.length === 0) {
        Alert.alert(
          t('admin.common.error', { defaultValue: 'Error' }),
          t('admin.stockReport.noRevenueSales', { defaultValue: 'No products or sales to report yet.' })
        );
        return;
      }

      // Only the header logo is embedded (one small image). Per-product thumbnails are
      // intentionally omitted: this ledger can run to hundreds of sold products, and embedding a
      // base64 image per row bloated the HTML so much the generated PDF failed to open in the
      // Android print preview ("open failed: ENOENT"). The part number identifies each row.
      const logoData = invoiceSettings?.logoUrl ? await fetchInvoiceImageAsDataUri(invoiceSettings.logoUrl, 90001) : null;

      const html = generateRevenueReportHtml(rows, totals, invoiceSettings, lang, logoData);
      await generateAndSharePDF(html, 'Revenue_Report');
    } catch (error) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), 'Failed to generate revenue report');
    } finally {
      setLoadingType(null);
    }
  };

  const handleUnpaidOrders = async (showModal = true) => {
    if (!tenantId) return;
    setLoadingType('unpaid');
    try {
      const service = createTenantAdminService(tenantId);
      const [orders, invoiceSettings, customers] = await Promise.all([
        service.getAllOrders(1000),
        fetchInvoiceSettings(service),
        service.getAllCustomers()
      ]);

      const customerMap = new Map();
      customers.forEach((c: any) => {
        customerMap.set(c.id, c.profileImageUrl);
      });

      const unpaid = orders.filter((o: any) => {
        // Partner-tagged orders belong to the partner (collected/settled on the partner side),
        // so they are not the owner's receivable.
        if (o.partnerId) return false;
        const total = o.totalUSD || 0;
        const paid = o.amountPaidUSD || 0;
        if (paid >= total - 0.01) return false;
        const remaining = Math.round((total - paid) * 100) / 100;
        return o.status === 'delivered' && remaining > 0.01;
      });

      if (unpaid.length === 0) {
        Alert.alert(t('admin.common.success', { defaultValue: 'Success' }), 'No unpaid orders found.');
        return;
      }

      const totalUnpaid = unpaid.reduce((sum: number, o: any) => {
        const remaining = Math.round(((o.totalUSD || 0) - (o.amountPaidUSD || 0)) * 100) / 100;
        return sum + remaining;
      }, 0);

      if (showModal) {
        const unpaidWithImages = unpaid.map((o: any) => ({
          ...o,
          profileImageUrl: customerMap.get(o.userId) || null
        }));
        setUnpaidOrders(unpaidWithImages);
        setTotalUnpaidAmountUSD(totalUnpaid);
        setUnpaidModalVisible(true);
      } else {
        Alert.alert(
          t('admin.stockReport.selectLanguage', { defaultValue: 'Select Invoice Language' }),
          t('admin.stockReport.selectLanguageMessage', { defaultValue: 'Choose the language for the report' }),
          [
            { text: '🇬🇧 English', onPress: async () => {
                const html = generateUnpaidOrdersInvoiceHtml(unpaid, totalUnpaid, invoiceSettings, 'en');
                await generateAndSharePDF(html, 'Unpaid_Orders');
            }},
            { text: '🇸🇦 العربية', onPress: async () => {
                const html = generateUnpaidOrdersInvoiceHtml(unpaid, totalUnpaid, invoiceSettings, 'ar');
                await generateAndSharePDF(html, 'Unpaid_Orders');
            }},
            { text: '🇮🇶 کوردی', onPress: async () => {
                const html = generateUnpaidOrdersInvoiceHtml(unpaid, totalUnpaid, invoiceSettings, 'ku');
                await generateAndSharePDF(html, 'Unpaid_Orders');
            }},
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), 'Failed to load unpaid orders');
    } finally {
      setLoadingType(null);
    }
  };

  const generateAndSharePDF = async (html: string, prefix: string) => {
    try {
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), 'Sharing not available');
      }
    } catch (error) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), 'Failed to create PDF');
    }
  };

  // Build the Revenue Report ledger: ONE row per owner catalog product (deduped by id), valued at
  // WHOLESALE (lowest valid price tier, else base) — never the per-piece charged price. Every
  // product the owner holds stock of OR has DELIVERED sales for is listed (so a just-added product
  // shows immediately with its inventory value); products with neither are skipped. Sold units use
  // Σ buy price × qty; unsold stock is valued at the product's current buy price. Products currently
  // shared with a partner (coAdminIds) are excluded from the owner's money surfaces.
  const aggregateRevenueRows = (products: any[], orders: any[]) => {
    const productMap: Record<string, any> = {};
    (products || []).forEach((p: any) => { if (p?.id) productMap[p.id] = p; });

    const sales: Record<string, { qty: number; cost: number }> = {};
    (orders || []).forEach((order: any) => {
      if (String(order.status || '').toLowerCase() !== 'delivered') return;
      (Array.isArray(order.items) ? order.items : []).forEach((item: any) => {
        const id = item.productId;
        if (!id) return;
        const p = productMap[id];
        if (!p) return;                                                  // not an owner catalog product — no wholesale price
        if (Array.isArray(p.coAdminIds) && p.coAdminIds.length) return;  // shared with a partner — the partner's, not the owner's
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) return;
        if (!sales[id]) sales[id] = { qty: 0, cost: 0 };
        sales[id].qty += qty;
        // Use the PRODUCT's current buy price (purchasePrice), not the price recorded on the old
        // order line — those are stale/wrong (showed $3.35 when the real product cost is $4.80).
        sales[id].cost += (Number(p.purchasePrice) || 0) * qty;
      });
    });

    let totalCost = 0, totalRevenue = 0, totalUnits = 0;
    // ONE row per owner catalog product — seed from the PRODUCTS, not just the sold ones, so a
    // freshly-added (never-sold) product still appears, valued at its in-stock inventory. A product
    // shows when it has realized sales OR stock on hand; partner-shared products stay excluded from
    // the owner's money surfaces (deleted products are hard-deleted, so they never reach here).
    const rows = (products || []).filter((p: any) => {
      if (!p?.id) return false;
      if (Array.isArray(p.coAdminIds) && p.coAdminIds.length) return false;  // the partner's, not the owner's
      return (sales[p.id]?.qty || 0) > 0 || getAvailableStock(p) > 0;
    }).map((p: any) => {
      const id = p.id;
      const { qty, cost } = sales[id] || { qty: 0, cost: 0 };
      const unitWholesale = wholesaleUnitPrice(p);
      const revenue = qty * unitWholesale;
      const stock = getAvailableStock(p);
      // Per-unit buy: the average actually paid on sold units, else (never sold) the product's
      // current buy price — so a new product still values its stock at the real purchase cost.
      const unitBuy = qty > 0 ? cost / qty : (Number(p.purchasePrice) || 0);
      const totalValue = (qty + stock) * unitBuy;       // Total Buy = (sold + in stock) × buy
      const totalSell = (qty + stock) * unitWholesale;  // Total Sell = (sold + in stock) × wholesale
      const profit = totalSell - totalValue;            // Total Profit = Total Sell − Total Buy
      const soldProfit = revenue - cost;                // Sold Profit = realized profit on units sold
      totalCost += cost; totalRevenue += revenue; totalUnits += qty;
      return {
        id, qty, profit, soldProfit, stock, totalValue, totalSell, unitBuy,
        unitWholesale,
        name: p.name, nameAr: p.nameAr, nameKu: p.nameKu,
        partNumber: p.partNumber,
        imageUrl: (p.imageUrls && p.imageUrls[0]) || '',
      };
    }).sort((a, b) => partNumberCompare(a.partNumber, b.partNumber));

    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { rows, totals: { totalCost, totalRevenue, totalProfit, totalUnits, margin } };
  };

  // Revenue Report PDF — a wholesale P&L ledger. The signature is the hero equation band:
  // Wholesale Revenue − Cost of Goods = Net Profit (with a margin chip), stating the document's
  // truth up top; the table below is the per-product breakdown. Industrial palette, Space Grotesk
  // for figures + Inter tabular numerals. Images are pre-embedded as base64 by the caller.
  const generateRevenueReportHtml = (
    rows: any[],
    totals: { totalCost: number; totalRevenue: number; totalProfit: number; totalUnits: number; margin: number },
    invoiceSettings: any,
    lang: 'en' | 'ar' | 'ku',
    logoData: string | null = null,
  ) => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const endAlign = isRTL ? 'left' : 'right';
    // Format the date with hard-coded localized month names. Hermes (RN's engine) doesn't reliably
    // bundle ICU/CLDR for ar/ku on Android, so toLocaleDateString with month:'long' could fall back
    // to English — so we build the string ourselves from getDate/getMonth/getFullYear (no Intl).
    const MONTHS: Record<string, string[]> = {
      en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
      ku: ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران', 'تەمموز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'],
    };
    const now = new Date();
    const dateStr = lang === 'en'
      ? `${MONTHS.en[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
      : `${now.getDate()} ${MONTHS[lang][now.getMonth()]} ${now.getFullYear()}`;

    const L: any = {
      company: invoiceSettings?.companyName || BRAND.name,
      eyebrow: 'Wholesale Ledger', title: 'Revenue Report', asOf: 'As of', products: 'products', units: 'units',
      revenue: 'Wholesale Revenue', cost: 'Cost of Goods', profit: 'Net Profit', margin: 'margin',
      colProduct: 'Part No.', colSold: 'Sold', colStock: 'In Stock', colBuy: 'Buy', colWs: 'Wholesale',
      colTotalValue: 'Total Buy', colTotalSell: 'Total Sell', colProfit: 'Total Profit', colSoldProfit: 'Sold Profit', totals: 'Totals',
      note: 'Total Buy/Sell cover units sold + in stock, at the buy and wholesale price. Profit = Total Sell − Total Buy.',
      phone: invoiceSettings?.phone || '', email: invoiceSettings?.email || '', address: invoiceSettings?.address || '',
    };
    if (lang === 'ar') Object.assign(L, {
      company: invoiceSettings?.companyNameAr || L.company,
      eyebrow: 'دفتر الجملة', title: 'تقرير الإيرادات', asOf: 'حتى', products: 'منتج', units: 'وحدة',
      revenue: 'إيرادات الجملة', cost: 'تكلفة البضاعة', profit: 'صافي الربح', margin: 'هامش',
      colProduct: 'رقم القطعة', colSold: 'المباع', colStock: 'المتوفر', colBuy: 'الشراء', colWs: 'الجملة', colTotalValue: 'إجمالي الشراء', colTotalSell: 'إجمالي البيع', colProfit: 'إجمالي الربح', colSoldProfit: 'ربح المباع',
      totals: 'الإجمالي',
      note: 'إجمالي الشراء/البيع يشمل المباع + المتوفر بسعر الشراء والجملة. الربح = إجمالي البيع − إجمالي الشراء.',
    });
    else if (lang === 'ku') Object.assign(L, {
      company: invoiceSettings?.companyNameKu || L.company,
      eyebrow: 'دەفتەری کۆمەڵ', title: 'ڕاپۆرتی داهات', asOf: 'تا', products: 'بەرهەم', units: 'دانە',
      revenue: 'داهاتی کۆمەڵ', cost: 'تێچووی کاڵا', profit: 'قازانجی ڕووت', margin: 'مارجن',
      colProduct: 'ژمارەی پارچە', colSold: 'فرۆشراو', colStock: 'بەردەست', colBuy: 'کڕین', colWs: 'کۆمەڵ', colTotalValue: 'کۆی کڕین', colTotalSell: 'کۆی فرۆشتن', colProfit: 'کۆی قازانج', colSoldProfit: 'قازانجی فرۆشراو',
      totals: 'کۆی گشتی',
      note: 'کۆی کڕین/فرۆشتن فرۆشراو + بەردەست لەخۆدەگرێت بە نرخی کڕین و کۆمەڵ. قازانج = کۆی فرۆشتن − کۆی کڕین.',
    });

    const money = (v: number) => `$${formatCurrency(v)}`;
    const logoSrc = logoData || (LOGO_BASE64 ? `data:image/png;base64,${LOGO_BASE64}` : '');
    const totalAllValue = rows.reduce((s: number, r: any) => s + (Number(r.totalValue) || 0), 0);  // Σ Total Buy
    const totalAllSell = rows.reduce((s: number, r: any) => s + (Number(r.totalSell) || 0), 0);    // Σ Total Sell
    const totalAllProfit = totalAllSell - totalAllValue;                                            // Profit = Total Sell − Total Buy
    const allMargin = totalAllSell > 0 ? (totalAllProfit / totalAllSell) * 100 : 0;
    const profNeg = totalAllProfit < 0;

    const rowsHtml = rows.map((r: any, i: number) => {
      const neg = r.profit < 0;
      const sneg = r.soldProfit < 0;
      const stk = r.stock <= 0 ? 'out' : r.stock <= 5 ? 'low' : 'ok';
      return `
        <tr>
          <td class="n"><span class="rank">${i + 1}</span></td>
          <td><span class="partno">${r.partNumber || '—'}</span></td>
          <td class="n"><span class="muted">${r.qty.toLocaleString('en-US')}</span></td>
          <td class="n"><span class="stk ${stk}">${r.stock.toLocaleString('en-US')}</span></td>
          <td class="n"><span class="muted">${money(r.unitBuy)}</span></td>
          <td class="n"><span class="ws">${money(r.unitWholesale)}</span></td>
          <td class="n"><span class="tval">${money(r.totalValue)}</span></td>
          <td class="n"><span class="tsell">${money(r.totalSell)}</span></td>
          <td class="n"><span class="prof ${neg ? 'neg' : ''}">${money(r.profit)}</span></td>
          <td class="n"><span class="sprof ${sneg ? 'neg' : ''}">${money(r.soldProfit)}</span></td>
        </tr>`;
    }).join('');

    return `
      <!DOCTYPE html>
      <html dir="${direction}" lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap" rel="stylesheet">
        <style>
          /* No page size — let it use the device's portrait page so pagination MATCHES the output
             (Android ignores landscape anyway; a landscape @page made it paginate for a short page
             but print on a tall portrait one, leaving the bottom blank). Portrait fills top→bottom. */
          @page { margin: 8mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #131A24; background: #FAFAF7; font-size: 11px; direction: ${direction};
            font-feature-settings: "tnum" 1, "lnum" 1; -webkit-font-feature-settings: "tnum" 1, "lnum" 1;
          }
          .sheet { background: #FFFFFF; border: 1px solid #ECE9E1; border-radius: 16px; padding: 22px 24px; }

          .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 15px; border-bottom: 1px solid #ECE9E1; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand .logo { height: 46px; width: 46px; border-radius: 11px; object-fit: contain; background: #0E1726; padding: 5px; }
          .brand .co { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px; letter-spacing: -0.2px; color: #0E1726; line-height: 1.15; }
          .brand .eyebrow { font-size: 8.5px; font-weight: 700; letter-spacing: 2.4px; text-transform: uppercase; color: #A99E86; margin-top: 4px; }
          .meta { text-align: ${endAlign}; }
          .meta .title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 19px; letter-spacing: 0.5px; color: #1E3A5F; text-transform: uppercase; }
          .meta .sub { font-size: 9.5px; color: #6B7280; margin-top: 4px; font-weight: 500; }

          .pnl { direction: ltr; margin-top: 16px; display: flex; align-items: stretch; gap: 16px;
                 background: linear-gradient(180deg, #FFFFFF 0%, #FBFAF5 100%); border: 1px solid #ECE9E1; border-radius: 14px; padding: 16px 20px; }
          .pnl .blk { flex: 1; min-width: 0; }
          .pnl .blk + .blk { border-left: 1px solid #ECE9E1; padding-left: 16px; }
          .pnl .lab { font-size: 8.5px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #7B8190; }
          .pnl .val { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 19px; letter-spacing: -0.5px; margin-top: 5px; line-height: 1; white-space: nowrap; }
          .v-rev { color: #1E3A5F; }
          .v-cost { color: #B4452F; }
          .v-prof { color: #0F7B5A; font-size: 21px; }
          .v-prof.neg { color: #B4452F; }
          .v-sprof { color: #117A65; font-size: 21px; }
          .v-sprof.neg { color: #B4452F; }
          .chip { display: inline-block; margin-top: 7px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.3px; color: #0F7B5A; background: #E7F4EE; border: 1px solid #C9E7DA; padding: 3px 9px; border-radius: 999px; }
          .chip.neg { color: #B4452F; background: #F8E9E5; border-color: #E8D0C8; }

          /* No overflow:hidden — it forces the whole table onto one page in print (a block formatting
             context that won't fragment), clipping every product past the first page. Let it paginate. */
          .twrap { margin-top: 16px; border: 1px solid #ECE9E1; border-radius: 12px; }
          table.t thead { display: table-header-group; } /* repeat the column header on every page */
          table.t tr { page-break-inside: avoid; }       /* never split a product row across a page break */
          table.t { width: 100%; border-collapse: collapse; table-layout: fixed; }
          table.t th { background: #0E1726; color: #E8EAEF; font-weight: 600; font-size: 8px; letter-spacing: 0.4px; text-transform: uppercase; padding: 8px 5px; text-align: ${textAlign}; }
          table.t th.n { text-align: ${endAlign}; }
          table.t td { padding: 5.5px 5px; border-bottom: 1px solid #F2EFE8; font-size: 9.5px; vertical-align: middle; }
          table.t td.n { text-align: ${endAlign}; font-variant-numeric: tabular-nums; white-space: nowrap; }
          table.t tbody tr:nth-child(even) { background: #FCFBF7; }
          table.t tbody tr:last-child td { border-bottom: none; }
          .rank { color: #BCB29E; font-weight: 700; font-size: 10px; font-variant-numeric: tabular-nums; }
          .pcell { display: flex; align-items: center; gap: 9px; }
          .pimg { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; border: 1px solid #ECE9E1; flex-shrink: 0; }
          .pph { width: 34px; height: 34px; border-radius: 8px; background: #F3F1EA; border: 1px solid #ECE9E1; text-align: center; line-height: 34px; font-size: 15px; flex-shrink: 0; display: inline-block; }
          .pmeta { min-width: 0; }
          .pname { font-weight: 700; color: #1A2230; font-size: 10px; line-height: 1.25; word-break: break-word; }
          .ppart { color: #A99E86; font-size: 8.5px; font-family: 'Space Grotesk', monospace; letter-spacing: 0.3px; margin-top: 1px; }
          .partno { font-weight: 700; color: #1A2230; font-size: 10.5px; font-family: 'Space Grotesk', monospace; letter-spacing: 0.4px; }
          .muted { color: #8A8275; font-weight: 500; }
          .ws { color: #1E3A5F; font-weight: 700; }
          .tval { color: #9A6B4F; font-weight: 700; }
          .tsell { color: #2B6CB0; font-weight: 700; }
          .cost { color: #B4452F; font-weight: 600; }
          .rev { color: #1E3A5F; font-weight: 700; }
          .prof { color: #0F7B5A; font-weight: 800; }
          .prof.neg { color: #B4452F; }
          .sprof { color: #117A65; font-weight: 800; }
          .sprof.neg { color: #B4452F; }
          .rmar { font-size: 8px; color: #A99E86; font-weight: 600; margin-top: 1px; }
          .stk { font-weight: 700; }
          .stk.out { color: #B4452F; }
          .stk.low { color: #C2870B; }
          .stk.ok { color: #4A5568; }
          table.t tr.tot td { border-top: 2px solid #0E1726; padding: 12px 8px; font-size: 11px; font-weight: 800; background: #FBFAF5; }
          table.t tr.tot .tlab { font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.6px; text-transform: uppercase; font-size: 10px; color: #0E1726; }

          .foot { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ECE9E1; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
          .foot .note { font-size: 8.5px; color: #A99E86; font-weight: 600; letter-spacing: 0.2px; max-width: 60%; }
          .foot .contact { font-size: 9px; color: #6B7280; text-align: ${endAlign}; }
          .foot .contact b { color: #131A24; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            <div class="brand">
              ${logoSrc ? `<img class="logo" src="${logoSrc}" />` : ''}
              <div>
                <div class="co">${L.company}</div>
                <div class="eyebrow">${L.eyebrow}</div>
              </div>
            </div>
            <div class="meta">
              <div class="title">${L.title}</div>
              <div class="sub">${L.asOf} ${dateStr} &middot; ${rows.length} ${L.products} &middot; ${totals.totalUnits.toLocaleString('en-US')} ${L.units}</div>
            </div>
          </div>

          <div class="pnl">
            <div class="blk">
              <div class="lab">${L.colTotalValue}</div>
              <div class="val v-cost">${money(totalAllValue)}</div>
            </div>
            <div class="blk">
              <div class="lab">${L.colTotalSell}</div>
              <div class="val v-rev">${money(totalAllSell)}</div>
            </div>
            <div class="blk">
              <div class="lab">${L.colProfit}</div>
              <div class="val v-prof ${profNeg ? 'neg' : ''}">${money(totalAllProfit)}</div>
              <span class="chip ${profNeg ? 'neg' : ''}">${allMargin.toFixed(1)}% ${L.margin}</span>
            </div>
            <div class="blk">
              <div class="lab">${L.colSoldProfit}</div>
              <div class="val v-sprof ${totals.totalProfit < 0 ? 'neg' : ''}">${money(totals.totalProfit)}</div>
            </div>
          </div>

          <div class="twrap">
            <table class="t">
              <colgroup>
                <col style="width:4%;" /><col style="width:13%;" /><col style="width:7%;" />
                <col style="width:7.5%;" /><col style="width:8.5%;" /><col style="width:9.5%;" />
                <col style="width:12.5%;" /><col style="width:12.5%;" /><col style="width:12.5%;" /><col style="width:13%;" />
              </colgroup>
              <thead>
                <tr>
                  <th class="n">#</th>
                  <th>${L.colProduct}</th>
                  <th class="n">${L.colSold}</th>
                  <th class="n">${L.colStock}</th>
                  <th class="n">${L.colBuy}</th>
                  <th class="n">${L.colWs}</th>
                  <th class="n">${L.colTotalValue}</th>
                  <th class="n">${L.colTotalSell}</th>
                  <th class="n">${L.colProfit}</th>
                  <th class="n">${L.colSoldProfit}</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="foot">
            <div class="note">${L.note}</div>
            <div class="contact">
              <b>${L.company}</b>${L.phone ? ` &middot; 📞 ${L.phone}` : ''}${L.email ? ` &middot; ✉️ ${L.email}` : ''}${L.address ? ` &middot; 📍 ${L.address}` : ''}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const generateUnpaidOrdersInvoiceHtml = (unpaid: any[], totalUnpaid: number, invoiceSettings: any, lang: 'en' | 'ar' | 'ku') => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';

    // Localized labels
    const L = {
      reportTitle: 'UNPAID ORDERS REPORT',
      customer: 'Customer',
      total: 'Total',
      paid: 'Paid',
      remaining: 'Remaining',
      grandTotal: 'Grand Total Remaining',
    };

    if (lang === 'ar') {
      L.reportTitle = 'تقرير الطلبات غير المدفوعة';
      L.customer = 'العميل';
      L.total = 'المجموع';
      L.paid = 'المدفوع';
      L.remaining = 'المتبقي';
      L.grandTotal = 'إجمالي المبلغ المتبقي';
    } else if (lang === 'ku') {
      L.reportTitle = 'ڕاپۆرتی داواکارییە نەدراوەکان';
      L.customer = 'کڕیار';
      L.total = 'کۆی گشتی';
      L.paid = 'دراو';
      L.remaining = 'ماوە';
      L.grandTotal = 'کۆی گشتی ماوە';
    }

    const map = new Map<string, { name: string, phone: string, recipientName: string, total: number, paid: number, remaining: number }>();
    unpaid.forEach((order: any) => {
      const total = order.totalUSD || 0;
      const paid = order.amountPaidUSD || 0;
      const remaining = total - paid;
      const name = order.shippingAddress?.fullName || 'Unknown';
      const phone = order.shippingAddress?.phone || '';
      const recipientName = order.shippingOfficeInfo?.recipientName || '';
      const key = order.userId || name;
      
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.total += total;
        existing.paid += paid;
        existing.remaining += remaining;
        if (!existing.phone && phone) existing.phone = phone;
        if (!existing.recipientName && recipientName) existing.recipientName = recipientName;
      } else {
        map.set(key, { name, phone, recipientName, total, paid, remaining });
      }
    });

    const groupedUnpaid = Array.from(map.values());

    const itemsHtml = groupedUnpaid.map((item, index) => {
      let customerHtml = `<strong>${item.name}</strong>`;
      if (item.recipientName) customerHtml += `<br/><span style="color: #4B5563; font-size: 11px;">🏢 ${item.recipientName}</span>`;
      if (item.phone) customerHtml += `<br/><span style="color: #6B7280; font-size: 11px;">${item.phone}</span>`;

      return `
        <tr style="background: ${index % 2 === 0 ? '#fff' : '#F8F9FC'};">
          <td>${customerHtml}</td>
          <td style="text-align: center;">$${formatCurrency(item.total)}</td>
          <td style="text-align: center;">$${formatCurrency(item.paid)}</td>
          <td style="text-align: ${isRTL ? 'left' : 'right'}; color: #EF4444;"><strong>$${formatCurrency(item.remaining)}</strong></td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html dir="${direction}">
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; padding: 20px; font-size: 12px; direction: ${direction}; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #F9FAFB; padding: 10px; text-align: ${textAlign}; border-bottom: 1px solid #ddd; }
          td { padding: 10px; border-bottom: 1px solid #eee; }
        </style>
      </head>
      <body>
        <h2 style="color: #EF4444;">${L.reportTitle}</h2>
        <table>
          <thead>
            <tr>
              <th style="text-align: ${textAlign}">${L.customer}</th>
              <th style="text-align: center">${L.total}</th>
              <th style="text-align: center">${L.paid}</th>
              <th style="text-align: ${isRTL ? 'left' : 'right'}">${L.remaining}</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="margin-top: 30px; padding: 15px; background-color: #FEF2F2; border-radius: 8px; border: 1px solid #FCA5A5; text-align: ${isRTL ? 'left' : 'right'};">
          <h3 style="margin: 0; color: #991B1B;">${L.grandTotal}: <span style="font-size: 22px; color: #DC2626;">$${formatCurrency(totalUnpaid)} USD</span></h3>
        </div>
      </body>
      </html>
    `;
  };

  // Detailed invoice for ONE customer's unpaid orders: each order with its date,
  // the products bought, and amounts — plus the grand total still owed.
  const generateCustomerUnpaidInvoiceHtml = (user: any, invoiceSettings: any, lang: 'en' | 'ar' | 'ku', imageMap: Record<string, string> = {}) => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const endAlign = isRTL ? 'left' : 'right';

    const L: any = {
      title: 'UNPAID INVOICE', company: invoiceSettings?.companyName || BRAND.name,
      customer: 'Customer', phone: 'Phone', order: 'Order', date: 'Date',
      product: 'Product', qty: 'Qty', unit: 'Unit Price', lineTotal: 'Total',
      orderTotal: 'Order Total', paid: 'Paid', remaining: 'Remaining',
      grandTotal: 'Total Unpaid Balance',
    };
    if (lang === 'ar') Object.assign(L, {
      title: 'فاتورة غير مدفوعة', company: invoiceSettings?.companyNameAr || L.company,
      customer: 'العميل', phone: 'الهاتف', order: 'الطلب', date: 'التاريخ',
      product: 'المنتج', qty: 'الكمية', unit: 'سعر الوحدة', lineTotal: 'المجموع',
      orderTotal: 'مجموع الطلب', paid: 'المدفوع', remaining: 'المتبقي', grandTotal: 'إجمالي المبلغ المتبقي',
    });
    else if (lang === 'ku') Object.assign(L, {
      title: 'پسووڵەی نەدراو', company: invoiceSettings?.companyNameKu || L.company,
      customer: 'کڕیار', phone: 'تەلەفۆن', order: 'داواکاری', date: 'بەروار',
      product: 'بەرهەم', qty: 'بڕ', unit: 'نرخی یەکە', lineTotal: 'کۆ',
      orderTotal: 'کۆی داواکاری', paid: 'دراو', remaining: 'ماوە', grandTotal: 'کۆی گشتی ماوە',
    });

    const fmtDate = (createdAt: any) => {
      try {
        if (!createdAt) return 'N/A';
        if (typeof createdAt.toDate === 'function') return createdAt.toDate().toLocaleDateString();
        if (createdAt.seconds) return new Date(createdAt.seconds * 1000).toLocaleDateString();
        return new Date(createdAt).toLocaleDateString();
      } catch { return 'N/A'; }
    };

    const orders = user?.orders || [];
    const ordersHtml = orders.map((order: any) => {
      const total = order.totalUSD || 0;
      const paid = order.amountPaidUSD || 0;
      const remaining = total - paid;
      const orderNum = order.orderNumber?.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '') || 'N/A';
      const items = Array.isArray(order.items) ? order.items : [];
      const rows = items.map((it: any) => {
        const name = (lang === 'ar' && (it.productNameAr)) ? it.productNameAr
          : (lang === 'ku' && it.productNameKu) ? it.productNameKu
          : (it.productName || it.name || '-');
        const q = it.quantity || 0;
        const price = it.priceUSD || 0;
        const rawUrl = it.imageUrl || it.productSnapshot?.imageUrl || '';
        const imgSrc = imageMap[rawUrl] || rawUrl; // prefer the embedded base64 (renders reliably in the PDF)
        const imgHtml = imgSrc
          ? `<img src="${imgSrc}" class="thumb" onerror="this.style.display='none'"/>`
          : `<span class="ph">📦</span>`;
        return `<tr>
          <td><div class="pcell">${imgHtml}<div><div class="pname">${name}</div>${it.partNumber ? `<div class="ppart">${it.partNumber}</div>` : ''}</div></div></td>
          <td style="text-align:center;">${q}</td>
          <td style="text-align:center;">$${formatCurrency(price)}</td>
          <td style="text-align:${endAlign};font-weight:600;">$${formatCurrency(price * q)}</td>
        </tr>`;
      }).join('');

      return `
        <div class="order-card">
          <div class="order-head">
            <span class="order-no">${L.order} ${orderNum}</span>
            <span class="order-date">${L.date}: ${fmtDate(order.createdAt)}</span>
          </div>
          <table>
            <thead><tr>
              <th style="text-align:${textAlign};">${L.product}</th>
              <th style="text-align:center;">${L.qty}</th>
              <th style="text-align:center;">${L.unit}</th>
              <th style="text-align:${endAlign};">${L.lineTotal}</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="4" style="color:#9CA3AF;text-align:center;">—</td></tr>`}</tbody>
          </table>
          <div class="order-foot">
            <div class="foot-row"><span style="color:#6B7280;">${L.orderTotal}</span><span style="font-weight:600;">$${formatCurrency(total)}</span></div>
            <div class="foot-row" style="color:#059669;"><span>${L.paid}</span><span style="font-weight:600;">$${formatCurrency(paid)}</span></div>
            <div class="foot-row" style="color:#DC2626;font-weight:800;"><span>${L.remaining}</span><span>$${formatCurrency(remaining)}</span></div>
          </div>
        </div>`;
    }).join('');

    return `
      <!DOCTYPE html>
      <html dir="${direction}">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Helvetica Neue',Arial,sans-serif; padding:24px; font-size:12px; color:#1F2937; direction:${direction}; text-align:${textAlign}; background:#fff; }
        .top { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:14px; border-bottom:3px solid #FF7816; }
        .brand-name { font-size:22px; font-weight:800; letter-spacing:-0.3px; color:#111827; }
        .badge { display:inline-block; margin-top:6px; padding:3px 12px; background:#FEF2F2; color:#DC2626; font-weight:700; font-size:10px; letter-spacing:2px; border-radius:999px; text-transform:uppercase; }
        .logo { height:54px; width:54px; object-fit:contain; }
        .cust { margin-top:14px; font-size:13px; line-height:1.8; }
        .cust strong { color:#6B7280; font-weight:600; }
        .order-card { margin-top:16px; border:1px solid #E5E7EB; border-radius:12px; overflow:hidden; }
        .order-head { display:flex; justify-content:space-between; align-items:center; background:#F9FAFB; padding:10px 14px; border-bottom:1px solid #E5E7EB; }
        .order-no { font-weight:800; color:#111827; font-size:13px; }
        .order-date { color:#6B7280; font-size:11px; }
        table { width:100%; border-collapse:collapse; }
        th { background:#1F2937; color:#fff; padding:8px 10px; font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
        td { padding:9px 10px; border-bottom:1px solid #F3F4F6; font-size:11px; vertical-align:middle; }
        tbody tr:last-child td { border-bottom:none; }
        .pcell { display:flex; align-items:center; gap:9px; }
        .thumb { width:36px; height:36px; object-fit:cover; border-radius:6px; border:1px solid #E5E7EB; flex-shrink:0; }
        .ph { display:inline-block; width:36px; height:36px; border-radius:6px; background:#F3F4F6; border:1px solid #E5E7EB; text-align:center; line-height:36px; flex-shrink:0; }
        .pname { font-weight:600; color:#111827; }
        .ppart { color:#9CA3AF; font-size:10px; margin-top:1px; }
        .order-foot { padding:10px 14px; border-top:1px solid #E5E7EB; background:#FCFCFD; }
        .foot-row { display:flex; justify-content:space-between; padding:2px 0; font-size:12px; }
        .grand { margin-top:22px; padding:18px 20px; background:#FEF2F2; border:1px solid #FCA5A5; border-radius:12px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .grand-label { color:#991B1B; font-weight:700; font-size:13px; }
        .grand-value { color:#DC2626; font-weight:800; font-size:24px; white-space:nowrap; }
        .foot-note { margin-top:18px; text-align:center; color:#9CA3AF; font-size:10px; letter-spacing:0.5px; }
      </style></head>
      <body>
        <div class="top">
          <div>
            <div class="brand-name">${L.company}</div>
            <div class="badge">${L.title}</div>
          </div>
          ${invoiceSettings?.logoUrl
            ? `<img src="${invoiceSettings.logoUrl}" class="logo" onerror="this.style.display='none'"/>`
            : `<img src="data:image/png;base64,${LOGO_BASE64}" class="logo"/>`}
        </div>
        <div class="cust">
          <div><strong>${L.customer}:</strong> ${user?.name || 'N/A'}</div>
          ${user?.phone ? `<div><strong>${L.phone}:</strong> ${user.phone}</div>` : ''}
        </div>
        ${ordersHtml}
        <div class="grand">
          <span class="grand-label">${L.grandTotal}</span>
          <span class="grand-value">$${formatCurrency(user?.remaining || 0)} USD</span>
        </div>
        <div class="foot-note">${L.company}</div>
      </body>
      </html>
    `;
  };

  const shareCustomerInvoice = async () => {
    const user = selectedUnpaidUser;
    if (!user || !tenantId) return;
    try {
      const service = createTenantAdminService(tenantId);
      const settings = await fetchInvoiceSettings(service);
      const safeName = (user.name || 'customer').replace(/\s+/g, '_');
      const gen = async (lang: 'en' | 'ar' | 'ku') => {
        // Pre-embed each product image as base64 (expo-print won't load remote <img>).
        const urls = Array.from(new Set(
          (user.orders || [])
            .flatMap((o: any) => (Array.isArray(o.items) ? o.items : []))
            .map((it: any) => it.imageUrl || it.productSnapshot?.imageUrl)
            .filter(Boolean) as string[]
        ));
        const entries = await Promise.all(
          urls.map(async (u, i) => [u, await fetchInvoiceImageAsDataUri(u, i)] as const)
        );
        const imageMap: Record<string, string> = {};
        for (const [u, data] of entries) if (data) imageMap[u] = data;
        await generateAndSharePDF(generateCustomerUnpaidInvoiceHtml(user, settings, lang, imageMap), `Invoice_${safeName}`);
      };
      Alert.alert(
        t('admin.stockReport.selectLanguage', { defaultValue: 'Select Invoice Language' }),
        t('admin.stockReport.selectLanguageMessage', { defaultValue: 'Choose the language for the invoice' }),
        [
          { text: 'English', onPress: () => gen('en') },
          { text: 'العربية', onPress: () => gen('ar') },
          { text: 'Kurdî', onPress: () => gen('ku') },
          { text: t('admin.common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        ]
      );
    } catch (e) {
      Alert.alert(t('admin.common.error', { defaultValue: 'Error' }), 'Failed to generate invoice');
    }
  };

  return (
    <View style={styles.container}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('admin.analytics.reports', { defaultValue: 'Reports' })}</Text>
      
      <View style={styles.cardsRow}>
        <TouchableOpacity 
          style={[styles.reportCard, { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}
          onPress={handleRevenueReport}
          disabled={loadingType !== null}
        >
          {loadingType === 'revenue' ? (
            <ActivityIndicator color="#10B981" />
          ) : (
            <>
              <View style={[styles.cardIconBubble, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="cash-outline" size={22} color="#059669" />
              </View>
              <View style={styles.cardText}>
                <Text allowFontScaling={false} style={[styles.cardTitle, { color: '#065F46' }]}>{t('admin.stockReport.revenueReport', { defaultValue: 'Revenue Report' })}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reportCard, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
          onPress={() => handleUnpaidOrders(true)}
          disabled={loadingType !== null}
        >
          {loadingType === 'unpaid' ? (
            <ActivityIndicator color="#0EA5E9" />
          ) : (
            <>
              <View style={[styles.cardIconBubble, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="time-outline" size={22} color="#0284C7" />
              </View>
              <View style={styles.cardText}>
                <Text allowFontScaling={false} style={[styles.cardTitle, { color: '#075985' }]}>{t('admin.stockReport.unpaidOrders', { defaultValue: 'Unpaid Orders' })}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={unpaidModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}>
            <View style={[styles.modalHeader, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}>
              <TouchableOpacity onPress={() => setUnpaidModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
              <Text allowFontScaling={false} style={{ flex: 1, fontSize: 18, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' }}>
                {t('admin.stockReport.unpaidOrders', { defaultValue: 'Unpaid Orders' })}
              </Text>
              <TouchableOpacity onPress={() => { setUnpaidModalVisible(false); handleUnpaidOrders(false); }}>
                <Ionicons name="share-outline" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={React.useMemo(() => {
                const map = new Map<string, { id: string, name: string, phone: string, recipientName: string, remaining: number, firstOrderId: string, profileImageUrl: string | null }>();
                unpaidOrders.forEach(order => {
                  const remaining = (order.totalUSD || 0) - (order.amountPaidUSD || 0);
                  const name = order.shippingAddress?.fullName || 'Unknown';
                  const phone = order.shippingAddress?.phone || '';
                  const recipientName = order.shippingOfficeInfo?.recipientName || '';
                  const profileImageUrl = order.profileImageUrl || null;
                  const key = order.userId || name;
                  if (map.has(key)) {
                    map.get(key)!.remaining += remaining;
                    if (!map.get(key)!.phone && phone) map.get(key)!.phone = phone;
                    if (!map.get(key)!.recipientName && recipientName) map.get(key)!.recipientName = recipientName;
                    if (!map.get(key)!.profileImageUrl && profileImageUrl) map.get(key)!.profileImageUrl = profileImageUrl;
                  } else {
                    map.set(key, { id: key, name, phone, recipientName, remaining, firstOrderId: order.id, profileImageUrl });
                  }
                });
                return Array.from(map.values());
              }, [unpaidOrders])}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => {
                return (
                  <TouchableOpacity 
                    style={[styles.unpaidCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF', alignItems: 'center' }]}
                    onPress={() => {
                      const userOrders = unpaidOrders.filter(o => (o.userId || o.shippingAddress?.fullName || 'Unknown') === item.id);
                      setSelectedUnpaidUser({ ...item, orders: userOrders });
                    }}
                  >
                    {item.profileImageUrl ? (
                      <Image 
                        source={{ uri: item.profileImageUrl }} 
                        style={{width: 48, height: 48, borderRadius: 24, marginRight: 14}}
                      />
                    ) : (
                      <View style={{width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAB308', justifyContent: 'center', alignItems: 'center', marginRight: 14, shadowColor: '#EAB308', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }}}>
                        <Text allowFontScaling={false} style={{color: 'white', fontWeight: 'bold', fontSize: 20}}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    
                    <View style={{flex: 1, justifyContent: 'center'}}>
                      <Text allowFontScaling={false} style={{ fontWeight: 'bold', color: theme.colors.text, fontSize: 16, textAlign: 'left' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.name}</Text>
                      
                      {item.recipientName ? (
                        <Text allowFontScaling={false} style={{ color: theme.colors.primary, fontSize: 13, marginTop: 2, fontWeight: '600', textAlign: 'left' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>🏢 {item.recipientName}</Text>
                      ) : null}

                      {item.phone ? (
                        <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 2, fontWeight: '500', textAlign: 'left' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.phone}</Text>
                      ) : null}

                      <Text allowFontScaling={false} style={{ color: '#EF4444', fontWeight: '900', fontSize: 16, marginTop: 6, textAlign: 'left' }}>${formatCurrency(item.remaining)} USD</Text>
                    </View>

                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
      
      {/* Luxury User Unpaid Detail Modal */}
      <Modal visible={!!selectedUnpaidUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModalContent, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}>
            {/* Top bar */}
            <View style={[styles.detailModalHeader, { borderBottomColor: theme.colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedUnpaidUser(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>
                {t('admin.stockReport.customer', { defaultValue: 'Customer' })}
              </Text>
              <TouchableOpacity onPress={shareCustomerInvoice} style={{ padding: 4 }}>
                <Ionicons name="share-outline" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Profile + total */}
            <View style={[styles.detailTotalBox, { backgroundColor: isDark ? '#3f1a1a' : '#fef2f2' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginBottom: 18 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#EAB308', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{(selectedUnpaidUser?.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }} numberOfLines={1}>{selectedUnpaidUser?.name || '—'}</Text>
                  {selectedUnpaidUser?.phone ? (
                    <Text allowFontScaling={false} style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 1 }} numberOfLines={1}>{selectedUnpaidUser.phone}</Text>
                  ) : null}
                </View>
              </View>
              <Text allowFontScaling={false} style={{ color: isDark ? '#fca5a5' : '#ef4444', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 }}>
                {t('admin.stockReport.totalUnpaidBalance', { defaultValue: 'Total Unpaid Balance' })}
              </Text>
              <Text allowFontScaling={false} style={{ color: '#ef4444', fontSize: 30, fontWeight: '900', marginTop: 2 }}>
                ${selectedUnpaidUser?.remaining ? formatCurrency(selectedUnpaidUser.remaining) : '0.00'} USD
              </Text>
            </View>

            {/* Orders List */}
            <ScrollView style={{ width: '100%', paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 20, paddingTop: 12 }}>
              <Text allowFontScaling={false} style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('admin.stockReport.unpaidOrders', { defaultValue: 'Unpaid Orders' })} · {selectedUnpaidUser?.orders?.length || 0}
              </Text>
              {selectedUnpaidUser?.orders?.map((order: any, index: number) => {
                const remaining = (order.totalUSD || 0) - (order.amountPaidUSD || 0);
                const orderNum = order.orderNumber?.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '') || 'N/A';

                let dateStr = 'N/A';
                if (order.createdAt) {
                  if (typeof order.createdAt.toDate === 'function') {
                    dateStr = order.createdAt.toDate().toLocaleDateString();
                  } else if (order.createdAt.seconds) {
                    dateStr = new Date(order.createdAt.seconds * 1000).toLocaleDateString();
                  } else {
                    try { dateStr = new Date(order.createdAt).toLocaleDateString(); } catch (e) {}
                  }
                }

                return (
                  <TouchableOpacity
                    key={order.id || index}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!order.id) return;
                      setSelectedUnpaidUser(null);
                      setUnpaidModalVisible(false);
                      navigation.navigate('Main', { screen: 'AdminOrders', params: { orderId: order.id } });
                    }}
                    style={[styles.detailOrderRow, { borderBottomColor: isDark ? '#333' : '#f1f5f9' }]}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name="cart-outline" size={18} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 14.5, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>{orderNum}</Text>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>{dateStr}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', minWidth: 84 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 15.5, fontWeight: '800', color: '#EF4444' }} numberOfLines={1}>${remaining.toFixed(2)}</Text>
                      <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 }} numberOfLines={1}>USD</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} style={{ marginLeft: 6, opacity: 0.5 }} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.detailModalFooter, { borderTopColor: theme.colors.border, flexDirection: 'row', gap: 12 }]}>
              <TouchableOpacity
                style={[styles.luxuryBtn, { flex: 1, flexDirection: 'row', backgroundColor: theme.colors.primary + '14', borderWidth: 1.5, borderColor: theme.colors.primary + '55' }]}
                activeOpacity={0.85}
                onPress={shareCustomerInvoice}
              >
                <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} style={{ marginRight: 7 }} />
                <Text allowFontScaling={false} style={[styles.luxuryBtnText, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {t('admin.stockReport.invoice', { defaultValue: 'Invoice' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.luxuryBtn, { flex: 1, flexDirection: 'row', backgroundColor: theme.colors.primary }]}
                activeOpacity={0.9}
                onPress={() => {
                  const firstOrderId = selectedUnpaidUser?.firstOrderId;
                  setSelectedUnpaidUser(null);
                  setUnpaidModalVisible(false);
                  if (firstOrderId) {
                    navigation.navigate('Main', { screen: 'AdminOrders', params: { orderId: firstOrderId } });
                  }
                }}
              >
                <Ionicons name="open-outline" size={18} color="#fff" style={{ marginRight: 7 }} />
                <Text allowFontScaling={false} style={styles.luxuryBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {t('admin.stockReport.viewLatestOrder', { defaultValue: 'View Latest Order' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  reportCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 80,
  },
  cardIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: Dimensions.get('window').height * 0.85,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  unpaidCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  detailModalContent: {
    width: '90%',
    maxHeight: '80%',
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  detailTotalBox: {
    padding: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  detailOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  detailModalFooter: {
    padding: 20,
    borderTopWidth: 1,
  },
  luxuryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  luxuryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  }
});
