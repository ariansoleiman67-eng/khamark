/**
 * Utility functions for handling product images with consistent fallback logic
 */

export interface ImageSource {
  imageUrls?: string[];
  images?: string[];
  category?: string;
  imageUrl?: string; // For order items
}

/**
 * Get category-specific placeholder images
 */
export const getCategoryPlaceholderImage = (category: string): string => {
  const categoryPlaceholders: Record<string, string> = {
    'Engine Parts': 'https://sircarpart.com/wp-content/uploads/2019/05/Download-Engine.png', // open engine bay
    'Brake System': 'https://fredsautorepair.com/wp-content/uploads/2018/07/car-disc-brake-cluster.jpg', // brake rotor
    'Transmission': 'https://www.xautomotive.com/cdn/shop/articles/xAutomotive-How-Transmission-work-xHP-Blog-Header.jpg?v=1718875197&width=1024', // drivetrain closeup
    'Electrical': 'https://www.patlabelsonline.co.uk/blog/wp-content/uploads/2015/08/shutterstock_96185378.jpg', // wiring harness
    'Suspension': 'https://acko-cms.s3.ap-south-1.amazonaws.com/large_car_suspensions_8d5beb6494.jpg', // wheel/suspension
    'Body Parts': 'https://sc04.alicdn.com/kf/H0585afa0ad12420dbdfa4f46a01ee49ff.png', // body panel
    'Interior': 'https://img.ccjdigital.com/files/base/randallreilly/all/image/2022/10/Peterbilt_SuperTruck_Interior.6358aeef1526c.png?auto=format%2Ccompress&fit=max&q=70&w=1200', // dash detail
    'Exterior': 'https://assets.volvo.com/is/image/VolvoInformationTechnologyAB/electric-landing-volvo-fh-aero-electric-cgi-exterior-side-2?qlt=82&wid=1440&ts=1706022161032&dpr=off&fit=constrain&fmt=png-alpha', // truck exterior
    'Filters': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT4V6HeTPl2gBr1hlDFBdnCoHXYd9OIwpOIyA&s', // filter/engine bay
    'Fluids': 'https://s18391.pcdn.co/wp-content/uploads/2022/06/Volvo-Hydrogen-fuel-cell-Truck-1400-copy.jpg', // oil/fluids
  };
  
  // Return category-specific placeholder or default auto parts image
  return categoryPlaceholders[category] || 'https://www.volvotrucks.com/content/dam/volvo-trucks/markets/master/p2764/trucks/models/volvo-fh/landing/some-image-volvo-fh-diesel-cgi-exterior.jpg';
};

/**
 * Get the primary image URL from various possible sources with fallback
 */
export const getProductImageUrl = (source: ImageSource): string => {
  // Try imageUrls array first (preferred)
  if (source.imageUrls && source.imageUrls.length > 0) {
    const url = source.imageUrls[0];
    if (url && url.trim() !== '') {
      return url;
    }
  }
  
  // Try images array (legacy)
  if (source.images && source.images.length > 0) {
    const url = source.images[0];
    if (url && url.trim() !== '') {
      return url;
    }
  }
  
  // Try single imageUrl field (for order items)
  if (source.imageUrl && source.imageUrl.trim() !== '') {
    return source.imageUrl;
  }
  
  // Return category-specific placeholder
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
  return `https://wsrv.nl/?url=${stripped}&w=${width}&output=webp&q=72&we`;
};

/**
 * Get all image URLs from various sources with fallbacks
 */
export const getProductImageUrls = (source: ImageSource): string[] => {
  let images: string[] = [];
  
  // Try imageUrls array first
  if (source.imageUrls && source.imageUrls.length > 0) {
    images = source.imageUrls.filter(url => url && url.trim() !== '');
  }
  
  // Try images array if no imageUrls
  if (images.length === 0 && source.images && source.images.length > 0) {
    images = source.images.filter(url => url && url.trim() !== '');
  }
  
  // If no images found, return placeholder
  if (images.length === 0) {
    images = [getCategoryPlaceholderImage(source.category || '')];
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
