/**
 * App timestamp type. Historically a Firestore Timestamp; values now come from
 * Supabase (ISO strings / Dates). Kept as a structural type so any legacy
 * Timestamp-like object (with toDate()) still satisfies it.
 */
export interface Timestamp {
  toDate(): Date;
  toMillis(): number;
  seconds: number;
  nanoseconds: number;
}

// User Types
export interface User {
  uid: string;
  name: string;
  fullName?: string;
  email: string;
  phone: string;
  profileImageUrl?: string;
  coverUrl?: string;
  address?: string;
  city?: string;
  region?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'prefer_not_to_say';
  preferredCurrency?: 'USD' | 'IQD'; // User's preferred display currency
  vehicleInfo?: {
    make: string;
    model: string;
    year: string;
    vin: string;
  };
  addresses: Address[];
  language: 'en' | 'ar' | 'ku';
  // Auth provider tracking
  authProvider?: 'phone' | 'email' | 'google' | 'apple';
  phoneVerified?: boolean;
  emailVerified?: boolean;
  // Admin fields
  role?: 'customer' | 'admin' | 'vip';
  isAdmin?: boolean;
  isPartner?: boolean;  // view-only partner: sees only the products an owner shared with them
  isBlocked?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Address {
  id: string;
  title: string;
  name?: string; // Alias for title
  fullName: string;
  phone: string;
  street?: string; // Alias for address
  address: string;
  countryCode: string; // Country code (IQ, SY, IR, TR)
  cityCode: string; // City code from countries data
  city: string; // City name for backward compatibility
  region: string; // Country name for backward compatibility
  postalCode?: string;
  landmark?: string;
  formattedAddress?: string;
  addressComponents?: any;
  isDefault: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// Product Types

// Product availability status
export type ProductStatus = 'available' | 'coming_soon' | 'on_the_way';

// Price tier for wholesale/quantity-based pricing (like AliExpress)
export interface PriceTier {
  minQty: number;      // Minimum quantity to get this price (e.g., 1, 10, 50)
  maxQty?: number;     // Optional max quantity (undefined = unlimited)
  priceUSD: number;    // Price per unit at this tier
}

// ALIBABA VARIATION: Size-based variation with per-size stock control
export interface ProductVariation {
  variationId: string;           // Unique ID (e.g., "product123_size_4")
  sizeValue: string;             // Size value as text (e.g., '4cm', '10 inches', 'Large', 'XL')
  sizeUnit: string;              // Optional unit (can be empty if unit is in sizeValue)
  priceUSD?: number;             // Optional price override (defaults to product.priceUSD)
  /**
   * Optional price authored directly in dinar, exactly like Product.priceIQD.
   * When set it WINS over priceUSD and is charged verbatim — no exchange-rate
   * conversion, no 250 snap. Read it through variantPriceUSD/formatVariantPrice
   * so a variant priced in dinar cannot be mistaken for a dollar figure.
   */
  priceIQD?: number;
  /**
   * The remaining three prices, per option, each with the same dinar-wins rule as
   * priceUSD/priceIQD above. A 256GB in a different colour is often a different
   * buy, a different VIP deal and a different "was" price, and the shop had no
   * way to say so — every option inherited the product's.
   *
   * All optional: an option that sets none of them inherits the product's, which
   * is what every existing variation does.
   */
  vipPriceUSD?: number;
  vipPriceIQD?: number;
  compareAtPriceUSD?: number;
  compareAtPriceIQD?: number;
  /** Admin-only, like Product.purchasePrice. Never rendered to a customer. */
  purchasePrice?: number;
  purchasePriceIQD?: number;
  stockQuantity: number;         // Per-variation stock (admin-controlled, enforced at runtime)
}

// ALIBABA VARIATION: Color-based variation with per-color stock control
export interface ColorVariation {
  variationId: string;           // Unique ID (e.g., "product123_color_blue")
  colorValue: string;            // Color name (e.g., 'Blue', 'Red', 'Black')
  colorHex?: string;             // Optional hex code for display (e.g., '#0000FF')
  priceUSD?: number;             // Optional price override
  priceIQD?: number;             // Optional dinar price; wins over priceUSD, charged verbatim
  /** Same four extra prices as ProductVariation — see the note there. */
  vipPriceUSD?: number;
  vipPriceIQD?: number;
  compareAtPriceUSD?: number;
  compareAtPriceIQD?: number;
  purchasePrice?: number;
  purchasePriceIQD?: number;
  imageUrl?: string;             // Optional per-color image (swaps the hero when selected)
  stockQuantity: number;         // Per-color stock
}

// Storage/capacity option (e.g. iPhone 256GB / 512GB / 1TB). priceDelta is added
// to the product's base price when selected. Opaque JSONB in the parts table.
export interface StorageOption {
  id: string;                    // Unique id (e.g. 'stor_256')
  label: string;                 // Display label (e.g. '256GB', '1TB')
  priceDelta: number;            // USD added to the base price (0 for the default)
  /**
   * Optional ABSOLUTE dinar price for this capacity. When set it replaces the
   * base-plus-delta arithmetic entirely: the shopper is charged this exact
   * figure. A delta cannot express a dinar price, because the base it adds to
   * may itself be in dollars.
   */
  priceIQD?: number;
}

export interface Product {
  id: string;
  name: string;
  nameAr: string;
  nameKu: string;
  partNumber: string;
  category: string;
  categoryAr: string;
  categoryKu: string;
  imageUrls: string[];  // Match what ProductCard expects
  priceUSD: number;
  /**
   * Selling price authored directly in IQD. Undefined means the product is
   * priced in USD via priceUSD, as everything was before. When set it is
   * authoritative: shown verbatim with no exchange-rate conversion and no
   * 250-IQD rounding, and priceUSD is derived from it at save time for the
   * cart/report/sort arithmetic that is USD-only. Read it through
   * getPriceUSD / getPriceIQD / formatItemPrice in utils/currency.
   */
  priceIQD?: number;
  compareAtPriceUSD?: number; // "was" price for showing a strikethrough + Save% discount
  /**
   * The "was" price authored directly in IQD. When set it OUTRANKS
   * compareAtPriceUSD and is shown verbatim. Same rule as every other _IQD
   * field: never compare it against a USD figure.
   */
  compareAtPriceIQD?: number;
  vipPriceUSD?: number;      // Special price shown only to VIP users (locked/hinted for others)
  /**
   * A VIP price authored directly in IQD, the VIP counterpart of priceIQD.
   * When set it OUTRANKS vipPriceUSD and is charged to a VIP verbatim — no
   * exchange-rate conversion, no 250 snap. Never compare it against a USD
   * figure: a dinar number is always numerically larger and every "is the VIP
   * price actually cheaper" guard would read backwards.
   */
  vipPriceIQD?: number;
  purchasePrice?: number;    // Cost/buy price from supplier (admin-only, not shown to customers)
  /**
   * What the shop PAID, authored directly in IQD — the cost counterpart of
   * priceIQD, for stock bought in dinar. When set it OUTRANKS purchasePrice.
   *
   * Admin-only, and enforced in the database, not here: parts.purchase_price_iqd
   * is never granted to anon/authenticated and reaches the app only through the
   * parts_admin view's owner/admin/co-admin test. Do not add it to any
   * customer-facing select list.
   */
  purchasePriceIQD?: number;
  priceTiers?: PriceTier[];  // Quantity-based pricing tiers (wholesale pricing)
  shippingCost?: number; // Individual shipping cost for this product in USD
  shippingRates?: Array<{ city: string; price: number }>; // City-based shipping rates
  stockQty: number;
  historicalStockQty?: number; // Total stock ever added to this product
  initialStock?: number; // For low stock threshold (e.g., alert if <= this value)
  description: string;
  descriptionAr: string;
  descriptionKu: string;
  compatibleModels: string[];
  isFeatured: boolean;
  isActive: boolean;
  brand: string;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  specifications?: Record<string, string>;
  condition?: string;
  warranty?: string;
  sku?: string;
  barcode?: string;
  // Add computed property for backward compatibility
  inStock?: boolean;
  // Add alias for images to support existing components
  images?: string[];
  // Product availability status (for Coming Soon / On The Way badges)
  status?: ProductStatus;
  // GOLDEN TEMPLATE: Optional cosmetic options (NOT variants)
  // These do NOT affect price, stock, or order logic
  options?: {
    colors?: string[];  // e.g., ["Black", "Blue", "Red"]
    sizes?: string[];   // e.g., ["2cm", "3cm", "4cm"]
  };
  // ALIBABA VARIATION: Per-size stock management (replaces cosmetic options.sizes)
  // If present, each size has its own stock and optional price override
  variations?: ProductVariation[];
  // ALIBABA VARIATION: Per-color stock management (replaces cosmetic options.colors)
  // If present, each color has its own stock and optional price override
  colorVariations?: ColorVariation[];
  // Storage/capacity options (e.g. iPhone 256GB / 512GB / 1TB); selection adds priceDelta
  storageOptions?: StorageOption[];
  // Video support: optional product video URL (BunnyCDN/Cloud)
  videoUrl?: string;
  tenantId?: string;
  /**
   * Which admin owns this product, and therefore which inbox a customer's
   * question about it lands in (chatService.ts:130 routes on it).
   *
   * Not a column — `parts` has no owner_admin_id. It lives inside the `extra_data`
   * jsonb, listed in productService's PART_EXTRA_KEYS, and tenantAdminService
   * (:26) lifts it back out onto the object. So the VALUE has always been here;
   * only the declaration was missing, which made every read of it a type error
   * inside a file carrying @ts-nocheck. `adminId` is the older name for the same
   * thing, still written alongside it for rows created before the rename.
   */
  ownerAdminId?: string | null;
  adminId?: string | null;
  coAdminIds?: string[]; // IDs of other admins allowed to view this product
  sortOrder?: number; // Admin-controlled display order (lower = first)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Cart Types
export interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  addedAt: Timestamp;
  // GOLDEN TEMPLATE: Optional selected options (cosmetic only, not variants)
  selectedOptions?: {
    color?: string;
    size?: string;
    storage?: string;
  };
  // ALIBABA VARIATION: Track variationId for per-size stock items
  variationId?: string;
  // A size line can also carry a colour (one phone, one line). Kept so the colour's
  // own stock can be checked on later adds.
  colorVariationId?: string;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  subtotalUSD: number;
  appliedDiscount?: AppliedDiscount;
  updatedAt: Timestamp;
}

// Discount Types
export type DiscountType = 'percentage' | 'fixed' | 'bundle';

export interface Discount {
  id: string;
  name: string;
  nameAr?: string;
  nameKu?: string;
  description?: string;
  descriptionAr?: string;
  descriptionKu?: string;
  type: DiscountType;
  value: number;              // For percentage: 20 means 20%, for fixed: 10 means $10 off
  bundleQuantity?: number;    // For bundle: minimum quantity to buy
  bundlePrice?: number;       // For bundle: price for the bundle
  minPurchase?: number;       // Minimum cart total (in $) to apply discount
  minQuantity?: number;       // Minimum number of items in cart to apply discount
  maxDiscount?: number;       // Maximum discount amount cap
  productIds?: string[];      // Specific product IDs this discount applies to (empty = all products)
  isActive: boolean;
  startDate: Timestamp;
  endDate: Timestamp;
  usageLimit?: number;        // Maximum total uses (optional)
  usageCount: number;         // Current usage count
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AppliedDiscount {
  discountId: string;
  discountName: string;
  discountType: DiscountType;
  discountValue: number;
  savedAmount: number;        // Actual amount saved in USD
}




// Shipping and Address Types
export interface ShippingAddress {
  fullName: string;
  email?: string;
  phone: string;
  countryCode: string; // Country code (IQ, SY, IR, TR)
  cityCode: string; // City code from countries data
  region: string; // Country name for backward compatibility
  city: string; // City name for backward compatibility
  district?: string;
  address: string;
  notes?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

// Payment Types
export interface PaymentMethod {
  id?: string; // Add id property
  type: 'qi_card' | 'cash_on_delivery' | 'money_exchanger';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'coming_soon';
  transactionId: string | null;
  details?: {
    last4?: string;
    brand?: string;
    [key: string]: any;
  } | null;
}

// Order Types
export type OrderStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'processing' 
  | 'shipped' 
  | 'delivered' 
  | 'cancelled'
  | 'cancelled_by_store' 
  | 'cancelled_by_user';

/**
 * Normalize legacy order status for backward compatibility.
 * Treats legacy 'cancelled' as 'cancelled_by_store' (safe default).
 */
export const normalizeOrderStatus = (status: string): OrderStatus => {
  if (status === 'cancelled') return 'cancelled_by_store';
  return status as OrderStatus;
};

/** True for any cancelled order status — legacy 'cancelled', store- or user-cancelled. */
export const isCancelledStatus = (status?: string): boolean =>
  status === 'cancelled' || status === 'cancelled_by_store' || status === 'cancelled_by_user';

export type PaymentStatus = 'pending' | 'awaiting_payment' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paid' | 'refunded';

export interface OrderItem {
  productId: string;
  productName: string;
  productNameAr?: string;  // Arabic product name for localized display
  productNameKu?: string;  // Kurdish product name for localized display
  partNumber: string;
  priceUSD: number;
  /**
   * Per-unit price in dinar, snapshotted when the product was priced in IQD and
   * that base price is what was charged. Absent when the line was charged a
   * dollar figure (a VIP price, a wholesale tier, or an ordinary USD product).
   * Display it verbatim — it must not be re-derived from priceUSD.
   */
  priceIQD?: number;
  originalPriceUSD?: number; // Original price before wholesale/tiered discount
  quantity: number;
  totalUSD?: number;
  shippingCost?: number; // Individual shipping cost for this product in USD
  purchasePrice?: number; // Buying price of the product from supplier
  imageUrl?: string;
  tenantId?: string; // ID of the tenant/admin who owns this product
  
  // Immutable snapshot (NEVER re-fetch live data)
  productSnapshot?: {
    name: string;
    partNumber: string;
    brand?: string;
    imageUrl?: string;
  };

  // ALIBABA VARIATION: Track variationId for per-size/color stock decrement
  variationId?: string;
  
  // Computed at order time (IMMUTABLE)
  unitPriceUSD?: number;  // Final unit price used
  lineTotalUSD?: number;  // unitPriceUSD * quantity

  // GOLDEN TEMPLATE: Optional selected options (cosmetic only, read-only)
  selectedOptions?: {
    color?: string;
    size?: string;
  };
}

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  items: OrderItem[];
  subtotalUSD: number;
  shippingUSD: number;
  taxUSD: number;
  discountUSD?: number; // Discount amount applied
  appliedDiscount?: AppliedDiscount; // Full discount details
  totalUSD: number;
  /**
   * The exact IQD total charged, snapshotted at checkout. Set only when the
   * order contained a product priced in dinar. When present it is what the
   * customer agreed to and what was charged, so it is displayed verbatim rather
   * than recomputed from totalUSD x exchangeRate.
   */
  totalIQD?: number;
  // Currency snapshotting
  currency?: 'USD' | 'IQD'; // The currency the order was placed in
  exchangeRate?: number;    // The exchange rate at the time of order
  paymentMethod: PaymentMethod | string; // Allow string for legacy/simple cases
  paymentStatus?: PaymentStatus;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  specialInstructions?: string | null;
  notes?: string;
  trackingNumber?: string;
  trackingUrl?: string; // GPSOPS or other GPS tracking link
  estimatedDelivery?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: 'admin' | 'user';
  cancellationReason?: string;
  // PARTIAL PAYMENTS
  amountPaidUSD?: number;
  // VARIANT STOCK TRACKING
  stockStatus?: 'pending' | 'deducted' | 'rolled_back' | 'failed';
  stockDeductedAt?: Timestamp;
  stockRolledBackAt?: Timestamp;
  stockError?: string;
  // SHIPPING OFFICE INFO (for out-of-country customers)
  shippingOfficeInfo?: {
    recipientName: string;
    mobileNumber: string;
    officeName: string;
    officePhone: string;
  };
  // MONEY EXCHANGER INFO (for money exchanger payment method)
  moneyExchangerInfo?: {
    officeName: string;
    officePhone: string;
    receiverName: string;
    receiverPhone: string;
    totalAmount: string;
  } | null;
}

// Trade-In Types
export type TradeInStatus =
  | 'submitted' | 'quoted' | 'accepted' | 'declined' | 'completed' | 'cancelled';

export interface TradeInRequest {
  id: string;
  tenantId: string;
  userId?: string;
  contactName: string;
  contactPhone: string;
  deviceBrand: string;
  deviceModel: string;
  storage?: string;
  questionsVersion: number;
  answers: Record<string, string>;
  photos: string[];
  customerNote?: string;
  status: TradeInStatus;
  offerUSD?: number;
  offerNote?: string;
  offerType?: 'cash' | 'credit';
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
  quotedAt?: string;
}

// Notification Types
// GOLDEN TEMPLATE: Alibaba-style notification normalization
export interface Notification {
  id: string;
  tenantId?: string;         // Tenant isolation
  userId: string;
  title: string;
  titleAr?: string;
  titleKu?: string;
  body: string;
  bodyAr?: string;
  bodyKu?: string;
  type: 'order' | 'shipping' | 'promo' | 'system' | 'chat' | 'promotion';
  relatedId?: string;        // For grouping (orderId, productId)
  data?: Record<string, any>;
  read: boolean;
  createdAt: Timestamp;
}

// Search and Filter Types
export interface SearchFilters {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  brand?: string;
  sortBy?: 'name' | 'price' | 'date' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// Theme Types
export interface Theme {
  dark: boolean;
  colors: {
    primary: string;
    primaryDark: string;
    primaryVariant: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    card: string;
    error: string;
    warning: string;
    success: string;
    text: string;
    textSecondary: string;
    textOnPrimary: string;
    border: string;
    placeholder: string;
    disabled: string;
    shadow: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  typography: {
    h1: {
      fontSize: number;
      fontWeight: string;
      lineHeight: number;
    };
    h2: {
      fontSize: number;
      fontWeight: string;
      lineHeight: number;
    };
    h3: {
      fontSize: number;
      fontWeight: string;
      lineHeight: number;
    };
    body: {
      fontSize: number;
      fontWeight: string;
      lineHeight: number;
    };
    caption: {
      fontSize: number;
      fontWeight: string;
      lineHeight: number;
    };
  };
}

// Payment Types
export interface PaymentConfig {
  method: 'cod' | 'qi' | 'fib';
  amount: number;
  currency: 'USD';
  orderId: string;
  callbackUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  errorMessage?: string;
  gatewayResponse?: any;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Image Upload Types
export interface ImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Navigation Types
export type RootStackParamList = {
  Welcome: undefined;
  Onboarding: undefined;
  Auth: undefined;
  Main: { screen?: string; params?: any } | undefined;
  Home: undefined;
  Categories: { selectedCategory?: string } | undefined;
  CategoryProducts: { category?: string; brand?: string; title?: string };
  Search: { 
    query?: string; 
    category?: string;
    preSelectedCategory?: string;
    categoryId?: string;
  } | undefined;
  BarcodeScanner: undefined;
  ProductDetails: { productId: string };
  StoreProducts: { tenantId: string };
  Favorites: undefined;
  Cart: undefined;
  Checkout: { 
    cart?: Cart;
    preselectedPaymentMethod?: string;
    preselectedAddressId?: string;
    specialInstructions?: string;
  } | undefined;
  OrderConfirmation: { orderId: string; orderNumber: string };
  QiCardPayment: { formUrl: string; paymentId: string; orderId: string; orderNumber: string };
  OrderDetail: { orderId: string };
  Profile: { screen?: string; params?: any } | undefined;
  Settings: undefined;
  Notifications: undefined;
  
  // Guest Login System: Auth screens accessible from main stack
  LoginGate: { reason?: 'checkout' | 'orders' | 'message' | 'address' | 'payment' | 'profile' } | undefined;
  SignIn: { requireAuth?: boolean; returnReason?: string } | undefined; // New luxury SignInScreen
  Login: { requireAuth?: boolean; returnReason?: string } | undefined; // PhoneLoginScreen (legacy)
  Password: { method: 'phone' | 'email'; identifier: string; returnReason?: string; requireAuth?: boolean };
  Register: { requireAuth?: boolean; returnReason?: string; method?: 'phone' | 'email'; email?: string } | undefined;
  ForgotPassword: undefined;
  VerifyPhone: {
    mode: 'register' | 'forgot_password' | 'admin-register' | 'partner-register' | 'fallback' | 'link' | 'otp-login';
    phone: string;
    name?: string; // Required for registration
    storeName?: string; // Required for admin registration
  };
  SetNewPassword: {
    mode: 'register' | 'reset' | 'admin-register' | 'partner-register';
    phone: string;
    name?: string; // Required for registration
    storeName?: string; // Required for admin registration
  };
  LegacyEmailLogin: undefined;
  AdminSignup: undefined;
  PartnerSignup: undefined;
  AdminVerifyEmail: { email: string };
  AdminStoreName: { method: 'phone' | 'email'; phone?: string; email?: string };
  AdminDetails: { method: 'phone' | 'email'; phone?: string; email?: string; storeName: string };
  AdminSecurity: { method: 'phone' | 'email'; phone?: string; email?: string; storeName: string; name: string; whatsapp?: string };
  AdminSuccess: { storeName?: string } | undefined;
  AboutYou: { method: 'phone' | 'email'; phone?: string; email?: string };
  RegisterSuccess: { method?: 'phone' | 'email' } | undefined;
  
  // Profile Stack Screens
  AccountSecurity: undefined;
  ConfirmIdentity: { returnTo?: string; action?: string };
  UpdateEmail: { reauthed?: boolean; action?: string } | undefined;
  UpdatePhone: { hasExisting?: boolean } | undefined;
  EditProfile: undefined;
  MyAddress: undefined;
  AddEditAddress: { address?: Address; mode?: 'add' | 'edit' } | undefined;
  // Second-hand phones. TradeInRequestScreen submits the questionnaire; MyTradeInsScreen
  // lists the customer's own requests and their offers (both registered in AppNavigator.tsx).
  TradeInRequest: undefined;
  MyTradeIns: undefined;
  GoogleMapsAddressPicker: {
    initialLocation?: { latitude: number; longitude: number };
    onAddressSelect?: (address: any) => void;
    title?: string;
  } | undefined;
  PaymentMethods: undefined;
  HelpSupport: undefined;
  Chatbot: undefined;
  Offers: undefined;
  StoreLocation: undefined;
  TermsAndConditions: undefined;
  PrivacyPolicy: undefined;
  ShippingInfo: undefined;
  ThemeCustomization: undefined;
  
  // Admin Screens
  AdminSendNotification: undefined;
  AdminBusinessInfo: undefined;
  AdminCurrencySettings: undefined;
  AdminOperatingHours: undefined;
  AdminAnalytics: undefined;
  AdminStockReport: undefined;
  AdminStoreLocations: undefined;
  AdminEditStoreLocation: { locationId?: string };
  AdminDiscounts: undefined;
  AdminEditDiscount: { discountId?: string };
  AdminStoreProfile: undefined;
  AdminInvoiceSettings: undefined;
  AdminCustomers: undefined;
  AdminPartnerManagement: undefined;
  AdminPartnerAssignment: { userId: string; userName: string; userEmail: string };
  AdminPartnerDashboard: { partnerUid?: string; partnerName?: string } | undefined;
  AdminInStoreOrders: { source?: 'in-store'; orderId?: string } | undefined;
  AdminCreateOrder: { partner?: { uid: string; name: string } } | undefined;
  AdminBannerManagement: undefined;
  AdminBrandManagement: undefined;
  AdminCategoryManagement: undefined;
  AdminPromoManagement: undefined;
  AdminChatScreen: { conversationId: string };
  
  // Chat Screens
  ChatScreen: { conversationId: string; adminId?: string; productId?: string; productName?: string; productImage?: string; productTitle?: string; adminName?: string; tenantId?: string; attachProduct?: boolean; isAdminView?: boolean; targetName?: string; targetPhone?: string };
  AdminConversationsListScreen: undefined;
  UserConversationsListScreen: undefined;
};

// Business Info Types
export interface BusinessInfo {
  name: string;
  address: string;
  phone: string;
  whatsapp?: string;
  email: string;
  website?: string;
  taxId?: string;
  description?: string;
  exchangeRateIQD?: number; // Configured USD to IQD exchange rate
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  updatedAt: Timestamp;
}

export interface DaySchedule {
  isOpen: boolean;
  openTime: string; // Format: "HH:mm"
  closeTime: string; // Format: "HH:mm"
}

export interface OperatingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
  updatedAt: Timestamp;
}

// ============ CHAT TYPES (Alibaba-style product chat) ============

/**
 * Conversation between a user and the admin who owns a product.
 * ID format: ${productId}_${userId}_${adminId}
 */
export interface Conversation {
  id: string;
  productId: string;
  userId: string;
  adminId: string;  // Derived from product.ownerAdminId at creation
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessage: {
    text: string;
    senderType: 'user' | 'admin';
    createdAt: Timestamp;
    type?: 'text' | 'image' | 'file' | 'product';
  } | null;
  unread: {
    user: number;   // Unread count for user
    admin: number;  // Unread count for admin
  };
  productSnapshot: {
    title: string;
    titleAr?: string;
    titleKu?: string;
    imageUrl?: string;
  };
  userSnapshot?: {
    name: string;
    phone?: string;
  };
  adminSnapshot?: {
    name: string;
  };
  // Alibaba: Store profile snapshot (for Inbox logo/name)
  storeSnapshot?: {
    storeName?: string;
    storeNameAr?: string;
    storeNameKu?: string;
    logoUrl?: string;
  };
  tenantId?: string;
  isBlocked?: boolean;  // Admin can block a user from messaging
  deletedBy?: {
    user?: boolean;        // User has soft-deleted this conversation
    userDeletedAt?: any;   // Timestamp of when user deleted (to hide old messages)
    admin?: boolean;       // Admin has soft-deleted (currently triggers hard delete)
  };
  archivedBy?: {
    user?: boolean;        // User archived: hidden from their main list, shown under "Archived"
    admin?: boolean;
  };
  labels?: {
    user?: string[];       // Label ids the user assigned (see constants/chatLabels)
    admin?: string[];
  };
}

/**
 * Chat message in a conversation.
 */
export interface Message {
  id: string;
  senderId: string;
  senderType: 'user' | 'admin';
  type: 'text' | 'image' | 'file' | 'product' | 'order' | 'voice';
  text: string;
  fileMetadata?: { name: string; size: number; mimeType: string } | null;
  createdAt: Timestamp;
  // ALIBABA VARIATION: Two-phase sending & read receipts
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  localUri?: string; // For optimistic UI rendering before upload completes
}

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  Login: undefined;
  Password: { method: 'phone' | 'email'; identifier: string };
  Register: undefined;
  ForgotPassword: undefined;
  AdminSignup: undefined;
  PartnerSignup: undefined;
  VerifyPhone: { phone: string };
};

export type MainTabParamList = {
  Home: undefined;
  Categories: undefined;
  Search: { 
    preSelectedCategory?: string;
    categoryId?: string;
  } | undefined;
  Cart: undefined;
  MessagesTab: undefined;
  Orders: undefined;
  Profile: undefined;
};

// Admin Navigation Types
export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminProducts: undefined;
  AdminOrders: { orderId?: string } | undefined;
  AdminConversations: undefined;
  AdminSettings: undefined;
};

export type AdminStackParamList = {
  AdminMain: undefined;
  AdminProductDetail: { productId: string };
  AdminOrderDetail: { orderId: string };
  AdminAnalytics: undefined;
  AdminNotifications: undefined;
  AdminLocationManager: undefined;
};

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
}

// Utility Types
export type Language = 'en' | 'ar' | 'ku';
export type Direction = 'ltr' | 'rtl';

export interface LocalizedString {
  en: string;
  ar: string;
  ku: string;
}

// Hook Return Types
export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData: Partial<User>) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export interface UseProductsReturn {
  products: Product[];
  loading: boolean;
  error: string | null;
  fetchProducts: (filters?: SearchFilters) => Promise<void>;
  searchProducts: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

export interface UseCartReturn {
  cart: Cart | null;
  loading: boolean;
  addToCart: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
}

export interface UseOrdersReturn {
  orders: Order[];
  loading: boolean;
  fetchOrders: () => Promise<void>;
  createOrder: (orderData: Partial<Order>) => Promise<string>;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
}
