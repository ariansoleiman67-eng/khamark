import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { BRAND } from '../../constants/config';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

const formatInt = (val: number) => new Intl.NumberFormat('en-US').format(Math.round(val || 0));

// Total sellable stock = main + size-variation + color-variation stock.
export const partnerEffectiveStock = (p: any): number => {
  const main = p?.stockQty || 0;
  const size = (p?.variations || []).reduce((s: number, v: any) => s + (v?.stockQuantity || 0), 0);
  const color = (p?.colorVariations || []).reduce((s: number, v: any) => s + (v?.stockQuantity || 0), 0);
  return main + size + color;
};

// Wholesale unit price = the best (LOWEST) wholesale tier price — the true wholesale, not the
// entry/retail tier. Falls back to the base price when a product has no wholesale tiers.
// (The partner dashboard imports this for its Total Invested / Wholesale / Earned math.)
export const partnerWholesalePrice = (p: any): number => {
  const tiers = (Array.isArray(p?.priceTiers) ? p.priceTiers : [])
    .filter((t: any) => t && t.minQty > 0 && t.priceUSD > 0);
  return tiers.length ? Math.min(...tiers.map((t: any) => Number(t.priceUSD))) : (p?.priceUSD || 0);
};

// Download a remote image and inline it as a base64 data URI. expo-print snapshots
// the HTML before remote <img> tags load, so images MUST be embedded to appear in
// the PDF. wsrv.nl resizes to a tiny thumbnail first; falls back to the raw URL.
const fetchImageDataUri = async (url: string, index: number): Promise<string | null> => {
  if (!url) return null;
  const candidates = [
    `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=120&h=120&fit=cover&output=jpg&q=80`,
    url,
  ];
  const target = `${FileSystem.cacheDirectory}partner_inv_${Date.now()}_${index}.jpg`;
  for (const candidate of candidates) {
    try {
      const { status } = await FileSystem.downloadAsync(candidate, target);
      if (status !== 200) continue;
      const b64 = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.Base64 });
      FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (b64 && b64.length > 100) return `data:image/jpeg;base64,${b64}`;
    } catch {
      /* try next */
    }
  }
  return null;
};

type Lang = 'en' | 'ar' | 'ku';

const labelsFor = (lang: Lang, invoiceSettings: any) => {
  const base = {
    title: 'PARTNER INVENTORY',
    subtitle: 'Assigned Products Statement',
    partner: 'Partner',
    date: 'Date',
    items: 'Items',
    units: 'Units in stock',
    product: 'Product',
    stock: 'Stock',
    buy: 'Buy',
    sell: 'Wholesale',
    profit: 'Wholesale Profit',
    value: 'Stock Value',
    inventoryCost: 'Inventory Cost',
    retailValue: 'Wholesale Value',
    potentialProfit: 'Potential Profit',
    totalInvested: 'Total Invested',
    earnedFromSales: 'Earned from Sales',
    totals: 'Totals',
    noItems: 'No products assigned.',
    company: invoiceSettings?.companyName || BRAND.name,
    phone: invoiceSettings?.phone || '',
    email: invoiceSettings?.email || '',
    address: invoiceSettings?.address || '',
    website: invoiceSettings?.website || '',
  };
  if (lang === 'ar') {
    return {
      ...base,
      title: 'مخزون الشريك',
      subtitle: 'كشف المنتجات المخصصة',
      partner: 'الشريك',
      date: 'التاريخ',
      items: 'العناصر',
      units: 'الوحدات في المخزون',
      product: 'المنتج',
      stock: 'المخزون',
      buy: 'الشراء',
      sell: 'الجملة',
      profit: 'ربح الجملة',
      value: 'قيمة المخزون',
      inventoryCost: 'تكلفة المخزون',
      retailValue: 'قيمة الجملة',
      potentialProfit: 'الربح المتوقع',
      totalInvested: 'إجمالي الاستثمار',
      earnedFromSales: 'الأرباح من المبيعات',
      totals: 'الإجمالي',
      noItems: 'لا توجد منتجات مخصصة.',
      company: invoiceSettings?.companyNameAr || base.company,
    };
  }
  if (lang === 'ku') {
    return {
      ...base,
      title: 'کۆگای هاوبەش',
      subtitle: 'پێڕستی بەرهەمە دیاریکراوەکان',
      partner: 'هاوبەش',
      date: 'بەروار',
      items: 'کاڵاکان',
      units: 'یەکە لە کۆگادا',
      product: 'بەرهەم',
      stock: 'کۆگا',
      buy: 'کڕین',
      sell: 'کۆ',
      profit: 'قازانجی کۆ',
      value: 'بەهای کۆگا',
      inventoryCost: 'تێچووی کۆگا',
      retailValue: 'بەهای کۆ',
      potentialProfit: 'قازانجی چاوەڕوانکراو',
      totalInvested: 'کۆی وەبەرهێنان',
      earnedFromSales: 'قازانج لە فرۆشتن',
      totals: 'کۆی گشتی',
      noItems: 'هیچ بەرهەمێکی دیاریکراو نییە.',
      company: invoiceSettings?.companyNameKu || base.company,
    };
  }
  return base;
};

interface BuildOpts {
  invoiceSettings?: any;
  partnerName?: string;
  lang?: Lang;
  imageMap?: Record<string, string>;
  logoData?: string | null;
  dateStr?: string;
  // Money summary computed on the partner dashboard — passed in so the invoice's headline
  // figures MATCH the dashboard exactly (single source of truth, no recomputation/drift).
  // Total Invested = product cost of all RECEIVED units (on-hand + sold) + cash in − manual
  // payouts; Wholesale Value = received units × wholesale; Earned = realized profit − payouts.
  // When absent, the cards fall back to the stock-on-hand figures computed here.
  totalInvested?: number;
  wholesaleValue?: number;
  earned?: number;
}

export const generatePartnerInventoryInvoiceHtml = (products: any[], opts: BuildOpts = {}): string => {
  const lang = opts.lang || 'en';
  const L = labelsFor(lang, opts.invoiceSettings);
  const isRTL = lang === 'ar' || lang === 'ku';
  const direction = isRTL ? 'rtl' : 'ltr';
  const textAlign = isRTL ? 'right' : 'left';
  const imageMap = opts.imageMap || {};
  const dateStr = opts.dateStr || '';

  let totalStock = 0;
  let totalBuyValue = 0;
  let totalSellValue = 0;

  const productName = (p: any) =>
    (lang === 'ar' && p.nameAr) ? p.nameAr : (lang === 'ku' && p.nameKu) ? p.nameKu : (p.name || 'N/A');

  const rows = (products || []).map((p: any, index: number) => {
    const stock = partnerEffectiveStock(p);
    const buy = p.purchasePrice || 0;
    const sell = partnerWholesalePrice(p); // wholesale price (not single-unit retail)
    const unitProfit = sell - buy;
    const stockValue = buy * stock;

    totalStock += stock;
    totalBuyValue += stockValue;
    totalSellValue += sell * stock;

    const rawUrl = p.imageUrls?.[0] || '';
    const imgSrc = imageMap[rawUrl] || '';
    const imgHtml = imgSrc
      ? `<img src="${imgSrc}" style="width:36px;height:36px;border-radius:7px;object-fit:cover;border:1px solid #E5E7EB;" />`
      : `<div style="width:36px;height:36px;background:#F3F4F6;border-radius:7px;border:1px solid #E5E7EB;text-align:center;line-height:36px;font-size:16px;">📦</div>`;

    const status = p.status || 'available';
    const stockBadge =
      status === 'coming_soon' || status === 'on_the_way'
        ? `<span class="chip chip-blue">${status === 'coming_soon' ? '⏳' : '🚚'} ${formatInt(stock)}</span>`
        : stock <= 0
        ? `<span class="chip chip-red">${formatInt(stock)}</span>`
        : stock <= 5
        ? `<span class="chip chip-amber">${formatInt(stock)}</span>`
        : `<span class="chip chip-green">${formatInt(stock)}</span>`;

    return `
      <tr>
        <td style="color:#94a3b8;font-weight:700;">${index + 1}</td>
        <td>
          <table style="border:none;margin:0;width:100%;background:transparent;">
            <tr>
              <td style="width:44px;padding:0;border:none;">${imgHtml}</td>
              <td style="padding:0;padding-${isRTL ? 'right' : 'left'}:8px;border:none;vertical-align:middle;text-align:${textAlign};">
                <div style="font-weight:700;color:#0f172a;font-size:10.5px;line-height:1.25;word-break:break-word;">${productName(p)}</div>
                <div style="color:#64748b;font-size:9px;font-family:monospace;letter-spacing:0.2px;margin-top:1px;">${p.partNumber || 'N/A'}</div>
              </td>
            </tr>
          </table>
        </td>
        <td class="center">${stockBadge}</td>
        <td class="center" style="color:#ef4444;font-weight:700;">$${formatCurrency(buy)}</td>
        <td class="center" style="color:#10b981;font-weight:700;">$${formatCurrency(sell)}</td>
        <td class="center"><span class="chip chip-amber">+$${formatCurrency(unitProfit)}</span></td>
        <td class="right" style="color:#0f172a;font-weight:800;">$${formatCurrency(stockValue)}</td>
      </tr>`;
  }).join('');

  const totalProfit = totalSellValue - totalBuyValue;

  const itemsHtml = (products && products.length)
    ? rows
    : `<tr><td colspan="7" style="padding:40px;text-align:center;color:#94a3b8;font-size:14px;font-weight:500;">${L.noItems}</td></tr>`;

  const logoHtml = opts.logoData
    ? `<img src="${opts.logoData}" style="height:54px;width:54px;object-fit:contain;border-radius:12px;background:white;padding:4px;" />`
    : `<div style="height:54px;width:54px;background:#8B5CF6;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:bold;">H</div>`;

  return `
  <!DOCTYPE html>
  <html dir="${direction}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
    <style>
      @page { size: portrait; margin: 12mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #334155; font-size: 11px; direction: ${direction}; }
      .container { max-width: 100%; margin: 0 auto; background: #ffffff; padding: 16px; }

      /* Header */
      .header-banner { background: linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%); padding: 18px 22px; border-radius: 14px; margin-bottom: 18px; box-shadow: 0 10px 20px -6px rgba(76,29,149,0.35); }
      table.header-table { width: 100%; border: none; background: transparent; }
      table.header-table td { border: none; padding: 0; vertical-align: middle; }
      .logo-text { font-size: 19px; font-weight: 900; letter-spacing: -0.4px; color: #f5f3ff; }
      .logo-sub { font-size: 9px; color: #c4b5fd; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
      .report-title { font-size: 17px; font-weight: 900; color: #c4b5fd; letter-spacing: 0.5px; text-transform: uppercase; }
      .report-meta { font-size: 10px; color: #ddd6fe; margin-top: 3px; font-weight: 500; }

      /* Summary cards */
      table.info-cards { width: 100%; border-collapse: separate; border-spacing: 9px 0; margin: 0 -9px 18px -9px; }
      table.info-cards td { padding: 13px; border-radius: 12px; width: 33.33%; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      td.card-cost { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-color: #fecaca; }
      td.card-rev { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-color: #a7f3d0; }
      td.card-profit { background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-color: #ddd6fe; }
      .info-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
      td.card-cost .info-label { color: #dc2626; }
      td.card-rev .info-label { color: #059669; }
      td.card-profit .info-label { color: #7c3aed; }
      .info-value { font-size: 18px; font-weight: 900; }
      td.card-cost .info-value { color: #991b1b; }
      td.card-rev .info-value { color: #065f46; }
      td.card-profit .info-value { color: #5b21b6; }

      .pill-line { margin-bottom: 14px; text-align: ${textAlign}; }
      .pill { display: inline-block; background: #f1f5f9; color: #475569; font-weight: 700; font-size: 10px; padding: 5px 11px; border-radius: 999px; margin-${isRTL ? 'left' : 'right'}: 7px; }

      /* Table */
      .table-container { border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
      table.main-table { width: 100%; border-collapse: collapse; background: white; table-layout: fixed; }
      table.main-table th { background: #1e1b4b; color: #ede9fe; padding: 10px 5px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; text-align: ${textAlign}; word-break: break-word; }
      table.main-table th.center { text-align: center; }
      table.main-table th.right { text-align: right; }
      table.main-table td { padding: 9px 5px; border-bottom: 1px solid #f1f5f9; font-size: 10px; vertical-align: middle; word-break: break-word; }
      table.main-table tr:nth-child(even) { background-color: #faf9ff; }
      table.main-table td.center { text-align: center; }
      table.main-table td.right { text-align: right; }
      tfoot td { background: #1e1b4b; color: #f5f3ff; font-weight: 800; font-size: 11px; padding: 11px 5px; }
      tfoot td.right { text-align: right; }

      .chip { font-weight: 700; padding: 3px 7px; border-radius: 7px; display: inline-block; font-size: 9.5px; white-space: nowrap; }
      .chip-green { background: #d1fae5; color: #059669; }
      .chip-amber { background: #fef3c7; color: #d97706; }
      .chip-red { background: #fee2e2; color: #dc2626; }
      .chip-blue { background: #dbeafe; color: #2563eb; }

      .footer { text-align: center; margin-top: 26px; padding-top: 14px; border-top: 2px dashed #e2e8f0; color: #64748b; font-size: 10px; }
      .footer-grid { display: inline-table; margin-top: 7px; }
      .footer-grid td { padding: 0 10px; font-weight: 500; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header-banner">
        <table class="header-table">
          <tr>
            <td style="width: 60px;">${logoHtml}</td>
            <td style="text-align:${textAlign}; padding: 0 14px;">
              <div class="logo-text">${L.company}</div>
              <div class="logo-sub">${[L.phone, L.address].filter(Boolean).join(' · ')}</div>
            </td>
            <td style="text-align:${isRTL ? 'left' : 'right'};">
              <div class="report-title">${L.title}</div>
              <div class="report-meta">${opts.partnerName ? `${L.partner}: ${opts.partnerName}` : L.subtitle}</div>
              <div class="report-meta">${dateStr ? `${L.date}: ${dateStr}` : ''}</div>
            </td>
          </tr>
        </table>
      </div>

      <table class="info-cards">
        <tr>
          <td class="card-cost">
            <div class="info-label">${L.totalInvested}</div>
            <div class="info-value">$${formatCurrency(opts.totalInvested ?? totalBuyValue)}</div>
          </td>
          <td class="card-rev">
            <div class="info-label">${L.retailValue}</div>
            <div class="info-value">$${formatCurrency(opts.wholesaleValue ?? totalSellValue)}</div>
          </td>
          <td class="card-profit">
            <div class="info-label">${L.earnedFromSales}</div>
            <div class="info-value">$${formatCurrency(opts.earned ?? totalProfit)}</div>
          </td>
        </tr>
      </table>

      <div class="pill-line">
        <span class="pill">${(products || []).length} ${L.items}</span>
        <span class="pill">${formatInt(totalStock)} ${L.units}</span>
      </div>

      <div class="table-container">
        <table class="main-table">
          <colgroup>
            <col style="width:6%;" /><col style="width:38%;" /><col style="width:11%;" />
            <col style="width:11%;" /><col style="width:11%;" /><col style="width:12%;" /><col style="width:13%;" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>${L.product}</th>
              <th class="center">${L.stock}</th>
              <th class="center">${L.buy}</th>
              <th class="center">${L.sell}</th>
              <th class="center">${L.profit}</th>
              <th class="right">${L.value}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <!-- Money grand-totals live in the summary cards above (Total Invested / Wholesale
                   Value / Earned, mirrored from the dashboard). The per-product rows are a
                   current-stock listing, so the footer only totals stock units — no competing
                   cost/profit grand total that could read as inconsistent with the cards. -->
              <td colspan="2">${L.totals}</td>
              <td class="center">${formatInt(totalStock)}</td>
              <td class="center">—</td>
              <td class="center">—</td>
              <td class="center">—</td>
              <td class="right">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="footer">
        <div style="font-weight:700;color:#475569;">${L.company}</div>
        <table class="footer-grid"><tr>
          ${L.phone ? `<td>📞 ${L.phone}</td>` : ''}
          ${L.email ? `<td>✉️ ${L.email}</td>` : ''}
          ${L.website ? `<td>🌐 ${L.website}</td>` : ''}
        </tr></table>
      </div>
    </div>
  </body>
  </html>`;
};

// Prefetch all product images (+ logo) as base64, build the HTML, render a PDF and
// open the share sheet. Returns false on failure so the caller can alert.
export const sharePartnerInventoryInvoice = async (opts: {
  products: any[];
  invoiceSettings?: any;
  partnerName?: string;
  lang?: Lang;
  dateStr?: string;
  totalInvested?: number;
  wholesaleValue?: number;
  earned?: number;
}): Promise<boolean> => {
  try {
    const products = opts.products || [];
    const urls = Array.from(
      new Set(products.map((p: any) => p?.imageUrls?.[0]).filter(Boolean))
    ) as string[];

    const entries = await Promise.all(
      urls.map(async (u, i) => [u, await fetchImageDataUri(u, i)] as const)
    );
    const imageMap: Record<string, string> = {};
    entries.forEach(([u, data]) => { if (data) imageMap[u] = data; });

    const logoData = opts.invoiceSettings?.logoUrl
      ? await fetchImageDataUri(opts.invoiceSettings.logoUrl, 99999)
      : null;

    const html = generatePartnerInventoryInvoiceHtml(products, {
      invoiceSettings: opts.invoiceSettings,
      partnerName: opts.partnerName,
      lang: opts.lang,
      imageMap,
      logoData,
      dateStr: opts.dateStr,
      totalInvested: opts.totalInvested,
      wholesaleValue: opts.wholesaleValue,
      earned: opts.earned,
    });

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to build partner inventory invoice:', e);
    return false;
  }
};
