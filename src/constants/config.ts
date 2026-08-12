// Store identity/contact now lives in ./brand — it must stay free of `process.env`
// so tests can import it (see the note in that file). Re-exported here so every
// existing `import { BRAND } from '.../constants/config'` keeps working unchanged.
export { BRAND, brandContact, contactBlock, contactBlockOr, CONTACT_FALLBACK } from './brand';
import { BRAND } from './brand';

// Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate Firebase config in development
if (__DEV__) {
  const missingFields = [];
  if (!firebaseConfig.apiKey) missingFields.push('apiKey');
  if (!firebaseConfig.authDomain) missingFields.push('authDomain');
  if (!firebaseConfig.projectId) missingFields.push('projectId');
  
  if (missingFields.length > 0) {
    // Production: console.warn removed
  }
}

export const FIREBASE_CONFIG = firebaseConfig;

// Supabase (primary backend) — client-safe values from env; placeholders until Phase 2 setup.
export const SUPABASE_CONFIG = {
  // Must be a VALID https URL so createClient() doesn't throw at boot; a real project
  // replaces it via EXPO_PUBLIC_SUPABASE_URL. Network calls to this host just fail gracefully.
  URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://replace-with-asankary.supabase.co',
  ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'replace_with_asankary_supabase_anon_key',
};

// Google Maps client key (Static Maps + native SDK). Empty until configured.
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Google Sign-In OAuth client IDs (from env).
//
// These fall back to '' — NOT to a placeholder string. A placeholder is worse than
// nothing here: GoogleSignin.configure() forwards iosClientId straight to the native
// GoogleSignIn SDK, where it OVERRIDES the valid CLIENT_ID that Firebase already read
// from GoogleService-Info.plist. The SDK then raises NSInvalidArgumentException on a
// malformed id and takes the app down the moment someone taps "Continue with Google".
// An empty value lets isGoogleAuthConfigured() below refuse the attempt in JS instead.
const asClientId = (value: string | undefined): string =>
  value && value.endsWith('.apps.googleusercontent.com') ? value : '';

export const GOOGLE_AUTH = {
  WEB_CLIENT_ID: asClientId(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  IOS_CLIENT_ID: asClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
};

/** True when a real Google OAuth web client id is present. */
export const isGoogleAuthConfigured = (): boolean => GOOGLE_AUTH.WEB_CLIENT_ID !== '';

// Firebase Cloud Functions base URL (region + project). Derived from the Firebase project id.
export const FIREBASE_PROJECT_ID =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'REPLACE_WITH_ASANKARY_FIREBASE_PROJECT_ID';
export const FIREBASE_FUNCTIONS_URL =
  process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL ||
  `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`;

// Where Supabase sends the user after they tap "confirm email".
//
// Must be an https URL, NOT the app's asankary:// scheme: the link is opened in
// whatever browser the recipient's mail client uses, often on a device that
// doesn't have the app installed, where a custom scheme resolves to nothing.
// The landing page deep-links into the app for those who do have it.
//
// This URL must also be listed under Redirect URLs in the Supabase dashboard
// (Authentication → URL Configuration), or Supabase silently falls back to the
// project's Site URL — which is how these links ended up pointing at localhost.
// verified.html does NOT exist on that site — it returns 404, so every email
// verification link landed the user on GitHub's "404 There isn't a GitHub Pages
// site here" page and the signup flow appeared broken. The site root is a real,
// live Asankary page (HTTP 200), so point there until a proper "email verified"
// page is published at .../verified.html, at which point restore that path.
export const EMAIL_VERIFY_REDIRECT_URL =
  process.env.EXPO_PUBLIC_EMAIL_VERIFY_REDIRECT_URL ||
  'https://asankarye-hub.github.io/asankary-legal/';

// QiCard card payments are OFF unless explicitly enabled.
//
// The integration is not production-ready: the documented gateway host is QiCard's
// UAT sandbox, the merchant return address is still the literal placeholder
// ASANKARY_DOMAIN_TBD, and the app watches for an "asankary://" return URL while the
// gateway is built to send back an https one — so a successful payment can never be
// detected and the shopper is left on a spinner having been charged.
//
// A payment method that is offered but cannot complete is a Guideline 2.1 rejection,
// and "New QiCard" was the FIRST option at checkout. Cash on Delivery and Money
// Exchanger are unaffected and remain available.
//
// To turn it back on: deploy the return-URL handler on a real domain, switch the
// QICARD_API_HOST secret to production, then set EXPO_PUBLIC_QI_CARD_ENABLED=true.
export const QI_CARD_ENABLED = process.env.EXPO_PUBLIC_QI_CARD_ENABLED === 'true';

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'https://your-cloud-functions-url.com',
  // WARNING: EXPO_PUBLIC_ exposes this to client code - use Cloud Function proxy in production
  IMGBB_API_KEY: process.env.EXPO_PUBLIC_IMGBB_API_KEY || process.env.IMGBB_API_KEY,
  IMGBB_API_URL: 'https://api.imgbb.com/1/upload',
  QI_API_KEY: process.env.QI_PAYMENT_API_KEY,
  FIB_API_KEY: process.env.FIB_PAYMENT_API_KEY,
};

// App Configuration
export const APP_CONFIG = {
  NAME: process.env.EXPO_PUBLIC_APP_NAME || BRAND.name,
  VERSION: process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0',
  SUPPORTED_LANGUAGES: ['en', 'ar', 'ku'] as const,
  DEFAULT_LANGUAGE: 'en' as const,
  CURRENCY: 'USD' as const,
  DEFAULT_REGION: 'Erbil',
  // DEFAULT_TENANT_ID: For single-tenant apps, customers use admin's tenantId to access products
  // Set this to your admin UID from Firebase Auth (the admin who created products)
  DEFAULT_TENANT_ID: process.env.EXPO_PUBLIC_DEFAULT_TENANT_ID || null,
};

// App Owner(s)
// The store owner is a normal admin in the DB (role='admin'); there is no DB-level
// "owner" flag, so the owner-only Partner Management tools are gated on these UIDs.
// Both accounts the owner uses are recognized:
//   a25f166b… — "Asankary Store", the main phone-login admin that owns the store/products
//   b99b3b5c… — TODO_CONTACT_EMAIL, the owner's personal account
export const OWNER_UIDS: string[] = [
  'a25f166b-c5b4-4cca-ae27-a593a1329f66',
  'b99b3b5c-6df1-4714-a5f9-16da05526805',
];

// The canonical store tenant that holds the catalog/orders the owner manages.
export const OWNER_STORE_TENANT_ID = 'a25f166b-c5b4-4cca-ae27-a593a1329f66';

export const isOwnerUid = (uid?: string | null): boolean => !!uid && OWNER_UIDS.includes(uid);

// Firestore Collection Names
export const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'parts',
  PRODUCT_VARIANTS: 'productVariants', // Variant system
  ORDERS: 'orders',
  CARTS: 'carts',
  NOTIFICATIONS: 'notifications',
  CATEGORIES: 'categories',
  BANNERS: 'banners',
  ADDRESSES: 'addresses',
  LOCATIONS: 'locations',
  DISCOUNTS: 'discounts',
} as const;

// Storage Paths
export const STORAGE_PATHS = {
  PRODUCT_IMAGES: 'products',
  USER_AVATARS: 'avatars',
  TEMP_UPLOADS: 'temp',
} as const;

// Pagination Constants - Optimized for performance
export const PAGINATION = {
  PRODUCTS_PER_PAGE: 10, // Reduced for faster loading
  ORDERS_PER_PAGE: 10,
  NOTIFICATIONS_PER_PAGE: 15,
} as const;

// Order Status Constants
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

// Payment Status Constants
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

// Payment Methods
export const PAYMENT_METHODS = {
  COD: 'cod',
  QI: 'qi',
  FIB: 'fib',
} as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  ORDER: 'order',
  PROMOTION: 'promotion',
  GENERAL: 'general',
} as const;

// Cache Keys
export const CACHE_KEYS = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  LOCATIONS: 'locations',
  USER_DATA: 'user_data',
  CART: 'cart',
  THEME: 'theme',
  LANGUAGE: 'language',
  ONBOARDING: 'onboarding_complete',
} as const;

// Cache Expiration Times (in milliseconds) - Optimized for performance
export const CACHE_EXPIRATION = {
  PRODUCTS: 10 * 60 * 1000, // 10 minutes (increased for better performance)
  CATEGORIES: 60 * 60 * 1000, // 1 hour (categories change less frequently)
  LOCATIONS: 2 * 60 * 60 * 1000, // 2 hours
  USER_DATA: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Image Upload Configuration
export const IMAGE_UPLOAD_CONFIG = {
  MAX_SIZE: 30 * 1024 * 1024, // 30MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  QUALITY: 0.8,
  MAX_WIDTH: 1200,
  MAX_HEIGHT: 1200,
} as const;

// Search Configuration
export const SEARCH_CONFIG = {
  MIN_QUERY_LENGTH: 2,
  DEBOUNCE_DELAY: 500,
  MAX_RECENT_SEARCHES: 5,
} as const;

// Animation Configuration
export const ANIMATION_CONFIG = {
  SPRING: {
    damping: 80,
    overshootClamping: false,
    restDisplacementThreshold: 0.1,
    restSpeedThreshold: 0.1,
    stiffness: 500,
  },
  TIMING: {
    duration: 300,
    useNativeDriver: true,
  },
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
  AUTH_FAILED: 'Authentication failed. Please check your credentials.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  WEAK_PASSWORD: 'Password must be at least 6 characters long.',
  USER_NOT_FOUND: 'User not found.',
  EMAIL_ALREADY_IN_USE: 'Email is already in use.',
  INVALID_PHONE: 'Please enter a valid phone number.',
  PRODUCT_OUT_OF_STOCK: 'This product is out of stock.',
  PAYMENT_FAILED: 'Payment failed. Please try again.',
  ORDER_NOT_FOUND: 'Order not found.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful!',
  REGISTER_SUCCESS: 'Account created successfully!',
  ORDER_PLACED: 'Order placed successfully!',
  PRODUCT_ADDED_TO_CART: 'Product added to cart!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  PASSWORD_RESET_SENT: 'Password reset email sent!',
} as const;

// Validation Rules
export const VALIDATION = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^(\+964|00964|0)?7[3-9]\d{8}$/,
  NAME_MIN_LENGTH: 2,
  PASSWORD_MIN_LENGTH: 6,
  PART_NUMBER_REGEX: /^[A-Z0-9-]{4,20}$/,
} as const;

// Kurdish regions in Iraq
export const KURDISH_REGIONS = [
  'Erbil',
  'Sulaymaniyah',
  'Dohuk',
  'Halabja',
  'Garmian',
  'Raparin',
  'Soran',
] as const;

// Iraqi cities (comprehensive list)
export const IRAQI_CITIES = [
  // Kurdistan - Erbil
  'Erbil', 'Shaqlawa', 'Koya', 'Soran', 'Mergasor', 'Choman', 'Makhmur', 'Pirmam', 'Bnaslawa',
  // Kurdistan - Sulaymaniyah
  'Sulaymaniyah', 'Halabja', 'Rania', 'Kalar', 'Chamchamal', 'Darbandikhan', 'Penjwin',
  'Sharbazher', 'Dokan', 'Said Sadiq', 'Qaradagh', 'Taq Taq', 'Mawat', 'Bazian',
  // Kurdistan - Duhok
  'Dohuk', 'Zakho', 'Akre', 'Amedi', 'Semel', 'Bardarash', 'Mangesh', 'Shekhan',
  // Kirkuk
  'Kirkuk', 'Hawija', 'Daquq', 'Tuz Khurmatu', 'Dibis', 'Kifri',
  // Nineveh
  'Mosul', 'Tal Afar', 'Sinjar', 'Tal Kayf', 'Hamdaniya',
  // Saladin
  'Tikrit', 'Samarra', 'Baiji', 'Balad',
  // Central & Southern
  'Baghdad', 'Basra', 'Najaf', 'Karbala', 'Hillah', 'Nasiriyah', 'Kut',
  'Amarah', 'Diwaniyah', 'Samawah', 'Fallujah', 'Ramadi', 'Baqubah',
] as const;
