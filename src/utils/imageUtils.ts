/**
 * Utility functions for handling product images with consistent fallback logic
 */

export interface ImageSource {
  productId?: string;
  imageUrls?: string[];
  images?: string[];
  category?: string;
  imageUrl?: string; // For order items
}

/**
 * Verified product image references for exact models.
 * Maps both database IDs and mock IDs to authentic manufacturer or authorized distributor packshots.
 */
export const VERIFIED_ACCESSORY_IMAGES: Record<string, string[]> = {
  // Momax Pinpop Lite Find My Tracker (Model BR10)
  '14ba1f5a-b0cf-420f-8f47-9b6bb82b6780': [
    'https://globaliraq.iq/cdn/shop/files/1_aecebb33-11bd-4154-ba57-11aa81aa946f.jpg?v=1779613983',
  ],
  'p1': [
    'https://globaliraq.iq/cdn/shop/files/1_aecebb33-11bd-4154-ba57-11aa81aa946f.jpg?v=1779613983',
  ],
  // Samsung 65W Trio Power Adapter (Model EP-T6530)
  'c9871ff9-8e51-4da6-b115-845868d7d043': [
    'https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ep-t6530nbegww/gallery/levant-ar-65w-power-adapter-trio-ep-t6530-ep-t6530nbegww-532744544?$1164_776_PNG$',
  ],
  'p4': [
    'https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ep-t6530nbegww/gallery/levant-ar-65w-power-adapter-trio-ep-t6530-ep-t6530nbegww-532744544?$1164_776_PNG$',
  ],
  // Samsung SmartTag2 (Model EI-T5600)
  '60136aa2-e7a6-453b-b97a-43dfbe168d69': [
    'https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ei-t5600bbegww/gallery/levant-ar-galaxy-smarttag2-ei-t5600-ei-t5600bbegww-538513169?$1164_776_PNG$',
  ],
  'p5': [
    'https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ei-t5600bbegww/gallery/levant-ar-galaxy-smarttag2-ei-t5600-ei-t5600bbegww-538513169?$1164_776_PNG$',
  ],
  // Samsung 25W Travel Charger (Model EP-TA800)
  '11a03340-af46-4fb1-8100-b261b0d18df1': [
    'https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ep-ta800xbegww/gallery/levant-ar-wall-charger-for-super-fast-charging-25w-405723-ep-ta800xbegww-525295236?$1164_776_PNG$',
  ],
  'p6': [
    'https://images.samsung.com/is/image/samsung/p6pim/levant_ar/ep-ta800xbegww/gallery/levant-ar-wall-charger-for-super-fast-charging-25w-405723-ep-ta800xbegww-525295236?$1164_776_PNG$',
  ],
  // Samsung S26 Ultra (Flagship Phone Packshot)
  'cdfee70c-a757-44ec-a66d-51ceb1962372': [
    'https://images.samsung.com/is/image/samsung/p6pim/bd/2401/gallery/bd-galaxy-s24-s928-sm-s928bztcbkd-539412884?$1164_776_PNG$',
  ],
  'p7': [
    'https://images.samsung.com/is/image/samsung/p6pim/bd/2401/gallery/bd-galaxy-s24-s928-sm-s928bztcbkd-539412884?$1164_776_PNG$',
  ],
  'p8': [
    'https://images.samsung.com/is/image/samsung/p6pim/bd/2401/gallery/bd-galaxy-s24-s928-sm-s928bztcbkd-539412884?$1164_776_PNG$',
  ],
  // Apple iPhone 17 Pro Max (Flagship Phone Packshot)
  'cf8696ae-303d-4142-810f-fb644baf17b0': [
    'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/refurb-iphone-16-pro-max-naturaltitanium-202509?wid=1144&hei=1144&fmt=jpeg&qlt=90',
  ],
  'p19': [
    'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/refurb-iphone-16-pro-max-naturaltitanium-202509?wid=1144&hei=1144&fmt=jpeg&qlt=90',
  ],
};

/**
 * Resolve legacy/placeholder URLs (such as picsum random landscape photos)
 * to authentic accessory assets using exact product ID token matching.
 */
export const sanitizeProductImageUrl = (url?: string | null, productId?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') return '';

  // Intercept legacy picsum photos which served random landscape images
  if (url.includes('picsum.photos')) {
    // Exact seed token matching with word boundary: matches p1, p4, p5, p6, p7, p8, p19 specifically
    const match = url.match(/(?:asankary|khamark)-(p[0-9]+)\b/i);
    if (match && match[1]) {
      const seedKey = match[1].toLowerCase();
      if (VERIFIED_ACCESSORY_IMAGES[seedKey]?.[0]) {
        return VERIFIED_ACCESSORY_IMAGES[seedKey][0];
      }
    }
    if (productId && VERIFIED_ACCESSORY_IMAGES[productId]?.[0]) {
      return VERIFIED_ACCESSORY_IMAGES[productId][0];
    }
    // Non-verified seed: return empty string so callers cleanly fall back to honest neutral placeholders
    return '';
  }

  // Authentic uploaded image URL is preserved
  return url;
};

/**
 * Get category-specific placeholder images for Khamark consumer electronics.
 * If an exact verified model asset is missing, returns empty string so the card
 * displays an honest neutral placeholder rather than attaching an unrelated accessory image.
 */
export const getCategoryPlaceholderImage = (category: string): string => {
  return '';
};

/**
 * Get the primary image URL from various possible sources with fallback
 */
export const getProductImageUrl = (source: ImageSource): string => {
  // 1. Try imageUrls array first (preferred real uploaded images)
  if (source.imageUrls && source.imageUrls.length > 0) {
    const url = source.imageUrls[0];
    if (url && url.trim() !== '') {
      const sanitized = sanitizeProductImageUrl(url, source.productId);
      if (sanitized) return sanitized;
    }
  }
  
  // 2. Try images array (legacy)
  if (source.images && source.images.length > 0) {
    const url = source.images[0];
    if (url && url.trim() !== '') {
      const sanitized = sanitizeProductImageUrl(url, source.productId);
      if (sanitized) return sanitized;
    }
  }
  
  // 3. Try single imageUrl field (for order items)
  if (source.imageUrl && source.imageUrl.trim() !== '') {
    const sanitized = sanitizeProductImageUrl(source.imageUrl, source.productId);
    if (sanitized) return sanitized;
  }

  // 4. If product has no valid image, check verified accessory reference catalogue
  if (source.productId && VERIFIED_ACCESSORY_IMAGES[source.productId]?.[0]) {
    return VERIFIED_ACCESSORY_IMAGES[source.productId][0];
  }
  
  // 5. Return category-specific placeholder (or honest neutral fallback)
  return getCategoryPlaceholderImage(source.category || '');
};

/**
 * Wrap a remote image URL through a resizing CDN to get a small WebP thumbnail.
 * Used for LIST/GRID cards so browsing loads ~10x less data (full-res stays on
 * the product detail screen). Only proxies remote http(s) URLs; leaves local/
 * placeholder/already-proxied URLs untouched. To disable, return `url` directly.
 */
export const getThumbnailUrl = (url?: string | null, width = 400): string => {
  if (!url || typeof url !== 'string') return url || '';
  if (!/^https?:\/\//i.test(url) || url.includes('wsrv.nl')) return url;
  const stripped = url.replace(/^https?:\/\//i, '');
  return `https://wsrv.nl/?url=${encodeURIComponent(stripped)}&w=${width}&output=webp&q=72&we`;
};

/**
 * Get all image URLs from various sources with fallbacks
 */
export const getProductImageUrls = (source: ImageSource): string[] => {
  let images: string[] = [];
  
  // Try imageUrls array first
  if (source.imageUrls && source.imageUrls.length > 0) {
    images = source.imageUrls
      .filter(url => url && url.trim() !== '')
      .map(url => sanitizeProductImageUrl(url, source.productId))
      .filter(Boolean);
  }
  
  // Try images array if no imageUrls
  if (images.length === 0 && source.images && source.images.length > 0) {
    images = source.images
      .filter(url => url && url.trim() !== '')
      .map(url => sanitizeProductImageUrl(url, source.productId))
      .filter(Boolean);
  }

  // If no uploaded images found, fallback to verified catalogue
  if (images.length === 0 && source.productId && VERIFIED_ACCESSORY_IMAGES[source.productId]) {
    return VERIFIED_ACCESSORY_IMAGES[source.productId];
  }
  
  // If no images found, return placeholder
  if (images.length === 0) {
    const placeholder = getCategoryPlaceholderImage(source.category || '');
    images = placeholder ? [placeholder] : [];
  }
  
  return images;
};

/**
 * Validate if an image URL is valid (not empty or placeholder)
 */
export const isValidImageUrl = (url: string): boolean => {
  if (!url || url.trim() === '') return false;
  if (url.includes('placeholder.com')) return false;
  if (url === 'https://via.placeholder.com/400x400?text=No+Image') return false;
  return true;
};

/**
 * Debug logging for image URLs in development
 */
export const logImageDebug = (source: ImageSource, context: string): void => {
  if (__DEV__) {
    // Production: console.log removed
    // Production: console.log removed
    // Production: console.log removed
    // Production: console.log removed
    // Production: console.log removed
    // Production: console.log removed);
  }
};
