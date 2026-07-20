import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Modal,
  FlatList,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { createTenantAdminService, InvoiceSettings } from '../../services/tenantAdminService';
import { SPACING } from '../../constants/theme';
import { BRAND } from '../../constants/config';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { LOGO_BASE64 } from '../../constants/logoBase64';
import { formatPrice } from '../../utils/currency';

// Calculate effective stock (Main + Size + Color variations)
//
// Every term is Number()-coerced: variations / color_variations are JSONB and reach
// here unmapped, so a website-written stockQuantity can be a string and `sum + "0"`
// concatenates. This matters most on this screen. A variation product (which keeps
// stock_qty = 0 by design) with one string "0" variation produced the string "0000",
// and because the filters use strict equality, `"0000" === 0` is false and `"0000" > 0`
// is false — the product vanished from Out of Stock, In Stock and Low Stock alike,
// appearing only under All Products. The admin then sent the supplier a reorder
// invoice with a genuinely out-of-stock item silently missing.
//
// The Number()-coerced version of this helper already exists in AdminProductsScreen
// and ReportsGenerator; this copy was the one that was missed.
const getEffectiveStock = (p: any) => {
  const mainStock = Number(p?.stockQty) || 0;
  const sizeStock = (Array.isArray(p?.variations) ? p.variations : [])
    .reduce((sum: number, v: any) => sum + (Number(v?.stockQuantity) || 0), 0);
  const colorStock = (Array.isArray(p?.colorVariations) ? p.colorVariations : [])
    .reduce((sum: number, v: any) => sum + (Number(v?.stockQuantity) || 0), 0);
  return mainStock + sizeStock + colorStock;
};

type ReportFilter = 'out_of_stock' | 'low_stock' | 'in_stock' | 'coming_soon' | 'on_the_way' | 'all' | 'unpaid_orders';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

const AdminStockReportScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);
  const [unpaidModalVisible, setUnpaidModalVisible] = useState(false);

  // Load products and invoice settings
  const loadData = useCallback(async () => {
    if (!tenantId) {
      if (!tenantLoading) setLoading(false);
      return;
    }
    try {
      const service = createTenantAdminService(tenantId);
      const [productsData, settingsData, ordersData] = await Promise.all([
        service.getAllProducts(),
        service.getSettings('invoiceSettings') as Promise<InvoiceSettings | null>,
        service.getAllOrders(1000)
      ]);
      setProducts(productsData as any[]);
      setOrders(ordersData as any[]);
      if (settingsData) setInvoiceSettings(settingsData);
    } catch (error) {
      // silently fail
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('admin.stockReport.loadFailed', { defaultValue: 'Failed to load products' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, tenantLoading, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Compute stats
  const outOfStockProducts = products.filter(p => getEffectiveStock(p) === 0);
  const inStockProducts = products.filter(p => getEffectiveStock(p) > 0);
  const comingSoonProducts = products.filter(p => p.status === 'coming_soon');
  const onTheWayProducts = products.filter(p => p.status === 'on_the_way');
  const lowStockProducts = products.filter(p => {
    const stock = getEffectiveStock(p);
    const threshold = p.initialStock && p.initialStock > 0 ? p.initialStock : 5;
    return stock > 0 && stock <= threshold;
  });
  

  const unpaidOrders = orders.filter(o => {
    // Partner-tagged orders are the partner's business (collected/settled on the partner side),
    // so their outstanding balance is not the owner's receivable.
    if ((o as any).partnerId) return false;
    const total = o.totalUSD || 0;
    const paid = o.amountPaidUSD || 0;

    // Check if fully paid (safeguard against float issues, difference < 0.01 means paid)
    if (paid >= total - 0.01) {
      return false;
    }

    // Receivables = DELIVERED-but-unpaid only (money owed for goods already
    // received). Pending/processing orders aren't collectable yet under COD, so
    // they're excluded — consistent with the analytics card and the unpaid report.
    const remaining = Math.round((total - paid) * 100) / 100;
    return String(o.status || '').toLowerCase() === 'delivered' && remaining > 0.01;
  });
  
  const totalUnpaidAmountUSD = unpaidOrders.reduce((sum, o) => {
    const remaining = Math.round(((o.totalUSD || 0) - (o.amountPaidUSD || 0)) * 100) / 100;
    return sum + remaining;
  }, 0);


  // Get filtered products
  const getFilteredProducts = (filter: ReportFilter) => {
    switch (filter) {
      case 'out_of_stock':
        return outOfStockProducts;
      case 'low_stock':
        return lowStockProducts;
      case 'in_stock':
        return inStockProducts;
      case 'coming_soon':
        return comingSoonProducts;
      case 'on_the_way':
        return onTheWayProducts;
      case 'all':
        return products;
      default:
        return products;
    }
  };

  // Get report title
  const getReportTitle = (filter: ReportFilter, lang: 'en' | 'ar' | 'ku') => {
    const titles = {
      out_of_stock: { en: 'Out of Stock Items', ar: 'العناصر المنفذة من المخزون', ku: 'کاڵا نەماوەکان' },
      low_stock: { en: 'Low Stock Items', ar: 'عناصر المخزون المنخفض', ku: 'کاڵا کەمەکان' },
      in_stock: { en: 'In Stock Items', ar: 'العناصر المتوفرة', ku: 'کاڵا بەردەستەکان' },
      coming_soon: { en: 'Coming Soon Items', ar: 'قريباً', ku: 'بەم زووانە' },
      on_the_way: { en: 'On the Way Items', ar: 'في الطريق', ku: 'لە ڕێگایە' },
      all: { en: 'All Products Inventory', ar: 'جرد جميع المنتجات', ku: 'هەموو بەرهەمەکان' },
      unpaid_orders: { en: 'Unpaid Orders', ar: 'الطلبات غير المدفوعة', ku: 'داواکارییە نەدراوەکان' },
    };
    return titles[filter][lang];
  };

  // Generate invoice HTML (matching AdminOrdersScreen style)
  const generateStockInvoiceHtml = (filter: ReportFilter, lang: 'en' | 'ar' | 'ku') => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const filteredProducts = getFilteredProducts(filter);
    const reportTitle = getReportTitle(filter, lang);
    const today = new Date();
    const dateStr = today.toLocaleDateString(
      lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ',
      { year: 'numeric', month: 'long', day: 'numeric' }
    );

    const labels = {
      en: {
        companyName: invoiceSettings?.companyName || BRAND.name,
        stockReport: 'STOCK REPORT',
        reorderInvoice: 'Reorder Invoice',
        date: 'Date:',
        totalItems: 'Total Items:',
        product: 'Product',
        partNumber: 'Part #',
        currentStock: 'Stock',
        category: 'Category',
        status: 'Status',
        outOfStock: 'Out of Stock',
        lowStock: 'Low Stock',
        inStock: 'In Stock',
        generatedBy: 'Generated by',
        forReorder: 'This report is generated for reordering purposes.',
        noItems: 'No items found for this filter.',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
      ar: {
        companyName: invoiceSettings?.companyNameAr || BRAND.name,
        stockReport: 'تقرير المخزون',
        reorderInvoice: 'فاتورة إعادة الطلب',
        date: 'التاريخ:',
        totalItems: 'إجمالي العناصر:',
        product: 'المنتج',
        partNumber: 'رقم القطعة',
        currentStock: 'المخزون',
        category: 'الفئة',
        status: 'الحالة',
        outOfStock: 'نفذ المخزون',
        lowStock: 'مخزون منخفض',
        inStock: 'متوفر',
        generatedBy: 'تم إنشاؤه بواسطة',
        forReorder: 'تم إنشاء هذا التقرير لأغراض إعادة الطلب.',
        noItems: 'لا توجد عناصر لهذا التصفية.',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.addressAr || invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
      ku: {
        companyName: invoiceSettings?.companyNameKu || BRAND.name,
        stockReport: 'ڕاپۆرتی کۆگا',
        reorderInvoice: 'پسووڵەی داواکاریی دووبارە',
        date: 'بەروار:',
        totalItems: 'کۆی کاڵاکان:',
        product: 'بەرهەم',
        partNumber: 'ژمارەی پارچە',
        currentStock: 'کۆگا',
        category: 'جۆر',
        status: 'دۆخ',
        outOfStock: 'نەماوە',
        lowStock: 'کەمە',
        inStock: 'بەردەستە',
        generatedBy: 'دروستکراوە لەلایەن',
        forReorder: 'ئەم ڕاپۆرتە بۆ داواکاریی دووبارە دروستکراوە.',
        noItems: 'هیچ کاڵایەک نەدۆزرایەوە بۆ ئەم فلتەرە.',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.addressKu || invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
    };

    const L = labels[lang];
    const invoiceLogo = invoiceSettings?.logoUrl || '';

    // Build product rows
    const itemsHtml = filteredProducts.length > 0
      ? filteredProducts.map((product, index) => {
          const stock = getEffectiveStock(product);
          const threshold = product.initialStock && product.initialStock > 0 ? product.initialStock : 5;
          let statusText = L.inStock;
          let statusColor = '#10B981';
          if (stock === 0) {
            statusText = L.outOfStock;
            statusColor = '#EF4444';
          } else if (stock <= threshold) {
            statusText = L.lowStock;
            statusColor = '#F59E0B';
          }

          const imageUrl = product.imageUrls?.[0] || '';
          const imageHtml = imageUrl
            ? `<img src="${imageUrl}" alt="${product.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e0e0e0;" onerror="this.style.display='none'" />`
            : `<div style="width: 40px; height: 40px; background: #f5f5f5; border-radius: 6px; display: flex; align-items: center; justify-content: center; border: 1px solid #e0e0e0;"><span style="font-size: 16px;">📦</span></div>`;

          const productName = lang === 'ar' && product.nameAr
            ? product.nameAr
            : lang === 'ku' && product.nameKu
            ? product.nameKu
            : product.name || 'N/A';

          return `
            <tr style="background: ${index % 2 === 0 ? '#fff' : '#F8F9FC'};">
              <td style="padding: 8px; border-bottom: 1px solid #eee;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${imageHtml}
                  <div style="flex: 1;">
                    <strong style="font-size: 11px; color: #1F2937;">${product.partNumber || 'N/A'}</strong>
                  </div>
                </div>
              </td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle; font-size: 11px;">
                ${(() => {
                  const categoryName = product.category || '-';
                  if (categoryName === '-') return '-';
                  
                  // Category translations matching CategoriesScreen
                  if (lang === 'ar') {
                    const dictAr: Record<string, string> = {
                      'Engine Parts': 'أجزاء المحرك',
                      'Brake System': 'نظام الفرامل',
                      'Transmission': 'ناقل الحركة',
                      'Electrical': 'الكهرباء',
                      'Suspension': 'نظام التعليق',
                      'Body Parts': 'أجزاء الهيكل',
                      'Cabin & Interior': 'المقصورة والداخلية',
                      'Cooling System': 'نظام التبريد',
                      'Filters': 'فلاتر',
                      'Oils & Fluids': 'زيوت وسوائل',
                      'Accessories': 'إكسسوارات',
                      'Other': 'أخرى'
                    };
                    return dictAr[categoryName] || categoryName;
                  }
                  
                  if (lang === 'ku') {
                    const dictKu: Record<string, string> = {
                      'Engine Parts': 'پارچەکانی بزوێنەر',
                      'Brake System': 'سیستەمی وەستان',
                      'Transmission': 'گێڕ',
                      'Electrical': 'کارەبایی',
                      'Suspension': 'سیستەمی هەڵواسراو',
                      'Body Parts': 'پارچەکانی لاشە',
                      'Cabin & Interior': 'ناوەوەی ئۆتۆمبێل',
                      'Cooling System': 'سیستەمی ساردکردنەوە',
                      'Filters': 'فلتەرەکان',
                      'Oils & Fluids': 'ڕۆن و شلەمەنی',
                      'Accessories': 'ئێکسسوارات',
                      'Other': 'تر'
                    };
                    return dictKu[categoryName] || categoryName;
                  }
                  
                  return categoryName;
                })()}
              </td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle;">
                <strong style="font-size: 12px; color: ${statusColor};">${stock}</strong>
              </td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; vertical-align: middle;">
                <span style="display: inline-block; background: ${statusColor}15; color: ${statusColor}; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600;">${statusText}</span>
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #888; font-size: 12px;">${L.noItems}</td></tr>`;

    let summaryColor = '#3B82F6';
    if (filter === 'out_of_stock') summaryColor = '#EF4444';
    else if (filter === 'low_stock') summaryColor = '#F59E0B';
    else if (filter === 'in_stock') summaryColor = '#10B981';
    else if (filter === 'coming_soon') summaryColor = '#8B5CF6';
    else if (filter === 'on_the_way') summaryColor = '#0EA5E9';

    const summaryBoxHtml = `
      <div class="summary-box">
        <div class="summary-item">
          <div class="summary-number" style="color: ${summaryColor};">${filteredProducts.length}</div>
          <div class="summary-label">${reportTitle}</div>
        </div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html dir="${direction}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; color: #333; background: #fff; font-size: 11px; direction: ${direction}; }
          .header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #FF7816; }
          .logo { font-size: 16px; font-weight: bold; color: #FF7816; margin-bottom: 2px; }
          .report-title { font-size: 14px; color: #1F2937; font-weight: 300; letter-spacing: 2px; }
          .report-subtitle { font-size: 11px; color: #FF7816; font-weight: 600; margin-top: 4px; }
          .order-info { display: flex; justify-content: center; gap: 15px; margin-bottom: 12px; flex-wrap: wrap; }
          .info-box { background: #F8F9FC; padding: 6px 12px; border-radius: 6px; }
          .info-label { font-size: 9px; color: #666; font-weight: 500; }
          .info-value { font-size: 11px; font-weight: 600; color: #1F2937; }
          .section-title { font-size: 10px; font-weight: 600; color: #FF7816; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; text-align: ${textAlign}; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #1F2937; color: white; padding: 6px 4px; text-align: ${textAlign}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
          th:nth-child(n+2) { text-align: center; }
          td { padding: 6px 4px; border-bottom: 1px solid #eee; font-size: 10px; }
          .summary-box { background: #F8F9FC; border-radius: 8px; padding: 12px; margin-bottom: 15px; display: flex; justify-content: space-around; text-align: center; }
          .summary-item { }
          .summary-number { font-size: 18px; font-weight: bold; }
          .summary-label { font-size: 9px; color: #666; margin-top: 2px; }
          .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; color: #888; font-size: 9px; }
          .reorder-note { background: #FFF7ED; border: 1px solid #FFEDD5; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 10px; color: #92400E; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          ${invoiceLogo
            ? `<img src="${invoiceLogo}" style="height: 50px; margin-bottom: 5px;" alt="Logo" onerror="this.style.display='none'" />`
            : LOGO_BASE64
              ? `<img src="data:image/png;base64,${LOGO_BASE64}" style="height: 50px; margin-bottom: 5px;" alt="Logo" />`
              : ''
          }
          <div class="logo">${L.companyName}</div>
          <div class="report-title">${L.stockReport}</div>
          <div class="report-subtitle">${reportTitle}</div>
        </div>

        <div class="order-info">
          <div class="info-box"><span class="info-label">${L.date}</span> <span class="info-value">${dateStr}</span></div>
          <div class="info-box"><span class="info-label">${L.totalItems}</span> <span class="info-value">${filteredProducts.length}</span></div>
        </div>

        <div class="reorder-note">
          📋 ${L.forReorder}
        </div>

        ${summaryBoxHtml}

        <div class="section-title">📦 ${reportTitle}</div>
        <table>
          <thead>
            <tr>
              <th>${L.product}</th>
              <th>${L.category}</th>
              <th>${L.currentStock}</th>
              <th>${L.status}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="footer">
          <p><strong>${L.companyName}</strong></p>
          ${L.phone ? `<p style="margin-top: 4px;">📞 ${L.phone}</p>` : ''}
          <p style="margin-top: 4px;">📧 ${L.email}</p>
          ${L.address ? `<p style="margin-top: 4px;">📍 ${L.address}</p>` : ''}
          ${L.website ? `<p style="margin-top: 4px;">🌐 ${L.website}</p>` : ''}
          <p style="margin-top: 8px; color: #FF7816; font-weight: 600;">${L.reorderInvoice}</p>
        </div>
      </body>
      </html>
    `;
  };

  const generateLuxuryRevenueInvoiceHtml = (lang: 'en' | 'ar' | 'ku') => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const today = new Date();
    const dateStr = today.toLocaleDateString(
      lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ',
      { year: 'numeric', month: 'long', day: 'numeric' }
    );

    const labels = {
      en: {
        companyName: invoiceSettings?.companyName || BRAND.name,
        reportTitle: 'REVENUE REPORT',
        date: 'Date:',
        totalItems: 'Total Items:',
        product: 'Product',
        category: 'Category',
        stock: 'Stock',
        totalStockHistory: 'Units Sold',
        buyPrice: 'Buy Price',
        sellPrice: 'Sell Price',
        revenue: 'Revenue',
        profit: 'Profit',
        totalCost: 'Total Cost',
        totalRevenue: 'Total Revenue',
        totalProfit: 'Total Profit',
        generatedBy: 'Generated by',
        noItems: 'No items found.',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
      ar: {
        companyName: invoiceSettings?.companyNameAr || BRAND.name,
        reportTitle: 'تقرير الإيرادات',
        date: 'التاريخ:',
        totalItems: 'إجمالي العناصر:',
        product: 'المنتج',
        category: 'الفئة',
        stock: 'المخزون',
        totalStockHistory: 'الكمية المباعة',
        buyPrice: 'سعر الشراء',
        sellPrice: 'سعر البيع',
        revenue: 'الإيرادات',
        profit: 'الربح',
        totalCost: 'التكلفة الإجمالية',
        totalRevenue: 'إجمالي الإيرادات',
        totalProfit: 'إجمالي الربح',
        generatedBy: 'تم إنشاؤه بواسطة',
        noItems: 'لا توجد عناصر.',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.addressAr || invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
      ku: {
        companyName: invoiceSettings?.companyNameKu || BRAND.name,
        reportTitle: 'ڕاپۆرتی داهات',
        date: 'بەروار:',
        totalItems: 'کۆی کاڵاکان:',
        product: 'بەرهەم',
        category: 'جۆر',
        stock: 'کۆگا',
        totalStockHistory: 'بڕی فرۆشراو',
        buyPrice: 'نرخی کڕین',
        sellPrice: 'نرخی فرۆشتن',
        revenue: 'داهات',
        profit: 'قازانج',
        totalCost: 'کۆی خەرجی',
        totalRevenue: 'کۆی داهات',
        totalProfit: 'کۆی قازانج',
        generatedBy: 'دروستکراوە لەلایەن',
        noItems: 'هیچ کاڵایەک نەدۆزرایەوە.',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.addressKu || invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
    };

    const L = labels[lang];
    const invoiceLogo = invoiceSettings?.logoUrl || '';

    let grandTotalCost = 0;
    let grandTotalRevenue = 0;
    let grandTotalProfit = 0;

    // Filter out products with 0 stock for the revenue calculation to be more meaningful, or keep them?
    // Let's keep all and just calculate based on current stock.
    const formatCurrency = (val: number) => {
      // Always enforce English numerals
      return val % 1 === 0 ? val.toLocaleString('en-US') : val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    };

    // ACTUAL SALES per product from DELIVERED order items: units sold and cost
    // (Σ purchasePrice×qty). Revenue is valued at the WHOLESALE tier (lowest priceTiers
    // price, else base) and EXCLUDES products currently shared with a partner
    // (extra_data.coAdminIds non-empty) — the same owner rule the Analytics dashboard and
    // main Revenue Report use. Un-sharing a product restores it and its full history here.
    const wholesaleUnitPrice = (p: any): number => {
      const tiers = (Array.isArray(p?.priceTiers) ? p.priceTiers : [])
        .filter((t: any) => t && t.minQty > 0 && t.priceUSD > 0);
      return tiers.length ? Math.min(...tiers.map((t: any) => Number(t.priceUSD))) : (Number(p?.priceUSD) || 0);
    };
    const productMap: Record<string, any> = {};
    products.forEach((p: any) => { if (p?.id) productMap[p.id] = p; });

    const salesMap: Record<string, { qty: number; cost: number }> = {};
    orders.forEach((order: any) => {
      if (String(order.status || '').toLowerCase() !== 'delivered') return;
      const isPartnerOrder = !!order.partnerId;
      (Array.isArray(order.items) ? order.items : []).forEach((item: any) => {
        const id = item.productId;
        if (!id) return;
        // In a partner-tagged order, only count lines that resolve to a known owner product.
        if (isPartnerOrder && !productMap[id]) return;
        // A product currently shared with a partner is the partner's — exclude its sales.
        if (Array.isArray(productMap[id]?.coAdminIds) && productMap[id].coAdminIds.length) return;
        const qty = Number(item.quantity) || 0;
        if (!salesMap[id]) salesMap[id] = { qty: 0, cost: 0 };
        salesMap[id].qty += qty;
        salesMap[id].cost += (Number(item.purchasePrice) || 0) * qty;
      });
    });

    const soldProducts = products.filter((p: any) => (salesMap[p.id]?.qty || 0) > 0);
    const itemsHtml = soldProducts.length > 0
      ? soldProducts.map((product, index) => {
          const stock = getEffectiveStock(product);
          const sold = salesMap[product.id] || { qty: 0, cost: 0 };
          const soldQty = sold.qty;
          const itemCost = sold.cost;                                // actual COGS: Σ purchasePrice×qty
          const itemRevenue = soldQty * wholesaleUnitPrice(product); // units × WHOLESALE
          const itemProfit = itemRevenue - itemCost;
          const buyPrice = soldQty > 0 ? itemCost / soldQty : (product.purchasePrice || 0);
          const sellPrice = soldQty > 0 ? itemRevenue / soldQty : wholesaleUnitPrice(product);

          grandTotalCost += itemCost;
          grandTotalRevenue += itemRevenue;
          grandTotalProfit += itemProfit;

          const imageUrl = product.imageUrls?.[0] || '';
          const imageHtml = imageUrl
            ? `<img src="${imageUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; border: 1px solid #E5E7EB;" onerror="this.style.display='none'" />`
            : `<div style="width: 32px; height: 32px; background: #F3F4F6; border-radius: 6px; border: 1px solid #E5E7EB; text-align: center; line-height: 32px; font-size: 14px;">📦</div>`;

          const productName = lang === 'ar' && product.nameAr
            ? product.nameAr
            : lang === 'ku' && product.nameKu
            ? product.nameKu
            : product.name || 'N/A';

          return `
            <tr>
              <td style="padding: 10px 6px; border-bottom: 1px solid #f1f5f9;">
                <table style="border: none; margin: 0; width: 100%; background: transparent;">
                  <tr>
                    <td style="width: 38px; padding: 0; border: none;">
                      ${imageHtml}
                    </td>
                    <td style="padding: 0; padding-left: 6px; border: none; vertical-align: middle; text-align: ${textAlign};">
                      <div style="font-weight: 700; color: #0f172a; font-size: 10px; margin-bottom: 2px; line-height: 1.2; word-break: break-word;">${productName}</div>
                      <div style="color: #64748b; font-size: 9px; font-family: monospace; letter-spacing: 0.2px;">${product.partNumber || 'N/A'}</div>
                    </td>
                  </tr>
                </table>
              </td>
              <td class="center" style="color: #475569; font-weight: 600;">${soldQty.toLocaleString('en-US')}</td>
              <td class="center" style="color: #0f172a; font-weight: 700;">${stock.toLocaleString('en-US')}</td>
              <td class="center" style="color: #ef4444; font-weight: 600;">$${formatCurrency(buyPrice)}</td>
              <td class="center" style="color: #10b981; font-weight: 600;">$${formatCurrency(sellPrice)}</td>
              <td class="center"><span class="price-badge badge-cost">$${formatCurrency(itemCost)}</span></td>
              <td class="center"><span class="price-badge badge-rev">$${formatCurrency(itemRevenue)}</span></td>
              <td class="right"><span class="price-badge badge-profit">$${formatCurrency(itemProfit)}</span></td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="8" style="padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; font-weight: 500;">${L.noItems}</td></tr>`;

    return `
      <!DOCTYPE html>
      <html dir="${direction}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          @page { size: landscape; margin: 10mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; padding: 0; margin: 0; background: #f8fafc; color: #334155; font-size: 11px; direction: ${direction}; }
          
          .container { max-width: 100%; margin: 0 auto; background: #ffffff; padding: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          
          /* Header Gradient */
          .header-banner { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 15px 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.2); }
          table.header-table { width: 100%; border: none; background: transparent; }
          table.header-table td { border: none; padding: 0; vertical-align: middle; }
          .logo-text { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 2px; color: #f8fafc; }
          .logo-sub { font-size: 9px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
          .report-title { font-size: 18px; font-weight: 800; color: #10B981; letter-spacing: -0.5px; text-transform: uppercase; }
          .report-date { font-size: 10px; color: #cbd5e1; margin-top: 4px; font-weight: 500; }
          
          /* Summary Cards using table for perfect PDF rendering */
          table.info-cards { width: 100%; border-collapse: separate; border-spacing: 10px 0; margin-left: -10px; margin-right: -10px; margin-bottom: 20px; }
          table.info-cards td { padding: 12px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); width: 33.33%; border: 1px solid rgba(0,0,0,0.05); }
          td.card-cost { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-color: #fecaca; }
          td.card-revenue { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-color: #a7f3d0; }
          td.card-profit { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-color: #fde68a; }
          
          .info-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          td.card-cost .info-label { color: #dc2626; }
          td.card-revenue .info-label { color: #059669; }
          td.card-profit .info-label { color: #d97706; }
          
          .info-value { font-size: 18px; font-weight: 800; }
          td.card-cost .info-value { color: #991b1b; }
          td.card-revenue .info-value { color: #065f46; }
          td.card-profit .info-value { color: #92400e; }
          
          /* Table */
          .table-container { border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
          table.main-table { width: 100%; border-collapse: collapse; background: white; table-layout: fixed; }
          table.main-table th { background: #1e293b; color: #f8fafc; padding: 10px 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; text-align: ${textAlign}; border-bottom: none; word-break: break-word; }
          table.main-table th.center { text-align: center; }
          table.main-table th.right { text-align: right; }
          
          table.main-table td { padding: 8px 4px; border-bottom: 1px solid #f1f5f9; font-size: 10px; vertical-align: middle; word-break: break-word; }
          table.main-table tr:nth-child(even) { background-color: #f8fafc; }
          table.main-table tr:last-child td { border-bottom: none; }
          table.main-table td.center { text-align: center; }
          table.main-table td.right { text-align: right; }
          
          /* Badges in table */
          .price-badge { font-weight: 700; padding: 3px 5px; border-radius: 6px; display: inline-block; letter-spacing: -0.2px; font-size: 9px; white-space: nowrap; }
          .badge-cost { background: #fee2e2; color: #dc2626; }
          .badge-rev { background: #d1fae5; color: #059669; }
          .badge-profit { background: #fef3c7; color: #d97706; }
          
          /* Footer */
          .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 2px dashed #e2e8f0; color: #64748b; font-size: 10px; }
          .footer-grid { display: inline-table; margin-top: 8px; }
          .footer-grid td { padding: 0 10px; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header Banner -->
          <div class="header-banner">
            <table class="header-table">
              <tr>
                <td style="width: 60px;">
                  ${invoiceLogo
                    ? `<img src="${invoiceLogo}" style="height: 56px; width: 56px; object-fit: contain; border-radius: 12px; background: white; padding: 4px;" alt="Logo" onerror="this.style.display='none'" />`
                    : LOGO_BASE64
                      ? `<img src="data:image/png;base64,${LOGO_BASE64}" style="height: 56px; width: 56px; object-fit: contain; border-radius: 12px; background: white; padding: 4px;" alt="Logo" />`
                      : `<div style="height: 56px; width: 56px; background: #10B981; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold;">H</div>`
                  }
                </td>
                <td style="text-align: ${textAlign}; padding: 0 15px;">
                  <div class="logo-text">${L.companyName}</div>
                  <div class="logo-sub">${L.phone}</div>
                </td>
                <td style="text-align: ${lang === 'ar' || lang === 'ku' ? 'left' : 'right'};">
                  <div class="report-title">${L.reportTitle}</div>
                  <div class="report-date">${L.date} ${dateStr}</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Summary Cards -->
          <table class="info-cards">
            <tr>
              <td class="card-cost">
                <div class="info-label">${L.totalCost}</div>
                <div class="info-value">$${formatCurrency(grandTotalCost)}</div>
              </td>
              <td class="card-revenue">
                <div class="info-label">${L.totalRevenue}</div>
                <div class="info-value">$${formatCurrency(grandTotalRevenue)}</div>
              </td>
              <td class="card-profit">
                <div class="info-label">${L.totalProfit}</div>
                <div class="info-value">$${formatCurrency(grandTotalProfit)}</div>
              </td>
            </tr>
          </table>

          <!-- Main Table -->
          <div class="table-container">
            <table class="main-table">
              <thead>
                <tr>
                  <th style="width: 25%;">${L.product}</th>
                  <th class="center" style="width: 11%;">${L.totalStockHistory}</th>
                  <th class="center" style="width: 10%;">${L.stock}</th>
                  <th class="center" style="width: 10%;">${L.buyPrice}</th>
                  <th class="center" style="width: 10%;">${L.sellPrice}</th>
                  <th class="center" style="width: 11%;">${L.totalCost}</th>
                  <th class="center" style="width: 11%;">${L.revenue}</th>
                  <th class="right" style="width: 12%;">${L.profit}</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p style="font-weight: 700; color: #334155; font-size: 14px; margin-bottom: 10px;">${L.companyName}</p>
            <table class="footer-grid" align="center">
              <tr>
                ${L.phone ? `<td>📞 ${L.phone}</td>` : ''}
                ${L.email ? `<td>📧 ${L.email}</td>` : ''}
                ${L.address ? `<td>📍 ${L.address}</td>` : ''}
              </tr>
            </table>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const generateUnpaidOrdersInvoiceHtml = (lang: 'en' | 'ar' | 'ku') => {
    const isRTL = lang === 'ar' || lang === 'ku';
    const direction = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const reportTitle = getReportTitle('unpaid_orders', lang);
    const today = new Date();
    const dateStr = today.toLocaleDateString(
      lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ',
      { year: 'numeric', month: 'long', day: 'numeric' }
    );

    const labels = {
      en: {
        companyName: invoiceSettings?.companyName || BRAND.name,
        date: 'Date:',
        orderId: 'Order ID',
        customer: 'Customer',
        total: 'Total',
        paid: 'Paid',
        remaining: 'Remaining',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
      ar: {
        companyName: invoiceSettings?.companyNameAr || BRAND.name,
        date: 'التاريخ:',
        orderId: 'رقم الطلب',
        customer: 'العميل',
        total: 'المجموع',
        paid: 'المدفوع',
        remaining: 'المتبقي',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.addressAr || invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
      ku: {
        companyName: invoiceSettings?.companyNameKu || BRAND.name,
        date: 'بەروار:',
        orderId: 'ژمارەی داواکاری',
        customer: 'کڕیار',
        total: 'کۆی گشتی',
        paid: 'دراو',
        remaining: 'ماوە',
        phone: invoiceSettings?.phone || '',
        email: invoiceSettings?.email || BRAND.contactEmail,
        address: invoiceSettings?.addressKu || invoiceSettings?.address || '',
        website: invoiceSettings?.website || '',
      },
    };

    const L = labels[lang];
    const invoiceLogo = invoiceSettings?.logoUrl || '';

    // Build order rows
    const itemsHtml = unpaidOrders.length > 0
      ? unpaidOrders.map((order, index) => {
          const total = order.totalUSD || 0;
          const paid = order.amountPaidUSD || 0;
          const remaining = total - paid;
          const customerName = order.shippingAddress?.fullName || 'N/A';
          const orderNum = order.orderNumber?.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '') || order.id?.substring(0, 6) || 'N/A';

          return `
            <tr style="background: ${index % 2 === 0 ? '#fff' : '#F8F9FC'};">
              <td style="padding: 12px 10px; border-bottom: 1px solid #eee;">
                 <strong style="color: #1F2937;">${orderNum}</strong>
              </td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #eee;">
                 ${customerName}
              </td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align: center;">
                 ${formatPrice(total, order.currency, order.exchangeRate)}
              </td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align: center; color: #10B981;">
                 ${formatPrice(paid, order.currency, order.exchangeRate)}
              </td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align: right; color: #EF4444; font-weight: bold;">
                 ${formatPrice(remaining, order.currency, order.exchangeRate)}
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #6B7280;">No unpaid orders found.</td></tr>`;

    return `
      <!DOCTYPE html>
      <html lang="${lang}" dir="${direction}">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unpaid Orders Report</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: ${isRTL ? "'Cairo', sans-serif" : "'Outfit', sans-serif"}; padding: 40px; color: #374151; background: #fff; line-height: 1.5; }
          
          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #F3F4F6; }
          .logo-container { display: flex; align-items: center; gap: 16px; }
          .logo-text { font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.5px; }
          .logo-sub { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
          .title-container { text-align: ${textAlign}; }
          .report-title { font-size: 24px; color: #EF4444; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase; }
          .report-date { font-size: 12px; color: #6B7280; margin-top: 4px; font-weight: 500; }
          
          /* Info Cards */
          .info-cards { display: flex; gap: 15px; margin-bottom: 25px; }
          .info-card { flex: 1; background: #F9FAFB; border: 1px solid #F3F4F6; padding: 15px; border-radius: 12px; display: flex; align-items: center; gap: 12px; }
          .info-icon { width: 32px; height: 32px; border-radius: 8px; font-weight: 700; color: #111827; display: flex; align-items: center; justify-content: center; font-size: 16px; }
          .info-content { flex: 1; }
          .info-label { font-size: 10px; color: #6B7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-value { font-size: 18px; font-weight: 700; color: #111827; margin-top: 2px; }
          
          .info-card.remaining-card { background: #FEF2F2; border-color: #FEE2E2; }
          .info-card.remaining-card .info-icon { background: #EF4444; color: white; }
          .info-card.remaining-card .info-value { color: #DC2626; }

          /* Table */
          table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 30px; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; }
          th { background: #F9FAFB; color: #4B5563; padding: 12px 10px; text-align: ${textAlign}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; border-bottom: 1px solid #E5E7EB; }
          th:nth-child(n+3) { text-align: center; }
          th:last-child { text-align: right; }
          td { padding: 12px 10px; border-bottom: 1px solid #F3F4F6; font-size: 12px; }
          tr:last-child td { border-bottom: none; }
          
          /* Footer */
          .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px dashed #E5E7EB; color: #9CA3AF; font-size: 10px; }
          .footer-grid { display: flex; justify-content: center; gap: 20px; margin-top: 10px; }
          .footer-item { display: flex; align-items: center; gap: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-container">
            ${invoiceLogo
              ? `<img src="${invoiceLogo}" style="height: 56px; width: 56px; object-fit: contain; border-radius: 12px;" alt="Logo" onerror="this.style.display='none'" />`
              : LOGO_BASE64
                ? `<img src="data:image/png;base64,${LOGO_BASE64}" style="height: 56px; width: 56px; object-fit: contain; border-radius: 12px;" alt="Logo" />`
                : `<div style="height: 56px; width: 56px; background: #10B981; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold;">H</div>`
            }
            <div>
              <div class="logo-text">${L.companyName}</div>
              <div class="logo-sub">${L.phone}</div>
            </div>
          </div>
          <div class="title-container">
            <div class="report-title">${reportTitle}</div>
            <div class="report-date">${L.date} ${dateStr}</div>
          </div>
        </div>

        <div class="info-cards">
          <div class="info-card remaining-card">
            <div class="info-icon">💵</div>
            <div class="info-content">
              <div class="info-label">${L.remaining}</div>
              <div class="info-value">$${formatCurrency(totalUnpaidAmountUSD)} USD</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>${L.orderId}</th>
              <th>${L.customer}</th>
              <th>${L.total}</th>
              <th>${L.paid}</th>
              <th>${L.remaining}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="footer">
          <p style="font-weight: 600; color: #4B5563;">${L.companyName}</p>
          <div class="footer-grid">
            ${L.phone ? `<div class="footer-item"><span>📞</span> ${L.phone}</div>` : ''}
            ${L.email ? `<div class="footer-item"><span>📧</span> ${L.email}</div>` : ''}
            ${L.address ? `<div class="footer-item"><span>📍</span> ${L.address}</div>` : ''}
            ${L.website ? `<div class="footer-item"><span>🌐</span> ${L.website}</div>` : ''}
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Generate and share PDF
  const handleGenerateReport = (filter: ReportFilter | 'revenue') => {
    if (filter === 'revenue') {
        if (products.length === 0) {
            Alert.alert(
              t('admin.stockReport.noItems', { defaultValue: 'No Items' }),
              t('admin.stockReport.noItemsMessage', { defaultValue: 'No products found.' })
            );
            return;
          }
    } else if (filter === 'unpaid_orders') {
        if (unpaidOrders.length === 0) {
            Alert.alert(
              t('admin.stockReport.noItems', { defaultValue: 'No Items' }),
              t('admin.stockReport.noItemsMessage', { defaultValue: 'No orders found for this filter.' })
            );
            return;
        }
    } else {
        const items = getFilteredProducts(filter);
        if (items.length === 0) {
          Alert.alert(
            t('admin.stockReport.noItems', { defaultValue: 'No Items' }),
            t('admin.stockReport.noItemsMessage', { defaultValue: 'No products found for this filter.' })
          );
          return;
        }
    }

    // Show language picker
    Alert.alert(
      t('admin.stockReport.selectLanguage', { defaultValue: 'Select Invoice Language' }),
      t('admin.stockReport.selectLanguageMessage', { defaultValue: 'Choose the language for the report' }),
      [
        { text: '🇬🇧 English', onPress: () => generatePDF(filter, 'en') },
        { text: '🇸🇦 العربية', onPress: () => generatePDF(filter, 'ar') },
        { text: '🇮🇶 کوردی', onPress: () => generatePDF(filter, 'ku') },
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      ]
    );
  };

  const generatePDF = async (filter: ReportFilter | 'revenue', lang: 'en' | 'ar' | 'ku') => {
    setGenerating(true);
    try {
      let html = '';
      if (filter === 'revenue') {
        html = generateLuxuryRevenueInvoiceHtml(lang);
      } else if (filter === 'unpaid_orders') {
        html = generateUnpaidOrdersInvoiceHtml(lang);
      } else {
        html = generateStockInvoiceHtml(filter, lang);
      }

      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Stock Report - ${filter}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      // silently fail
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('admin.stockReport.generateFailed', { defaultValue: 'Failed to generate report' })
      );
    } finally {
      setGenerating(false);
    }
  };

  // Report cards config
  const reportCards = [
    {
      filter: 'all' as ReportFilter,
      icon: 'cube' as const,
      title: t('admin.stockReport.allProducts', { defaultValue: 'All Products' }),
      subtitle: t('admin.stockReport.allProductsDesc', { defaultValue: 'Complete inventory list' }),
      count: products.length,
      color: '#3B82F6',
      bgColor: '#EFF6FF',
    },
    {
      filter: 'in_stock' as ReportFilter,
      icon: 'checkmark-circle' as const,
      title: t('admin.products.stats.inStock', { defaultValue: 'In Stock' }),
      subtitle: t('admin.stockReport.inStockDesc', { defaultValue: 'Items currently in stock' }),
      count: inStockProducts.length,
      color: '#10B981',
      bgColor: '#ECFDF5',
    },
    {
      filter: 'out_of_stock' as ReportFilter,
      icon: 'alert-circle' as const,
      title: t('admin.stockReport.outOfStock', { defaultValue: 'Out of Stock' }),
      subtitle: t('admin.stockReport.outOfStockDesc', { defaultValue: 'Items with zero stock' }),
      count: outOfStockProducts.length,
      color: '#EF4444',
      bgColor: '#FEF2F2',
    },
    {
      filter: 'low_stock' as ReportFilter,
      icon: 'warning' as const,
      title: t('admin.stockReport.lowStock', { defaultValue: 'Low Stock' }),
      subtitle: t('admin.stockReport.lowStockDesc', { defaultValue: 'Items running low' }),
      count: lowStockProducts.length,
      color: '#F59E0B',
      bgColor: '#FFFBEB',
    },
    {
      filter: 'coming_soon' as ReportFilter,
      icon: 'time' as const,
      title: t('admin.products.stats.comingSoon', { defaultValue: 'Coming Soon' }),
      subtitle: t('admin.stockReport.comingSoonDesc', { defaultValue: 'Items arriving soon' }),
      count: comingSoonProducts.length,
      color: '#8B5CF6',
      bgColor: '#F5F3FF',
    },
    {
      filter: 'on_the_way' as ReportFilter,
      icon: 'airplane' as const,
      title: t('admin.products.stats.onTheWay', { defaultValue: 'On the Way' }),
      subtitle: t('admin.stockReport.onTheWayDesc', { defaultValue: 'Items currently in transit' }),
      count: onTheWayProducts.length,
      color: '#0EA5E9',
      bgColor: '#F0F9FF',
    },
  ];

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#E0F7FA' }]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#E0F7FA' }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('admin.stockReport.title', { defaultValue: 'Stock Report' })}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        {/* Summary Section */}
        <View style={{ paddingHorizontal: SPACING.md, marginTop: 16, marginBottom: 24 }}>
          <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 12, letterSpacing: 0.2 }}>
            {t('admin.stockReport.inventorySummary', { defaultValue: 'Inventory Summary' })}
          </Text>
          <View style={{ 
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderRadius: 24,
            paddingVertical: 24,
            paddingHorizontal: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0 : 0.03,
            shadowRadius: 24,
            elevation: 2,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 28 }}>
              {[
                { icon: 'cube-outline', count: products.length, label: t('admin.products.stats.total', { defaultValue: 'Total' }), color: theme.colors.primary },
                { icon: 'checkmark-circle-outline', count: inStockProducts.length, label: t('admin.products.stats.inStock', { defaultValue: 'In Stock' }), color: '#10B981' },
                { icon: 'close-circle-outline', count: outOfStockProducts.length, label: t('admin.stockReport.outOfStock', { defaultValue: 'Out of Stock' }), color: '#EF4444' },
                { icon: 'alert-circle-outline', count: lowStockProducts.length, label: t('admin.stockReport.lowStock', { defaultValue: 'Low Stock' }), color: '#F59E0B' },
                { icon: 'time-outline', count: comingSoonProducts.length, label: t('admin.products.stats.comingSoon', { defaultValue: 'Coming Soon' }), color: '#8B5CF6' },
                { icon: 'airplane-outline', count: onTheWayProducts.length, label: t('admin.products.stats.onTheWay', { defaultValue: 'On the Way' }), color: '#0EA5E9' },
              ].map((stat, idx) => (
                <View key={idx} style={{ width: '33.33%', alignItems: 'center', paddingHorizontal: 4 }}>
                  <Ionicons name={stat.icon as any} size={24} color={stat.color} style={{ marginBottom: 6, opacity: 0.9 }} />
                  <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3, marginBottom: 2 }}>
                    {stat.count.toLocaleString()}
                  </Text>
                  <Text allowFontScaling={false} 
                    style={{ fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary, textAlign: 'center' }} 
                    adjustsFontSizeToFit 
                    numberOfLines={2}
                  >
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.infoNoteText, { color: theme.colors.textSecondary }]}>
            {t('admin.stockReport.tapToGenerate', { defaultValue: 'Tap a category below to generate a reorder invoice PDF that you can share with your factory or supplier.' })}
          </Text>
        </View>

        {/* Report Cards */}
        {reportCards.map((card) => {

          if (card.filter === 'unpaid_orders') {
            return (
              <View
                key={card.filter}
                style={[styles.reportCard, { backgroundColor: theme.colors.surface, paddingRight: 0 }]}
              >
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: SPACING.md }}
                  onPress={() => setUnpaidModalVisible(true)}
                >
                  <View style={[styles.reportCardIcon, { backgroundColor: card.bgColor }]}>
                    <Ionicons name={card.icon} size={28} color={card.color} />
                  </View>
                  <View style={styles.reportCardContent}>
                    <Text allowFontScaling={false} style={[styles.reportCardTitle, { color: theme.colors.text }]}>{card.title}</Text>
                    <Text allowFontScaling={false} style={[styles.reportCardSubtitle, { color: theme.colors.textSecondary }]}>{card.subtitle}</Text>
                  </View>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: SPACING.md }}>
                  <View style={[styles.countBadge, { backgroundColor: card.bgColor, marginRight: SPACING.sm }]}>
                    <Text allowFontScaling={false} style={[styles.countText, { color: card.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{card.count}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ padding: 8, backgroundColor: theme.colors.primary + '15', borderRadius: 8 }}
                    onPress={() => handleGenerateReport(card.filter)}
                    disabled={generating}
                  >
                     <Ionicons name="document-text-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={card.filter}
              style={[styles.reportCard, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => handleGenerateReport(card.filter)}
              activeOpacity={0.7}
              disabled={generating}
            >
              <View style={[styles.reportCardIcon, { backgroundColor: card.bgColor }]}>
                <Ionicons name={card.icon} size={28} color={card.color} />
              </View>
              <View style={[styles.reportCardContent, isRTL && { marginLeft: 0, marginRight: SPACING.md }]}>
                <Text allowFontScaling={false} style={[styles.reportCardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{card.title}</Text>
                <Text allowFontScaling={false} style={[styles.reportCardSubtitle, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{card.subtitle}</Text>
              </View>
              <View style={styles.reportCardRight}>
                <View style={[styles.countBadge, { backgroundColor: card.bgColor }]}>
                  <Text allowFontScaling={false} style={[styles.countText, { color: card.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{card.count}</Text>
                </View>
                <Ionicons name="document-text-outline" size={20} color={theme.colors.textSecondary} />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Generating Overlay */}
        {generating && (
          <View style={styles.generatingOverlay}>
            <ActivityIndicator size="large" color="#FF7816" />
            <Text allowFontScaling={false} style={[styles.generatingText, { color: theme.colors.text }]}>
              {t('admin.stockReport.generating', { defaultValue: 'Generating report...' })}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Unpaid Orders Modal */}
      <Modal
        visible={unpaidModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setUnpaidModalVisible(false)}
      >
        <View style={styles.unpaidModalOverlay}>
          <View style={[styles.unpaidModalContent, { backgroundColor: isDark ? theme.colors.background : '#F5F5F7' }]}>
            {/* Header */}
            <View style={[styles.unpaidModalHeader, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}>
              <TouchableOpacity
                style={styles.unpaidModalClose}
                onPress={() => setUnpaidModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#FEF9C3', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="time-outline" size={28} color="#EAB308" />
                </View>
                <Text allowFontScaling={false} style={[styles.unpaidModalTitle, { color: theme.colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                  {t('admin.stockReport.unpaidOrders', { defaultValue: 'Unpaid Orders' })}
                </Text>
                <Text allowFontScaling={false} style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 }} adjustsFontSizeToFit numberOfLines={1}>
                  {unpaidOrders.length} {t('admin.stockReport.unpaidCustomers', { defaultValue: 'customers with balance' })}
                </Text>
                <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginTop: 10 }}>
                  <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }} adjustsFontSizeToFit numberOfLines={1}>
                    ${formatCurrency(totalUnpaidAmountUSD)} USD
                  </Text>
                </View>
              </View>
            </View>

            {/* Unpaid customers list */}
            <FlatList
              data={(() => {
                // Group unpaid orders by customer
                const customerMap: Record<string, { name: string; phone: string; totalRemaining: number; orders: any[]; currency?: string; exchangeRate?: number }> = {};
                unpaidOrders.forEach(order => {
                  const key = order.userId || order.shippingAddress?.phone || order.shippingAddress?.fullName || order.id;
                  if (!customerMap[key]) {
                    customerMap[key] = {
                      name: order.shippingAddress?.fullName || t('admin.orders.unknownCustomer', { defaultValue: 'Unknown' }),
                      phone: order.shippingAddress?.phone || '',
                      totalRemaining: 0,
                      orders: [],
                      currency: order.currency,
                      exchangeRate: order.exchangeRate,
                    };
                  }
                  const remaining = Math.round(((order.totalUSD || 0) - (order.amountPaidUSD || 0)) * 100) / 100;
                  customerMap[key].totalRemaining += remaining;
                  customerMap[key].orders.push(order);
                });
                return Object.entries(customerMap)
                  .map(([key, val]) => ({ key, ...val }))
                  .sort((a, b) => b.totalRemaining - a.totalRemaining);
              })()}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                  <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 12 }} adjustsFontSizeToFit numberOfLines={2}>
                    {t('admin.stockReport.noUnpaidOrders', { defaultValue: 'All orders are fully paid!' })}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.unpaidCustomerCard, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setUnpaidModalVisible(false);
                    // Navigate to Admin Orders tab and auto-open this customer's first unpaid order
                    navigation.navigate('Main', {
                      screen: 'AdminOrders',
                      params: { orderId: item.orders[0]?.id },
                    });
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                    {/* Customer Avatar */}
                    <View style={[styles.unpaidAvatar, { backgroundColor: '#EAB308' }]}>
                      <Text allowFontScaling={false} style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text allowFontScaling={false} style={[styles.unpaidCustomerName, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {item.name}
                      </Text>
                      {item.phone ? (
                        <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {item.phone}
                        </Text>
                      ) : null}
                      <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {item.orders.length} {item.orders.length === 1 ? t('admin.stockReport.order', { defaultValue: 'order' }) : t('admin.stockReport.orders', { defaultValue: 'orders' })}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                    <Text allowFontScaling={false} style={styles.unpaidAmount} adjustsFontSizeToFit numberOfLines={1}>
                      {formatPrice(item.totalRemaining, item.currency as any, item.exchangeRate)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginRight: 4 }} adjustsFontSizeToFit numberOfLines={1}>
                        {t('admin.stockReport.viewOrders', { defaultValue: 'View' })}
                      </Text>
                      <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={14} color={theme.colors.textSecondary} />
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  container: {
    flex: 1,
  },
  countBadge: {
    alignItems: 'center',
    borderRadius: 12,
    height: 32,
    justifyContent: 'center',
    marginBottom: 4,
    minWidth: 32,
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 15,
    fontWeight: '800',
  },
  generatingOverlay: {
    alignItems: 'center',
    gap: 12,
    marginTop: SPACING.xl,
    padding: SPACING.lg,
  },
  generatingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: SPACING.sm,
    textAlign: 'center',
  },
  infoNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  reportCard: {
    alignItems: 'center',
    borderRadius: 14,
    elevation: 2,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  reportCardContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  reportCardIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  reportCardRight: {
    alignItems: 'center',
    gap: 4,
  },
  reportCardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  reportCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: SPACING.md,
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    borderRadius: 14,
    elevation: 2,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  summaryDivider: {
    height: '60%',
    width: 1,
  },
  summaryIconBg: {
    alignItems: 'center',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    marginBottom: 6,
    width: 40,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.md,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  unpaidAmount: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
  },
  unpaidAvatar: {
    alignItems: 'center',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  unpaidCustomerCard: {
    alignItems: 'center',
    borderRadius: 14,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  unpaidCustomerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  unpaidModalClose: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    right: 16,
    top: 16,
    width: 40,
    zIndex: 10,
  },
  unpaidModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    marginTop: 60,
  },
  unpaidModalHeader: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  unpaidModalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
  },
  unpaidModalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
});

export default AdminStockReportScreen;
