import {
  getProductImageUrl,
  getProductImageUrls,
  sanitizeProductImageUrl,
  VERIFIED_ACCESSORY_IMAGES,
  getCategoryPlaceholderImage,
} from '../../src/utils/imageUtils';

describe('imageUtils accessory mapping and sanitization', () => {
  it('maps legacy picsum landscape URLs for Momax Pinpop Lite to authentic accessory image', () => {
    const legacyUrl = 'https://picsum.photos/seed/asankary-p1/600/600';
    const sanitized = sanitizeProductImageUrl(legacyUrl);
    expect(sanitized).toBe(VERIFIED_ACCESSORY_IMAGES['p1'][0]);
    expect(sanitized).toContain('globaliraq.iq');
  });

  it('maps legacy picsum landscape URLs for Samsung 65W power adapter to official Samsung image', () => {
    const legacyUrl = 'https://picsum.photos/seed/asankary-p4/600/600';
    const sanitized = sanitizeProductImageUrl(legacyUrl);
    expect(sanitized).toBe(VERIFIED_ACCESSORY_IMAGES['p4'][0]);
    expect(sanitized).toContain('images.samsung.com');
    expect(sanitized).toContain('ep-t6530');
  });

  it('maps legacy picsum URLs for Samsung SmartTag2 and 25W charger', () => {
    expect(sanitizeProductImageUrl('https://picsum.photos/seed/asankary-p5/600/600')).toBe(
      VERIFIED_ACCESSORY_IMAGES['p5'][0]
    );
    expect(sanitizeProductImageUrl('https://picsum.photos/seed/asankary-p6/600/600')).toBe(
      VERIFIED_ACCESSORY_IMAGES['p6'][0]
    );
  });

  it('prioritizes verified exact product ID over legacy image array', () => {
    const url = getProductImageUrl({
      productId: '14ba1f5a-b0cf-420f-8f47-9b6bb82b6780',
      imageUrls: ['https://picsum.photos/seed/asankary-p1/600/600'],
      category: 'Trackers',
    });
    expect(url).toBe(VERIFIED_ACCESSORY_IMAGES['14ba1f5a-b0cf-420f-8f47-9b6bb82b6780'][0]);
  });

  it('returns consistent gallery images for product detail screen matching card asset', () => {
    const gallery = getProductImageUrls({
      productId: 'c9871ff9-8e51-4da6-b115-845868d7d043',
      imageUrls: ['https://picsum.photos/seed/asankary-p4/600/600'],
      category: 'Chargers',
    });
    expect(gallery[0]).toBe(VERIFIED_ACCESSORY_IMAGES['c9871ff9-8e51-4da6-b115-845868d7d043'][0]);
  });

  it('provides honest neutral placeholder when exact image is missing rather than unrelated accessory', () => {
    expect(getCategoryPlaceholderImage('Trackers')).toBe('');
    expect(getCategoryPlaceholderImage('Chargers')).toBe('');
    expect(getCategoryPlaceholderImage('Phones')).toBe('');
  });

  it('strictly isolates seed tokens so p19 (iPhone 17 Pro Max) never matches p1 (Momax Tracker)', () => {
    const iphoneLegacyUrl = 'https://picsum.photos/seed/khamark-p19/600/600';
    const sanitized = sanitizeProductImageUrl(iphoneLegacyUrl);
    // Must map to iPhone packshot, NOT p1 Momax tracker
    expect(sanitized).toBe(VERIFIED_ACCESSORY_IMAGES['p19'][0]);
    expect(sanitized).not.toBe(VERIFIED_ACCESSORY_IMAGES['p1'][0]);
    expect(sanitized).toContain('cdn-apple.com');
  });

  it('maps p7 (Samsung S26 Ultra) to Galaxy phone packshot, never to a charger', () => {
    const s26LegacyUrl = 'https://picsum.photos/seed/khamark-p7/600/600';
    const sanitized = sanitizeProductImageUrl(s26LegacyUrl);
    expect(sanitized).toBe(VERIFIED_ACCESSORY_IMAGES['p7'][0]);
    expect(sanitized).not.toBe(VERIFIED_ACCESSORY_IMAGES['p4'][0]);
    expect(sanitized).toContain('galaxy-s24');
  });
});

